use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::{ROLE_FREEZER, ROLE_MASTER_AUTHORITY};
use crate::errors::StablecoinError;
use crate::events::{AccountFrozen, AccountThawed};
use crate::state::{RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), freezer.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), freezer.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn freeze_handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let mint = &ctx.accounts.mint;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_FREEZER),
        StablecoinError::Unauthorized
    );
    require!(config.mint == mint.key(), StablecoinError::Unauthorized);
    require!(
        ctx.accounts.target_ata.mint == mint.key(),
        StablecoinError::Unauthorized
    );

    let mint_key = mint.key();
    let signer_seeds: &[&[u8]] = &[b"stablecoin", mint_key.as_ref(), &[config.bump]];
    let signer_seeds_arr = [signer_seeds];
    let cpi_accounts = token_2022::FreezeAccount {
        account: ctx.accounts.target_ata.to_account_info(),
        mint: mint.to_account_info(),
        authority: config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        cpi_accounts,
        &signer_seeds_arr,
    );
    token_2022::freeze_account(cpi_ctx)?;

    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    emit!(AccountFrozen {
        config: config.key(),
        target_account: ctx.accounts.target_ata.key(),
        frozen_by: ctx.accounts.freezer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn thaw_handler(ctx: Context<ThawAccount>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let mint = &ctx.accounts.mint;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_FREEZER),
        StablecoinError::Unauthorized
    );
    require!(config.mint == mint.key(), StablecoinError::Unauthorized);
    require!(
        ctx.accounts.target_ata.mint == mint.key(),
        StablecoinError::Unauthorized
    );

    let mint_key = mint.key();
    let signer_seeds: &[&[u8]] = &[b"stablecoin", mint_key.as_ref(), &[config.bump]];
    let signer_seeds_arr = [signer_seeds];
    let cpi_accounts = token_2022::ThawAccount {
        account: ctx.accounts.target_ata.to_account_info(),
        mint: mint.to_account_info(),
        authority: config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        cpi_accounts,
        &signer_seeds_arr,
    );
    token_2022::thaw_account(cpi_ctx)?;

    config.audit_counter = config
        .audit_counter
        .checked_add(1)
        .ok_or(StablecoinError::Overflow)?;

    emit!(AccountThawed {
        config: config.key(),
        target_account: ctx.accounts.target_ata.key(),
        thawed_by: ctx.accounts.freezer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
