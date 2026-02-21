use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Mint, Token2022, TokenAccount};

use crate::constants::{ROLE_BURNER, ROLE_MASTER_AUTHORITY};
use crate::errors::StablecoinError;
use crate::events::TokensBurned;
use crate::state::{RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(Accounts)]
pub struct Burn<'info> {
    pub burner: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), burner.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub burner_ata: Account<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Burn>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let mint = &ctx.accounts.mint;
    let burner_ata = &ctx.accounts.burner_ata;

    require!(!config.is_paused, StablecoinError::SystemPaused);
    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_BURNER),
        StablecoinError::Unauthorized
    );
    require!(config.mint == mint.key(), StablecoinError::Unauthorized);
    require!(burner_ata.mint == mint.key(), StablecoinError::Unauthorized);
    require!(
        burner_ata.owner == ctx.accounts.burner.key(),
        StablecoinError::Unauthorized
    );
    require!(
        burner_ata.amount >= amount,
        StablecoinError::InsufficientBalance
    );

    let cpi_accounts = token_2022::Burn {
        mint: mint.to_account_info(),
        from: burner_ata.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_2022_program.to_account_info(),
        cpi_accounts,
    );
    token_2022::burn(cpi_ctx, amount)?;

    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;
    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    let new_total_supply = mint
        .supply
        .checked_sub(amount)
        .ok_or(StablecoinError::Overflow)?;

    emit!(TokensBurned {
        config: config.key(),
        mint: mint.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        new_total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
