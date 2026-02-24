use anchor_lang::prelude::*;

use crate::constants::{ROLE_MASTER_AUTHORITY, ROLE_PAUSER};
use crate::errors::StablecoinError;
use crate::events::{SystemPaused, SystemUnpaused};
use crate::state::{RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), pauser.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub pauser: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), pauser.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_PAUSER),
        StablecoinError::Unauthorized
    );

    config.is_paused = true;
    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    emit!(SystemPaused {
        config: config.key(),
        paused_by: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_PAUSER),
        StablecoinError::Unauthorized
    );

    config.is_paused = false;
    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    emit!(SystemUnpaused {
        config: config.key(),
        unpaused_by: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
