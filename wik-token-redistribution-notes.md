# WIK token redistribution (from deployer)

If `WIKToken` constructor args were all set to the deployer address, all 1,000,000,000 WIK were minted to the deployer wallet.

Use this helper to redistribute WIK either:

1. **to intended holders/contracts** (`--mode holders`), or
2. **to Safe only** (`--mode safe`) for later governance-controlled distribution.

## Generate dry-run plans

```bash
npm run wik:redistribute:holders
npm run wik:redistribute:safe
```

This writes:

- `wik-holder-redistribution-plan-mainnet.json`
- `wik-safe-only-redistribution-plan-mainnet.json`

## Execute transfers on-chain

```bash
export RPC_URL="https://arb1.arbitrum.io/rpc"
export DEPLOYER_PRIVATE_KEY="0x..."

# Option A: move directly to intended holders/contracts
node scripts/redistribute-wik-from-deployer.js --mode holders --execute

# Option B: move all to Safe
node scripts/redistribute-wik-from-deployer.js --mode safe --execute
```

## Default holder mapping (`--mode holders`)

- Community: `WikiStaking`
- POL: `WikiPOL`
- Team: `WikiTokenVesting`
- Investor: `WikiTokenVesting`
- Treasury: `WikiDAOTreasury`
- Public sale: `WikiLaunchpad`
- Reserve: project Safe

If any destination contract is missing in `wikicious_v6_mainnet_all.json`, the script falls back to Safe.
