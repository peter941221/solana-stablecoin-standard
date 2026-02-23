use anchor_lang::prelude::*;

use crate::constants::{MAX_REASON_LEN, ROLE_BLACKLISTER, ROLE_MASTER_AUTHORITY};
use crate::errors::StablecoinError;
use crate::events::{BlacklistAdded, BlacklistRemoved};
use crate::state::{BlacklistEntry, RoleAccount, StablecoinConfig};
use crate::utils::has_any_role;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AddToBlacklistArgs {
    pub wallet: Pubkey,
    pub reason: String,
}

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(
        init_if_needed,
        payer = blacklister,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [b"blacklist", config.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: Verified against args.wallet before use.
    pub wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    pub blacklister: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump = role_account.bump
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, args: AddToBlacklistArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let entry = &mut ctx.accounts.blacklist_entry;

    require!(
        config.features.transfer_hook,
        StablecoinError::FeatureNotEnabled
    );
    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_BLACKLISTER),
        StablecoinError::Unauthorized
    );
    require!(
        args.reason.len() <= MAX_REASON_LEN,
        StablecoinError::ReasonTooLong
    );
    require!(
        args.wallet == ctx.accounts.wallet.key(),
        StablecoinError::Unauthorized
    );

    if entry.config != Pubkey::default() {
        require!(entry.config == config.key(), StablecoinError::Unauthorized);
    }

    if entry.is_active {
        return err!(StablecoinError::AlreadyBlacklisted);
    }

    entry.config = config.key();
    entry.wallet = args.wallet;
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.blacklisted_by = ctx.accounts.blacklister.key();
    entry.reason = args.reason;
    entry.is_active = true;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistAdded {
        config: config.key(),
        wallet: entry.wallet,
        reason: entry.reason.clone(),
        blacklisted_by: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_account = &ctx.accounts.role_account;
    let entry = &mut ctx.accounts.blacklist_entry;

    require!(
        config.features.transfer_hook,
        StablecoinError::FeatureNotEnabled
    );
    require!(
        role_account.config == config.key(),
        StablecoinError::Unauthorized
    );
    require!(
        has_any_role(role_account.roles, ROLE_MASTER_AUTHORITY | ROLE_BLACKLISTER),
        StablecoinError::Unauthorized
    );
    require!(entry.config == config.key(), StablecoinError::Unauthorized);

    if !entry.is_active {
        return err!(StablecoinError::NotBlacklisted);
    }

    entry.is_active = false;

    emit!(BlacklistRemoved {
        config: config.key(),
        wallet: entry.wallet,
        removed_by: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
