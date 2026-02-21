use anchor_lang::prelude::*;

use crate::constants::{ROLE_BLACKLISTER, ROLE_MASTER_AUTHORITY, ROLE_MINTER, ROLE_SEIZER};
use crate::errors::StablecoinError;
use crate::events::RoleUpdated;
use crate::state::{RoleAccount, StablecoinConfig};
use crate::utils::{has_any_role, require_valid_roles};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRolesArgs {
    pub target: Pubkey,
    pub roles: u8,
    pub mint_quota: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateMinterArgs {
    pub new_quota: u64,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + RoleAccount::INIT_SPACE,
        seeds = [b"role", config.key().as_ref(), target.key().as_ref()],
        bump
    )]
    pub target_role_account: Account<'info, RoleAccount>,

    pub target: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [b"role", config.key().as_ref(), target_role_account.authority.as_ref()],
        bump = target_role_account.bump
    )]
    pub target_role_account: Account<'info, RoleAccount>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub current_authority: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"role", config.key().as_ref(), current_authority.key().as_ref()],
        bump = current_role_account.bump
    )]
    pub current_role_account: Account<'info, RoleAccount>,

    #[account(
        init_if_needed,
        payer = current_authority,
        space = 8 + RoleAccount::INIT_SPACE,
        seeds = [b"role", config.key().as_ref(), new_authority.key().as_ref()],
        bump
    )]
    pub new_role_account: Account<'info, RoleAccount>,

    pub new_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(ctx: Context<UpdateRoles>, args: UpdateRolesArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY),
        StablecoinError::Unauthorized
    );
    require_valid_roles(args.roles)?;
    require!(
        args.target == ctx.accounts.target.key(),
        StablecoinError::Unauthorized
    );

    if !config.features.transfer_hook {
        require!(
            args.roles & (ROLE_BLACKLISTER | ROLE_SEIZER) == 0,
            StablecoinError::FeatureNotEnabled
        );
    }

    let target_role_account = &mut ctx.accounts.target_role_account;
    target_role_account.config = config.key();
    target_role_account.authority = ctx.accounts.target.key();
    target_role_account.roles = args.roles;
    if args.roles & ROLE_MINTER != 0 {
        target_role_account.mint_quota = args.mint_quota;
    } else {
        target_role_account.mint_quota = None;
    }
    target_role_account.minted_current_window = 0;
    target_role_account.window_start = 0;
    target_role_account.bump = *ctx.bumps.get("target_role_account").unwrap();

    emit!(RoleUpdated {
        config: config.key(),
        target: ctx.accounts.target.key(),
        new_roles: args.roles,
        updated_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn update_minter_handler(ctx: Context<UpdateMinter>, args: UpdateMinterArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let target_role_account = &mut ctx.accounts.target_role_account;

    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY),
        StablecoinError::Unauthorized
    );
    require!(
        target_role_account.roles & ROLE_MINTER != 0,
        StablecoinError::InvalidRoles
    );

    target_role_account.mint_quota = Some(args.new_quota);

    emit!(RoleUpdated {
        config: config.key(),
        target: target_role_account.authority,
        new_roles: target_role_account.roles,
        updated_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let current_role_account = &mut ctx.accounts.current_role_account;
    let new_role_account = &mut ctx.accounts.new_role_account;

    require!(
        current_role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(current_role_account.roles, ROLE_MASTER_AUTHORITY),
        StablecoinError::Unauthorized
    );
    require!(
        ctx.accounts.new_authority.key() != ctx.accounts.current_authority.key(),
        StablecoinError::SelfTransfer
    );

    current_role_account.roles &= !ROLE_MASTER_AUTHORITY;

    new_role_account.config = config.key();
    new_role_account.authority = ctx.accounts.new_authority.key();
    new_role_account.roles |= ROLE_MASTER_AUTHORITY;
    new_role_account.bump = *ctx.bumps.get("new_role_account").unwrap();

    config.authority = ctx.accounts.new_authority.key();

    emit!(crate::events::AuthorityTransferred {
        config: config.key(),
        old_authority: ctx.accounts.current_authority.key(),
        new_authority: ctx.accounts.new_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
