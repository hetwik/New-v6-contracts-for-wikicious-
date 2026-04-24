# Notes: Staking + Options Vault major setup

Files:
- `safe-postdeploy-staking-options-major-mainnet.json`
- `safe-postdeploy-staking-options-major-mainnet-calldata.json`

## Included
- `WikiStaking`: `setTimelock`, `setEmissionRate`, and 2 `addPool` calls (WIK + USDC).
- `WikiOptionsVault`: `setTimelock`, `setIdleYieldRouter`, `setManager` and 3 `createVault` calls.

## Important
- `addPool` will revert if you re-add the same token/pool setup.
- Ensure staking contract has enough WIK inventory before enabling high emissions.
- If ownership has moved to timelock, execute through timelock path.
- Review management/performance fee BPS and vault metadata before execution.
