use anchor_lang::prelude::*;
use spl_transfer_hook_interface::{
    get_extra_account_metas_address,
    instruction::ExecuteInstruction,
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_type_length_value::state::TlvStateBorrowed;

mod errors;
mod state;

declare_id!("SSSHook1111111111111111111111111111111111");

const STABLECOIN_CORE_PROGRAM_ID: Pubkey =
    Pubkey::from_str_const("SSSCore1111111111111111111111111111111111");

const SOURCE_TOKEN_ACCOUNT_INDEX: u8 = 0;
const MINT_ACCOUNT_INDEX: u8 = 1;
const DESTINATION_TOKEN_ACCOUNT_INDEX: u8 = 2;
const CORE_PROGRAM_INDEX: u8 = 5;
const CONFIG_ACCOUNT_INDEX: u8 = 6;
const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;
const TOKEN_ACCOUNT_OWNER_LENGTH: u8 = 32;

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        require!(
            ctx.accounts.extra_account_metas.owner == &crate::ID,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        let expected_extra_metas =
            get_extra_account_metas_address(ctx.accounts.mint.key, &crate::ID);
        require!(
            ctx.accounts.extra_account_metas.key() == expected_extra_metas,
            errors::TransferHookError::InvalidExtraAccountMetas
        );

        let expected_extra_account_metas = build_expected_extra_account_metas()?;
        let extra_metas_data = ctx.accounts.extra_account_metas.data.borrow();
        let tlv_state = TlvStateBorrowed::unpack(&extra_metas_data)
            .map_err(|_| error!(errors::TransferHookError::InvalidExtraAccountMetas))?;
        let actual_extra_account_metas =
            ExtraAccountMetaList::unpack_with_tlv_state::<ExecuteInstruction>(&tlv_state)
                .map_err(|_| error!(errors::TransferHookError::InvalidExtraAccountMetas))?;
        require!(
            actual_extra_account_metas.len() == expected_extra_account_metas.len(),
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        for (actual, expected) in actual_extra_account_metas
            .iter()
            .zip(expected_extra_account_metas.iter())
        {
            require!(
                actual == expected,
                errors::TransferHookError::InvalidExtraAccountMetas
            );
        }

        require!(
            ctx.accounts.stablecoin_core_program.key() == STABLECOIN_CORE_PROGRAM_ID,
            errors::TransferHookError::InvalidCoreProgram
        );

        require!(
            ctx.accounts.stablecoin_config.owner == &STABLECOIN_CORE_PROGRAM_ID,
            errors::TransferHookError::InvalidConfig
        );

        let config = deserialize_config(&ctx.accounts.stablecoin_config)?;
        require!(
            config.features.transfer_hook,
            errors::TransferHookError::FeatureNotEnabled
        );
        require!(
            config.transfer_hook_program == Some(crate::ID),
            errors::TransferHookError::InvalidHookProgram
        );
        require!(
            config.mint == *ctx.accounts.mint.key,
            errors::TransferHookError::InvalidConfig
        );

        if !ctx.accounts.source_blacklist_entry.data_is_empty() {
            require!(
                ctx.accounts.source_blacklist_entry.owner == &STABLECOIN_CORE_PROGRAM_ID,
                errors::TransferHookError::InvalidBlacklistEntry
            );
        }
        if !ctx.accounts.destination_blacklist_entry.data_is_empty() {
            require!(
                ctx.accounts.destination_blacklist_entry.owner == &STABLECOIN_CORE_PROGRAM_ID,
                errors::TransferHookError::InvalidBlacklistEntry
            );
        }

        check_blacklist(&ctx.accounts.source_blacklist_entry)?;
        check_blacklist(&ctx.accounts.destination_blacklist_entry)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    pub source_token_account: UncheckedAccount<'info>,
    pub mint: UncheckedAccount<'info>,
    pub destination_token_account: UncheckedAccount<'info>,
    pub source_owner: UncheckedAccount<'info>,
    pub extra_account_metas: UncheckedAccount<'info>,
    pub stablecoin_core_program: UncheckedAccount<'info>,
    pub stablecoin_config: UncheckedAccount<'info>,
    pub source_blacklist_entry: UncheckedAccount<'info>,
    pub destination_blacklist_entry: UncheckedAccount<'info>,
}

fn build_expected_extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    let core_program_meta =
        ExtraAccountMeta::new_with_pubkey(&STABLECOIN_CORE_PROGRAM_ID, false, false)?;
    let config_meta = ExtraAccountMeta::new_external_pda_with_seeds(
        CORE_PROGRAM_INDEX,
        &[
            Seed::Literal {
                bytes: b"stablecoin".to_vec(),
            },
            Seed::AccountKey {
                index: MINT_ACCOUNT_INDEX,
            },
        ],
        false,
        false,
    )?;
    let source_blacklist_meta = ExtraAccountMeta::new_external_pda_with_seeds(
        CORE_PROGRAM_INDEX,
        &[
            Seed::Literal {
                bytes: b"blacklist".to_vec(),
            },
            Seed::AccountKey {
                index: CONFIG_ACCOUNT_INDEX,
            },
            Seed::AccountData {
                account_index: SOURCE_TOKEN_ACCOUNT_INDEX,
                data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
                length: TOKEN_ACCOUNT_OWNER_LENGTH,
            },
        ],
        false,
        false,
    )?;
    let destination_blacklist_meta = ExtraAccountMeta::new_external_pda_with_seeds(
        CORE_PROGRAM_INDEX,
        &[
            Seed::Literal {
                bytes: b"blacklist".to_vec(),
            },
            Seed::AccountKey {
                index: CONFIG_ACCOUNT_INDEX,
            },
            Seed::AccountData {
                account_index: DESTINATION_TOKEN_ACCOUNT_INDEX,
                data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
                length: TOKEN_ACCOUNT_OWNER_LENGTH,
            },
        ],
        false,
        false,
    )?;

    Ok(vec![
        core_program_meta,
        config_meta,
        source_blacklist_meta,
        destination_blacklist_meta,
    ])
}

fn deserialize_config(account: &AccountInfo) -> Result<state::StablecoinConfig> {
    let mut data = account.data.borrow();
    let mut slice: &[u8] = &data;
    state::StablecoinConfig::try_deserialize(&mut slice)
}

fn check_blacklist(account: &AccountInfo) -> Result<()> {
    if account.data_is_empty() {
        return Ok(());
    }

    let mut data = account.data.borrow();
    let mut slice: &[u8] = &data;
    let entry = state::BlacklistEntry::try_deserialize(&mut slice)?;
    if entry.is_active {
        return err!(errors::TransferHookError::TransferDenied);
    }
    Ok(())
}
