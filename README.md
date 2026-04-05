# New-v6-contracts-for-wikicious-

New v6 contracts for wikicious.

## Deployment troubleshooting

If deploy fails with `resolveName` or `EXT_* is not a valid hex address`, one of your env values is malformed.

Checklist:
- Address must start with `0x`
- Address must contain exactly 40 hex characters after `0x`
- No extra characters like `g-z`, spaces, commas, or quotes inside the value

Example:
```env
EXT_SEQ_FEED=0xFdB631F5EE196F0ed6FAa767959853A9F217697D
```

Run deploy again after fixing the env value:
```bash
npm run deploy:testnet
```
## Mainnet Deployment (Arbitrum One)

1. Fill `.env` with all required values (`DEPLOYER_PRIVATE_KEY`, `ALCHEMY_ARBITRUM_URL`, and all `EXT_*` addresses).
2. Run preflight:
   ```bash
   npm run deploy:mainnet:check
   ```
3. If preflight passes, deploy:
   ```bash
   npm run deploy:mainnet
   ```
   This runs `scripts/deploy.js` (full phase-by-phase parity: deploy + full wiring + setup).

If you want heuristic auto-deploy mode instead (faster iteration):
```bash
npm run deploy:all
```

Optional post-deploy env vars used by `deploy-all.js` wiring:
- `ENABLE_POST_DEPLOY_WIRING` (`true` by default, set `false` to skip)
- `OPS_WALLET` (defaults to deployer)
- `RESERVE_WALLET` (defaults to deployer)
- `GENESIS_SAFE_ADDRESS` (if set, ownership transfer is attempted)
