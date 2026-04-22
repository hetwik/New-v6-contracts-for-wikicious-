# Notes: Major liquidity pools + yield vault setup

This release adds:
- `safe-postdeploy-liquidity-pools-major-mainnet.json`
- `safe-postdeploy-yield-vaults-major-mainnet.json`

## Important pre-checks

1. **Safe USDC balance**
   - `WikiLP.createPool` charges `500 USDC` per pool.
   - The major batch creates 6 pools, so Safe needs at least `3000 USDC`.

2. **Duplicate pool risk**
   - `createPool` reverts if pool already exists.
   - If some pools already exist, remove duplicates before execution.

3. **Owner/timelock path**
   - Yield vault config calls are owner-gated; execute from current owner path (Safe or timelock).

4. **Strategy compatibility**
   - Added YieldAggregator strategies assume target vaults expose expected deposit/APY interfaces.

## If Safe shows GS013 on this batch

- Most common cause here: insufficient USDC in Safe for pool creation fees and/or trying to recreate an existing pool.
- Run:
  - `npm run prepare:liquidity:pools -- <YOUR_SAFE_ADDRESS> safe-postdeploy-liquidity-pools-major-mainnet.json retry`
- The script checks existing pools, recalculates required fee, and outputs a filtered retry file.

- If only yield-vault txs are executed (before LP creation), run:
  - `npm run check:liquidity:yield:mainnet -- --yield-only`
