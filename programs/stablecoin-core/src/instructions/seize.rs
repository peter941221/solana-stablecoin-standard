use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::instruction as token_2022_instruction;
use anchor_spl::token_2022::spl_token_2022::state::AccountState;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::{ROLE_MASTER_AUTHORITY, ROLE_SEIZER};
use crate::errors::StablecoinError;
use crate::events::TokensSeized;
use crate::state::{BlacklistEntry, RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), seizer.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,

    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: Transfer hook extra account metas PDA.
    pub extra_metas_account: UncheckedAccount<'info>,

    /// CHECK: Stablecoin core program id for transfer hook validation.
    #[account(address = crate::ID)]
    pub stablecoin_core_program: UncheckedAccount<'info>,

    /// CHECK: Destination blacklist entry PDA (may be empty).
    pub destination_blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: Transfer hook program for the mint.
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Seize>) -> Result<()> {
    let config_info = ctx.accounts.config.to_account_info();
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let mint = &ctx.accounts.mint;
    let target_ata = &ctx.accounts.target_ata;
    let blacklist_entry = &ctx.accounts.blacklist_entry;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_SEIZER),
        StablecoinError::Unauthorized
    );
    require!(
        config.features.permanent_delegate,
        StablecoinError::FeatureNotEnabled
    );
    require!(
        blacklist_entry.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        blacklist_entry.is_active,
        StablecoinError::TargetNotBlacklisted
    );
    require!(
        blacklist_entry.wallet == target_ata.owner,
        StablecoinError::Unauthorized
    );
    require!(target_ata.mint == mint.key(), StablecoinError::Unauthorized);
    require!(
        target_ata.state == AccountState::Frozen,
        StablecoinError::AccountNotFrozen
    );
    require!(config.mint == mint.key(), StablecoinError::Unauthorized);

    let amount = target_ata.amount;

    let mint_key = mint.key();
    let signer_seeds: &[&[u8]] = &[b"stablecoin", mint_key.as_ref(), &[config.bump]];
    let signer_seeds_arr = [signer_seeds];
    let transfer_account_infos = vec![
        target_ata.to_account_info(),
        mint.to_account_info(),
        ctx.accounts.treasury_ata.to_account_info(),
        config.to_account_info(),
        ctx.accounts.extra_metas_account.to_account_info(),
        ctx.accounts.stablecoin_core_program.to_account_info(),
        config_info.clone(),
        ctx.accounts.blacklist_entry.to_account_info(),
        ctx.accounts.destination_blacklist_entry.to_account_info(),
        ctx.accounts.transfer_hook_program.to_account_info(),
    ];
    let mut transfer_ix = token_2022_instruction::transfer_checked(
        ctx.accounts.token_2022_program.key,
        target_ata.to_account_info().key,
        mint.to_account_info().key,
        ctx.accounts.treasury_ata.to_account_info().key,
        config.to_account_info().key,
        &[],
        amount,
        mint.decimals,
    )?;
    transfer_ix.accounts.extend([
        AccountMeta::new_readonly(ctx.accounts.extra_metas_account.key(), false),
        AccountMeta::new_readonly(ctx.accounts.stablecoin_core_program.key(), false),
        AccountMeta::new_readonly(config_info.key(), false),
        AccountMeta::new_readonly(ctx.accounts.blacklist_entry.key(), false),
        AccountMeta::new_readonly(ctx.accounts.destination_blacklist_entry.key(), false),
        AccountMeta::new_readonly(ctx.accounts.transfer_hook_program.key(), false),
    ]);
    let thaw_accounts = token_2022::ThawAccount {
        account: target_ata.to_account_info(),
        mint: mint.to_account_info(),
        authority: config.to_account_info(),
    };
    let thaw_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        thaw_accounts,
        &signer_seeds_arr,
    );
    token_2022::thaw_account(thaw_ctx)?;
    invoke_signed(&transfer_ix, &transfer_account_infos, &signer_seeds_arr)?;
    let freeze_accounts = token_2022::FreezeAccount {
        account: target_ata.to_account_info(),
        mint: mint.to_account_info(),
        authority: config.to_account_info(),
    };
    let freeze_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        freeze_accounts,
        &signer_seeds_arr,
    );
    token_2022::freeze_account(freeze_ctx)?;

    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    emit!(TokensSeized {
        config: config.key(),
        from_account: target_ata.key(),
        to_account: ctx.accounts.treasury_ata.key(),
        amount,
        seized_by: ctx.accounts.seizer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
