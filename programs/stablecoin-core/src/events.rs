use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub preset: String,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub new_total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub new_total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub target_account: Pubkey,
    pub frozen_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub target_account: Pubkey,
    pub thawed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SystemPaused {
    pub config: Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SystemUnpaused {
    pub config: Pubkey,
    pub unpaused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleUpdated {
    pub config: Pubkey,
    pub target: Pubkey,
    pub new_roles: u8,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistAdded {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistRemoved {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from_account: Pubkey,
    pub to_account: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
    pub timestamp: i64,
}
