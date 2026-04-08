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

### 1) Fill `.env`
Provide all required values:
- `DEPLOYER_PRIVATE_KEY`
- `ALCHEMY_ARBITRUM_URL`
- `ETHERSCAN_API_KEY`
- all `EXT_*` integration addresses
- `GENESIS_SAFE_ADDRESS`

Use `wikicious-v6-mainnet.env.txt` as the template source.

### 2) Run static readiness checks
```bash
npm run mainnet:readiness
```
This verifies:
- no skipped/focused tests (`.skip` / `.only`)
- no TODO/FIXME/HACK markers in contracts and scripts
- optimizer/viaIR + chainId mainnet settings in Hardhat config
- mainnet review/docs files are present

### 3) Run RPC/env preflight
```bash
npm run deploy:mainnet:check
```
This verifies:
- required env vars exist
- address format and zero-address protection
- no duplicate integration addresses
- RPC is Arbitrum One (`chainId=42161`)
- external integration addresses have bytecode on-chain
- deployer nonce/balance are visible

### 4) Execute gated deployment
```bash
npm run deploy:mainnet
```
This now runs readiness + preflight automatically before executing `scripts/deploy.js` on `arbitrum_one`.

If you want just the gates without deploying:
```bash
npm run deploy:mainnet:ready
```

If you want heuristic auto-deploy mode instead (faster iteration):
```bash
npm run deploy:all
```

Optional post-deploy env vars used by `deploy-all.js` wiring:
- `ENABLE_POST_DEPLOY_WIRING` (`true` by default, set `false` to skip)
- `OPS_WALLET` (defaults to deployer)
- `RESERVE_WALLET` (defaults to deployer)
- `GENESIS_SAFE_ADDRESS` (if set, ownership transfer is attempted)
