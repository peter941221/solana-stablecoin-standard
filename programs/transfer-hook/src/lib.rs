#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    entrypoint, entrypoint::ProgramResult, program::invoke_signed, program_error::ProgramError,
    system_instruction, system_program,
};
use spl_tlv_account_resolution::account::ExtraAccountMeta;
use spl_tlv_account_resolution::state::ExtraAccountMetaList;
use spl_transfer_hook_interface::collect_extra_account_metas_signer_seeds;
use spl_transfer_hook_interface::get_extra_account_metas_address;
use spl_transfer_hook_interface::get_extra_account_metas_address_and_bump_seed;
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};
use std::str::FromStr;

mod errors;
mod state;

declare_id!("5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB");

#[cfg(feature = "idl-build")]
#[program]
pub mod transfer_hook {
    use super::*;

    pub fn idl_noop(_ctx: Context<IdlNoop>) -> Result<()> {
        Ok(())
    }
}

#[cfg(feature = "idl-build")]
#[derive(Accounts)]
pub struct IdlNoop {}

fn stablecoin_core_program_id() -> Pubkey {
    Pubkey::from_str("5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ")
        .expect("valid stablecoin core program id")
}

entrypoint!(process_instruction);

pub fn process_instruction<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    process_instruction_inner(program_id, accounts, instruction_data).map_err(Into::into)
}

fn process_instruction_inner<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> Result<()> {
    let instruction = TransferHookInstruction::unpack(instruction_data)
        .map_err(|_| errors::TransferHookError::InvalidExtraAccountMetas)?;

    match instruction {
        TransferHookInstruction::Execute { .. } => {
            let accounts = ExecuteAccounts::parse(accounts)?;
            execute_handler(program_id, &accounts, instruction_data)
        }
        TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas,
        } => {
            let accounts = InitializeAccounts::parse(accounts)?;
            initialize_extra_account_metas(program_id, &accounts, &extra_account_metas)
        }
        TransferHookInstruction::UpdateExtraAccountMetaList {
            extra_account_metas,
        } => {
            let accounts = UpdateAccounts::parse(accounts)?;
            update_extra_account_metas(program_id, &accounts, &extra_account_metas)
        }
    }
}

struct ExecuteAccounts<'info> {
    source_token_account: &'info AccountInfo<'info>,
    mint: &'info AccountInfo<'info>,
    destination_token_account: &'info AccountInfo<'info>,
    source_owner: &'info AccountInfo<'info>,
    extra_account_metas: &'info AccountInfo<'info>,
    stablecoin_core_program: &'info AccountInfo<'info>,
    stablecoin_config: &'info AccountInfo<'info>,
    source_blacklist_entry: &'info AccountInfo<'info>,
    destination_blacklist_entry: &'info AccountInfo<'info>,
    transfer_hook_program: &'info AccountInfo<'info>,
}

impl<'info> ExecuteAccounts<'info> {
    fn parse(accounts: &'info [AccountInfo<'info>]) -> Result<Self> {
        require!(
            accounts.len() >= 10,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        Ok(Self {
            source_token_account: &accounts[0],
            mint: &accounts[1],
            destination_token_account: &accounts[2],
            source_owner: &accounts[3],
            extra_account_metas: &accounts[4],
            stablecoin_core_program: &accounts[5],
            stablecoin_config: &accounts[6],
            source_blacklist_entry: &accounts[7],
            destination_blacklist_entry: &accounts[8],
            transfer_hook_program: &accounts[9],
        })
    }
}

struct InitializeAccounts<'info> {
    extra_account_metas: &'info AccountInfo<'info>,
    mint: &'info AccountInfo<'info>,
    authority: &'info AccountInfo<'info>,
    system_program: &'info AccountInfo<'info>,
}

impl<'info> InitializeAccounts<'info> {
    fn parse(accounts: &'info [AccountInfo<'info>]) -> Result<Self> {
        require!(
            accounts.len() >= 4,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        Ok(Self {
            extra_account_metas: &accounts[0],
            mint: &accounts[1],
            authority: &accounts[2],
            system_program: &accounts[3],
        })
    }
}

struct UpdateAccounts<'info> {
    extra_account_metas: &'info AccountInfo<'info>,
    mint: &'info AccountInfo<'info>,
    authority: &'info AccountInfo<'info>,
}

impl<'info> UpdateAccounts<'info> {
    fn parse(accounts: &'info [AccountInfo<'info>]) -> Result<Self> {
        require!(
            accounts.len() >= 3,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        Ok(Self {
            extra_account_metas: &accounts[0],
            mint: &accounts[1],
            authority: &accounts[2],
        })
    }
}

