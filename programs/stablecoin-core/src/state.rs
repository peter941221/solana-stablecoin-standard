use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub audit_counter: u64,
    pub features: FeatureFlags,
    pub transfer_hook_program: Option<Pubkey>,
    pub bump: u8,
}

impl StablecoinConfig {
    pub const INIT_SPACE: usize = 512;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct FeatureFlags {
    pub permanent_delegate: bool,
    pub transfer_hook: bool,
    pub confidential: bool,
    pub default_frozen: bool,
}

#[account]
pub struct RoleAccount {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub roles: u8,
    pub mint_quota: Option<u64>,
    pub minted_current_window: u64,
    pub window_start: i64,
    pub bump: u8,
}

impl RoleAccount {
    pub const INIT_SPACE: usize = 256;
}

#[account]
pub struct BlacklistEntry {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub reason: String,
    pub is_active: bool,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const INIT_SPACE: usize = 320;
}
