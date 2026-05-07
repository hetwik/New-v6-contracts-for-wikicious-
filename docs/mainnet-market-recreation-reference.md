# Mainnet Market Recreation Reference

## Confirmed reserve policy

For recreated Perp markets, use:

- `virtualQuoteReserve = 1e13` (10,000,000 USDC with 6 decimals)
- `virtualBaseReserve = (1e13 * 1e18) / targetPrice_1e6`

This must be set at `createMarket` time.

## GMX mapping calldata source

Use the prebuilt Safe batches in this repo:

- `safe-postdeploy-gmx-routing-mainnet.json`
- `safe-postdeploy-gmx-routing-expand-13-mainnet.json`

If you need additional candidates, start from:

- `safe-postdeploy-gmx-routing-next13-candidates-mainnet.json`
- `safe-postdeploy-gmx-routing-unmapped-core48-mainnet.json`

Then generate final mapping calldata with:

```bash
node scripts/build-gmx-routing-batch.js <input.json> <label>
```

## Oracle feed sources used by batch tooling

- Chainlink defaults are defined in `scripts/generate-safe-oracle-batch.js` (`DEFAULT_CHAINLINK_FEEDS`).
- Pyth defaults are defined in `scripts/generate-safe-oracle-batch.js` (`DEFAULT_PYTH_IDS`).
- Extended Pyth map lives in `scripts/pyth_feeds.js` and should be validated for 32-byte hex IDs before use.

To generate the Safe oracle batch:

```bash
npm run safe:oracle:batch:mainnet
```
