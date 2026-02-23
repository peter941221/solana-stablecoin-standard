# Operations

## Mint and Burn SOP

1. Verify caller holds MASTER_AUTHORITY or MINTER.

2. Ensure system is not paused.

3. Submit mint or burn transaction.

4. Record signature and updated supply.

## Freeze and Thaw SOP

1. Verify caller holds MASTER_AUTHORITY or FREEZER.

2. Confirm token account belongs to target mint.

3. Submit freeze or thaw transaction.

4. Record event signature.

## Pause and Unpause SOP

1. Verify caller holds MASTER_AUTHORITY or PAUSER.

2. Pause to block mint and burn.

3. Unpause after incident resolved.

4. Record event signature.

## Blacklist SOP (SSS-2)

1. Verify transfer hook is enabled.

2. Verify caller holds MASTER_AUTHORITY or BLACKLISTER.

3. Add or remove blacklist entry.

4. Record event signature and reason.

## Seize SOP (SSS-2)

1. Verify permanent delegate is enabled.

2. Verify target account is frozen and blacklisted.

3. Submit seizure transaction to treasury ATA.

4. Record event signature and amount.

## Role Management SOP

1. Only MASTER_AUTHORITY can grant or revoke roles.

2. Use update_roles with a clear audit reason.

3. Revoke unused roles regularly.