fn execute_handler(
    program_id: &Pubkey,
    accounts: &ExecuteAccounts,
    instruction_data: &[u8],
) -> Result<()> {
    require!(
        accounts.extra_account_metas.owner == program_id,
        errors::TransferHookError::InvalidExtraAccountMetas
    );
    let expected_extra_metas = get_extra_account_metas_address(accounts.mint.key, program_id);
    require!(
        accounts.extra_account_metas.key == &expected_extra_metas,
        errors::TransferHookError::InvalidExtraAccountMetas
    );

    let core_program_id = stablecoin_core_program_id();
    require!(
        accounts.stablecoin_core_program.key == &core_program_id,
        errors::TransferHookError::InvalidCoreProgram
    );

    require!(
        accounts.stablecoin_config.owner == &core_program_id,
        errors::TransferHookError::InvalidConfig
    );

    let config = deserialize_config(accounts.stablecoin_config)?;
    require!(
        config.features.transfer_hook,
        errors::TransferHookError::FeatureNotEnabled
    );
    require!(
        config.transfer_hook_program == Some(*program_id),
        errors::TransferHookError::InvalidHookProgram
    );
    require!(
        config.mint == *accounts.mint.key,
        errors::TransferHookError::InvalidConfig
    );

    if !accounts.source_blacklist_entry.data_is_empty() {
        require!(
            accounts.source_blacklist_entry.owner == &core_program_id,
            errors::TransferHookError::InvalidBlacklistEntry
        );
    }
    if !accounts.destination_blacklist_entry.data_is_empty() {
        require!(
            accounts.destination_blacklist_entry.owner == &core_program_id,
            errors::TransferHookError::InvalidBlacklistEntry
        );
    }

    validate_extra_account_metas(accounts, instruction_data, program_id)?;

    let is_core_authority = accounts.source_owner.key == accounts.stablecoin_config.key;
    if !is_core_authority {
        check_blacklist(accounts.source_blacklist_entry)?;
        check_blacklist(accounts.destination_blacklist_entry)?;
    }

    Ok(())
}

fn initialize_extra_account_metas(
    program_id: &Pubkey,
    accounts: &InitializeAccounts,
    extra_account_metas: &[ExtraAccountMeta],
) -> Result<()> {
    if !accounts.authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }
    require!(
        accounts.system_program.key == &system_program::ID,
        errors::TransferHookError::InvalidExtraAccountMetas
    );

    let (expected, bump) =
        get_extra_account_metas_address_and_bump_seed(accounts.mint.key, program_id);
    require!(
        accounts.extra_account_metas.key == &expected,
        errors::TransferHookError::InvalidExtraAccountMetas
    );

    let required_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
    if accounts.extra_account_metas.owner != program_id {
        require!(
            accounts.extra_account_metas.owner == &system_program::ID,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(required_size);
        let bump_seed = [bump];
        let signer_seeds = collect_extra_account_metas_signer_seeds(accounts.mint.key, &bump_seed);
        let signer_seeds_arr = [&signer_seeds[..]];

        let create_ix = system_instruction::create_account(
            accounts.authority.key,
            accounts.extra_account_metas.key,
            lamports,
            required_size as u64,
            program_id,
        );
        invoke_signed(
            &create_ix,
            &[
                accounts.authority.clone(),
                accounts.extra_account_metas.clone(),
                accounts.system_program.clone(),
            ],
            &signer_seeds_arr,
        )?;
    } else {
        require!(
            accounts.extra_account_metas.data_len() >= required_size,
            errors::TransferHookError::InvalidExtraAccountMetas
        );
    }

    let mut data = accounts.extra_account_metas.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, extra_account_metas)
        .map_err(|_| errors::TransferHookError::InvalidExtraAccountMetas)?;
    Ok(())
}

fn update_extra_account_metas(
    program_id: &Pubkey,
    accounts: &UpdateAccounts,
    extra_account_metas: &[ExtraAccountMeta],
) -> Result<()> {
    if !accounts.authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature.into());
    }
    let expected = get_extra_account_metas_address(accounts.mint.key, program_id);
    require!(
        accounts.extra_account_metas.key == &expected,
        errors::TransferHookError::InvalidExtraAccountMetas
    );
    require!(
        accounts.extra_account_metas.owner == program_id,
        errors::TransferHookError::InvalidExtraAccountMetas
    );

    let required_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
    require!(
        accounts.extra_account_metas.data_len() >= required_size,
        errors::TransferHookError::InvalidExtraAccountMetas
    );

    let mut data = accounts.extra_account_metas.try_borrow_mut_data()?;
    ExtraAccountMetaList::update::<ExecuteInstruction>(&mut data, extra_account_metas)
        .map_err(|_| errors::TransferHookError::InvalidExtraAccountMetas)?;
    Ok(())
}

fn validate_extra_account_metas(
    accounts: &ExecuteAccounts,
    instruction_data: &[u8],
    program_id: &Pubkey,
) -> Result<()> {
    let account_infos = vec![
        accounts.source_token_account.clone(),
        accounts.mint.clone(),
        accounts.destination_token_account.clone(),
        accounts.source_owner.clone(),
        accounts.extra_account_metas.clone(),
        accounts.stablecoin_core_program.clone(),
        accounts.stablecoin_config.clone(),
        accounts.source_blacklist_entry.clone(),
        accounts.destination_blacklist_entry.clone(),
        accounts.transfer_hook_program.clone(),
    ];
    let data = accounts.extra_account_metas.try_borrow_data()?;
    ExtraAccountMetaList::check_account_infos::<ExecuteInstruction>(
        &account_infos,
        instruction_data,
        program_id,
        &data,
    )
    .map_err(|_| errors::TransferHookError::InvalidExtraAccountMetas)?;
    Ok(())
}

fn deserialize_config(account: &AccountInfo) -> Result<state::StablecoinConfig> {
    let data = account.data.borrow();
    let mut slice: &[u8] = &data;
    state::StablecoinConfig::try_deserialize(&mut slice)
}

fn check_blacklist(account: &AccountInfo) -> Result<()> {
    if account.data_is_empty() {
        return Ok(());
    }

    let data = account.data.borrow();
    let mut slice: &[u8] = &data;
    let entry = state::BlacklistEntry::try_deserialize(&mut slice)?;
    if entry.is_active {
        return err!(errors::TransferHookError::TransferDenied);
    }
    Ok(())
}
