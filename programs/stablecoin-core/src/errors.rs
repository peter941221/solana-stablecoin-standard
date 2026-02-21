use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Caller does not have the required role")]
    Unauthorized,

    #[msg("This feature was not enabled during initialization")]
    FeatureNotEnabled,

    #[msg("System is paused")]
    SystemPaused,

    #[msg("Minting quota exceeded for current window")]
    QuotaExceeded,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Account must be frozen before seizure")]
    AccountNotFrozen,

    #[msg("Target must be blacklisted before seizure")]
    TargetNotBlacklisted,

    #[msg("Name exceeds maximum length of 32 characters")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length of 10 characters")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length of 200 characters")]
    UriTooLong,

    #[msg("Transfer hook program must be provided when enabled")]
    InvalidTransferHookProgram,

    #[msg("Missing extra account metas PDA")]
    MissingExtraAccountMetas,

    #[msg("Extra account metas PDA does not match expected address")]
    InvalidExtraAccountMetas,

    #[msg("Reason exceeds maximum length of 128 characters")]
    ReasonTooLong,

    #[msg("Invalid role bitmask")]
    InvalidRoles,

    #[msg("Cannot transfer authority to self")]
    SelfTransfer,

    #[msg("Insufficient token balance")]
    InsufficientBalance,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Account is frozen and cannot perform this action")]
    AccountFrozen,
}
