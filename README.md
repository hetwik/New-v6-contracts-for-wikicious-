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


## Keeper bot setup (automated)

After deploy/post-wiring, set your keeper wallet in `.env`:

```env
KEEPER_BOT_WALLET=0xYourKeeperWallet
```

Run:

```bash
npm run keeper:testnet
# or
npm run keeper:mainnet
```

What it does:
- auto-loads the right deployment file for the target network
- scans deployed contracts and tries keeper setter methods (`setKeeper(address,bool)`, `setKeeper(address)`, `setKeeperBot(address)`)
- skips contracts that don't expose keeper setters
- writes a full report to `keeper-setup.json`

## Mainnet retry helpers

If some contracts failed to deploy during mainnet deploy, retry known failed deployments from the latest `deployments.arbitrum_one*.json` file:

```bash
npm run deploy:retry:mainnet
```

If post-wiring keeper setup needs a retry on mainnet:

```bash
npm run wiring:retry:mainnet
```

Notes:
- `deploy:retry:mainnet` auto-loads the mainnet deployment file and retries contracts listed in `failedContracts`/`deployFailures` for supported recipes.
- Unsupported failed contracts are kept in `failedContracts` so you can handle them manually later.

Optional post-deploy env vars used by `deploy-all.js` wiring:
- `ENABLE_POST_DEPLOY_WIRING` (`true` by default, set `false` to skip)
- `OPS_WALLET` (defaults to deployer)
- `RESERVE_WALLET` (defaults to deployer)
- `GENESIS_SAFE_ADDRESS` (if set, ownership transfer is attempted)
