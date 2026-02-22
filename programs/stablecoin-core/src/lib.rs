#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;
mod utils;

use crate::instructions::blacklist::{AddToBlacklist, RemoveFromBlacklist};
use crate::instructions::burn::Burn;
use crate::instructions::freeze::{FreezeAccount, ThawAccount};
use crate::instructions::initialize::Initialize;
use crate::instructions::mint::MintTokens;
use crate::instructions::pause::{Pause, Unpause};
use crate::instructions::roles::{TransferAuthority, UpdateMinter, UpdateRoles};
use crate::instructions::seize::Seize;

use crate::instructions::blacklist::__client_accounts_add_to_blacklist;
use crate::instructions::blacklist::__client_accounts_remove_from_blacklist;
use crate::instructions::burn::__client_accounts_burn;
use crate::instructions::freeze::__client_accounts_freeze_account;
use crate::instructions::freeze::__client_accounts_thaw_account;
use crate::instructions::initialize::__client_accounts_initialize;
use crate::instructions::mint::__client_accounts_mint_tokens;
use crate::instructions::pause::__client_accounts_pause;
use crate::instructions::pause::__client_accounts_unpause;
use crate::instructions::roles::__client_accounts_transfer_authority;
use crate::instructions::roles::__client_accounts_update_minter;
use crate::instructions::roles::__client_accounts_update_roles;
use crate::instructions::seize::__client_accounts_seize;

declare_id!("Ak9Rhow3tv2Df5u1ZVFWXqdUqeXynjGAhHGZ8qN4dJ6G");

#[program]
pub mod stablecoin_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        args: instructions::initialize::InitializeArgs,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        args: instructions::roles::UpdateRolesArgs,
    ) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, args)
    }

    pub fn update_minter(
        ctx: Context<UpdateMinter>,
        args: instructions::roles::UpdateMinterArgs,
    ) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, args)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        args: instructions::blacklist::AddToBlacklistArgs,
    ) -> Result<()> {
        instructions::blacklist::add_handler(ctx, args)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
