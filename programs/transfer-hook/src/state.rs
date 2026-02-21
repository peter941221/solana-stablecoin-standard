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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct FeatureFlags {
    pub permanent_delegate: bool,
    pub transfer_hook: bool,
    pub confidential: bool,
    pub default_frozen: bool,
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
