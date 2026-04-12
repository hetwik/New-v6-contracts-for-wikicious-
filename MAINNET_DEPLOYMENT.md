# Mainnet Deployment Runbook (Arbitrum One)

## 1) Environment setup
1. Copy `.env.example` to `.env`.
2. Fill all required values, especially:
   - `DEPLOYER_PRIVATE_KEY`
   - `ALCHEMY_ARBITRUM_URL`
   - `GENESIS_SAFE_ADDRESS`
   - `DEPLOY_CONFIRM_MAINNET=YES` (only right before deployment)
3. Keep canonical Arbitrum One external addresses unless you intentionally override and set `ALLOW_NON_CANONICAL_EXT=1`.

## 2) Mandatory preflight
Run:

```bash
npm run deploy:mainnet:check
```

This validates:
- Required env vars are present.
- Deployer key format is correct.
- Canonical external addresses are configured (unless override flag is explicitly set).
- RPC chain id is `42161`.
- `GENESIS_SAFE_ADDRESS` is valid and not equal to deployer.
- `DEPLOY_CONFIRM_MAINNET` is explicitly acknowledged (`YES`).

## 3) Readiness scan
Run:

```bash
npm run mainnet:readiness
```

This scans for known unsafe/deprecated patterns before deployment.

## 4) Deploy
Run:

```bash
npm run deploy:mainnet
```

The deployment script has additional guards and will refuse mainnet deploy if:
- `DEPLOY_CONFIRM_MAINNET !== YES`
- safe address equals deployer

## 5) Post-deploy checklist
- Validate `deployments.arbitrum_one.json` and `deployments.arbitrum_one.auto.json`.
- Verify contracts:

```bash
npm run verify
```

- For ownership + bytecode reconciliation report:

```bash
npm run verify:ownership
```

- Confirm ownership transferred to `GENESIS_SAFE_ADDRESS`.
- Archive deployment artifacts and tx hashes in release notes.
