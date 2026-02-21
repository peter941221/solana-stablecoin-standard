use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;
mod utils;

declare_id!("SSSCore1111111111111111111111111111111111");

#[program]
pub mod stablecoin_core {
    use super::*;

    pub fn initialize(
        ctx: Context<instructions::initialize::Initialize>,
        args: instructions::initialize::InitializeArgs,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    pub fn mint(ctx: Context<instructions::mint::Mint>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn(ctx: Context<instructions::burn::Burn>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<instructions::freeze::FreezeAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<instructions::freeze::ThawAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<instructions::pause::Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<instructions::pause::Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    pub fn update_roles(
        ctx: Context<instructions::roles::UpdateRoles>,
        args: instructions::roles::UpdateRolesArgs,
    ) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, args)
    }

    pub fn update_minter(
        ctx: Context<instructions::roles::UpdateMinter>,
        args: instructions::roles::UpdateMinterArgs,
    ) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, args)
    }

    pub fn transfer_authority(ctx: Context<instructions::roles::TransferAuthority>) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<instructions::blacklist::AddToBlacklist>,
        args: instructions::blacklist::AddToBlacklistArgs,
    ) -> Result<()> {
        instructions::blacklist::add_handler(ctx, args)
    }

    pub fn remove_from_blacklist(
        ctx: Context<instructions::blacklist::RemoveFromBlacklist>,
    ) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    pub fn seize(ctx: Context<instructions::seize::Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
