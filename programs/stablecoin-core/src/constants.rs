pub const ROLE_MASTER_AUTHORITY: u8 = 0x01;
pub const ROLE_MINTER: u8 = 0x02;
pub const ROLE_BURNER: u8 = 0x04;
pub const ROLE_FREEZER: u8 = 0x08;
pub const ROLE_PAUSER: u8 = 0x10;
pub const ROLE_BLACKLISTER: u8 = 0x20;
pub const ROLE_SEIZER: u8 = 0x40;

pub const VALID_ROLE_MASK: u8 = 0x7F;

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 128;

pub const MINT_QUOTA_WINDOW_SECONDS: i64 = 86_400;
