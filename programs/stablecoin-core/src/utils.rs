use anchor_lang::prelude::*;

use crate::constants::VALID_ROLE_MASK;
use crate::errors::StablecoinError;

pub fn has_any_role(roles: u8, mask: u8) -> bool {
    roles & mask != 0
}

pub fn require_valid_roles(roles: u8) -> Result<()> {
    require!(roles & !VALID_ROLE_MASK == 0, StablecoinError::InvalidRoles);
    Ok(())
}
