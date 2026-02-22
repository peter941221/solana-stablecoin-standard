use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{default_account_state, metadata_pointer, transfer_hook, ExtensionType},
    instruction as token_2022_instruction,
    state::{AccountState, Mint as Token2022Mint},
};
use anchor_spl::token_2022::Token2022;
use spl_pod::optional_keys::OptionalNonZeroPubkey;
use spl_tlv_account_resolution::account::ExtraAccountMeta;
use spl_tlv_account_resolution::seeds::Seed;
use spl_token_metadata_interface::instruction as token_metadata_instruction;
use spl_token_metadata_interface::state::TokenMetadata;
use spl_transfer_hook_interface::{
    get_extra_account_metas_address, instruction as transfer_hook_instruction,
};
use spl_type_length_value::variable_len_pack::VariableLenPack;

use crate::constants::{MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN, ROLE_MASTER_AUTHORITY};
use crate::errors::StablecoinError;
use crate::events::StablecoinInitialized;
use crate::state::{FeatureFlags, RoleAccount, StablecoinConfig};

const SOURCE_TOKEN_ACCOUNT_INDEX: u8 = 0;
const MINT_ACCOUNT_INDEX: u8 = 1;
const DESTINATION_TOKEN_ACCOUNT_INDEX: u8 = 2;
const CORE_PROGRAM_INDEX: u8 = 5;
const CONFIG_ACCOUNT_INDEX: u8 = 6;
const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;
const TOKEN_ACCOUNT_OWNER_LENGTH: u8 = 32;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + RoleAccount::INIT_SPACE,
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub extra_metas_account: Option<UncheckedAccount<'info>>,

    pub transfer_hook_program: Option<UncheckedAccount<'info>>,

    pub token_2022_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,

    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(
        args.name.len() <= MAX_NAME_LEN,
        StablecoinError::NameTooLong
    );
    require!(
        args.symbol.len() <= MAX_SYMBOL_LEN,
        StablecoinError::SymbolTooLong
    );
    require!(args.uri.len() <= MAX_URI_LEN, StablecoinError::UriTooLong);

    if args.enable_transfer_hook {
        require!(
            args.transfer_hook_program.is_some(),
            StablecoinError::InvalidTransferHookProgram
        );
    }

    let mint_key = ctx.accounts.mint.key();
    let token_program_id = ctx.accounts.token_2022_program.key();
    let config_key = ctx.accounts.config.key();
    let config_bump = ctx.bumps.config;
    let config_seeds: &[&[u8]] = &[b"stablecoin", mint_key.as_ref(), &[config_bump]];

    let mut extensions = vec![
        ExtensionType::MintCloseAuthority,
        ExtensionType::MetadataPointer,
    ];
    if args.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if args.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if args.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let token_metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(config_key))?,
        mint: mint_key,
        name: args.name.clone(),
        symbol: args.symbol.clone(),
        uri: args.uri.clone(),
        additional_metadata: vec![],
    };

    let base_len = ExtensionType::try_calculate_account_len::<Token2022Mint>(&extensions)?;
    let metadata_len = token_metadata.get_packed_len()?.saturating_add(4);
    let mint_len = base_len
        .checked_add(metadata_len)
        .ok_or(StablecoinError::Overflow)?;

    let lamports = Rent::get()?.minimum_balance(mint_len);
    let create_accounts = system_program::CreateAccount {
        from: ctx.accounts.authority.to_account_info(),
        to: ctx.accounts.mint.to_account_info(),
    };
    let create_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        create_accounts,
    );
    system_program::create_account(create_ctx, lamports, mint_len as u64, &token_program_id)?;

    let mint_info = ctx.accounts.mint.to_account_info();
    let token_program_info = ctx.accounts.token_2022_program.to_account_info();

    let close_ix = token_2022_instruction::initialize_mint_close_authority(
        &token_program_id,
        &mint_key,
        Some(&config_key),
    )?;
    invoke(&close_ix, &[mint_info.clone(), token_program_info.clone()])?;

    let metadata_pointer_ix = metadata_pointer::instruction::initialize(
        &token_program_id,
        &mint_key,
        Some(config_key),
        Some(mint_key),
    )?;
    invoke(
        &metadata_pointer_ix,
        &[mint_info.clone(), token_program_info.clone()],
    )?;

    if args.enable_permanent_delegate {
        let delegate_ix = token_2022_instruction::initialize_permanent_delegate(
            &token_program_id,
            &mint_key,
            &config_key,
        )?;
        invoke(
            &delegate_ix,
            &[mint_info.clone(), token_program_info.clone()],
        )?;
    }

    if args.enable_transfer_hook {
        let hook_program_id = args.transfer_hook_program.unwrap();
        let hook_ix = transfer_hook::instruction::initialize(
            &token_program_id,
            &mint_key,
            Some(config_key),
            Some(hook_program_id),
        )?;
        invoke(&hook_ix, &[mint_info.clone(), token_program_info.clone()])?;
    }

    if args.default_account_frozen {
        let default_state_ix =
            default_account_state::instruction::initialize_default_account_state(
                &token_program_id,
                &mint_key,
                &AccountState::Frozen,
            )?;
        invoke(
            &default_state_ix,
            &[mint_info.clone(), token_program_info.clone()],
        )?;
    }

    let mint_ix = token_2022_instruction::initialize_mint2(
        &token_program_id,
        &mint_key,
        &config_key,
        Some(&config_key),
        args.decimals,
    )?;
    invoke(&mint_ix, &[mint_info.clone(), token_program_info.clone()])?;

    let metadata_ix = token_metadata_instruction::initialize(
        &token_program_id,
        &mint_key,
        &config_key,
        &mint_key,
        &config_key,
        args.name.clone(),
        args.symbol.clone(),
        args.uri.clone(),
    );
    let config_info = ctx.accounts.config.to_account_info();

    invoke_signed(
        &metadata_ix,
        &[
            mint_info.clone(),
            config_info.clone(),
            mint_info.clone(),
            config_info.clone(),
            token_program_info.clone(),
        ],
        &[config_seeds],
    )?;

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = mint_key;
    config.name = args.name;
    config.symbol = args.symbol;
    config.uri = args.uri;
    config.decimals = args.decimals;
    config.is_paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.audit_counter = 0;
    config.features = FeatureFlags {
        permanent_delegate: args.enable_permanent_delegate,
        transfer_hook: args.enable_transfer_hook,
        confidential: false,
        default_frozen: args.default_account_frozen,
    };
    config.transfer_hook_program = if args.enable_transfer_hook {
        args.transfer_hook_program
    } else {
        None
    };
    config.bump = config_bump;

    let role_account = &mut ctx.accounts.role_account;
    role_account.config = config.key();
    role_account.authority = ctx.accounts.authority.key();
    role_account.roles = ROLE_MASTER_AUTHORITY;
    role_account.mint_quota = None;
    role_account.minted_current_window = 0;
    role_account.window_start = 0;
    role_account.bump = ctx.bumps.role_account;

    if args.enable_transfer_hook {
        let hook_program_account = ctx
            .accounts
            .transfer_hook_program
            .as_ref()
            .ok_or(StablecoinError::InvalidTransferHookProgram)?;
        let extra_metas_account = ctx
            .accounts
            .extra_metas_account
            .as_ref()
            .ok_or(StablecoinError::MissingExtraAccountMetas)?;
        require!(
            Some(hook_program_account.key()) == args.transfer_hook_program,
            StablecoinError::InvalidTransferHookProgram
        );

        let expected_extra_metas =
            get_extra_account_metas_address(&mint_key, &hook_program_account.key());
        require!(
            extra_metas_account.key() == expected_extra_metas,
            StablecoinError::InvalidExtraAccountMetas
        );

        let extra_account_metas = build_extra_account_metas()?;
        let extra_metas_ix = transfer_hook_instruction::initialize_extra_account_meta_list(
            &hook_program_account.key(),
            &expected_extra_metas,
            &mint_key,
            &config_key,
            &extra_account_metas,
        );
        invoke_signed(
            &extra_metas_ix,
            &[
                extra_metas_account.to_account_info(),
                mint_info.clone(),
                config_info.clone(),
                ctx.accounts.system_program.to_account_info(),
                hook_program_account.to_account_info(),
            ],
            &[config_seeds],
        )?;
    }

    let preset = if args.enable_transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };

    emit!(StablecoinInitialized {
        config: config.key(),
        mint: mint_key,
        authority: ctx.accounts.authority.key(),
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        preset: preset.to_string(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn build_extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    let core_program_meta = ExtraAccountMeta::new_with_pubkey(&crate::ID, false, false)?;
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
