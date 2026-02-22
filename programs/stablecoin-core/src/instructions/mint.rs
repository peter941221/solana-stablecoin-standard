use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount},
};

use crate::constants::{MINT_QUOTA_WINDOW_SECONDS, ROLE_MASTER_AUTHORITY, ROLE_MINTER};
use crate::errors::StablecoinError;
use crate::events::TokensMinted;
use crate::state::{RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), minter.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub recipient: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_2022_program
    )]
    pub recipient_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &mut ctx.accounts.role_account;
    let mint = &ctx.accounts.mint;

    require!(!config.is_paused, StablecoinError::SystemPaused);
    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_MINTER),
        StablecoinError::Unauthorized
    );
    require!(config.mint == mint.key(), StablecoinError::Unauthorized);
    require!(
        ctx.accounts.recipient_ata.mint == mint.key(),
        StablecoinError::Unauthorized
    );
    require!(
        ctx.accounts.recipient_ata.owner == ctx.accounts.recipient.key(),
        StablecoinError::Unauthorized
    );

    if let Some(quota) = role_account.mint_quota {
        let now = Clock::get()?.unix_timestamp;
        if role_account.window_start == 0
            || now.saturating_sub(role_account.window_start) >= MINT_QUOTA_WINDOW_SECONDS
        {
            role_account.window_start = now;
            role_account.minted_current_window = 0;
        }

        let new_window_total = role_account
            .minted_current_window
            .checked_add(amount)
            .ok_or(StablecoinError::Overflow)?;
        require!(new_window_total <= quota, StablecoinError::QuotaExceeded);
        role_account.minted_current_window = new_window_total;
    }

    let mint_key = mint.key();
    let signer_seeds: &[&[u8]] = &[b"stablecoin", mint_key.as_ref(), &[config.bump]];
    let signer_seeds_arr = [signer_seeds];
    let cpi_accounts = token_2022::MintTo {
        mint: mint.to_account_info(),
        to: ctx.accounts.recipient_ata.to_account_info(),
        authority: config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        cpi_accounts,
        &signer_seeds_arr,
    );
    token_2022::mint_to(cpi_ctx, amount)?;

    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;
    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    let new_total_supply = mint
        .supply
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;

    emit!(TokensMinted {
        config: config.key(),
        mint: mint.key(),
        recipient: ctx.accounts.recipient.key(),
        amount,
        minter: ctx.accounts.minter.key(),
        new_total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
