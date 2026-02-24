use anchor_lang::prelude::*;

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer denied by blacklist")]
    TransferDenied,

    #[msg("Transfer hook feature not enabled")]
    FeatureNotEnabled,

    #[msg("Invalid extra account metas account")]
    InvalidExtraAccountMetas,

    #[msg("Invalid stablecoin core program account")]
    InvalidCoreProgram,

    #[msg("Invalid stablecoin config account")]
    InvalidConfig,

    #[msg("Invalid transfer hook program id")]
    InvalidHookProgram,

    #[msg("Invalid blacklist entry account")]
    InvalidBlacklistEntry,
}
