# Notes: WIK Launchpad raise (25M USDC hardcap)

Files:
- `safe-launchpad-wik-25m-mainnet.json`
- `safe-launchpad-wik-25m-mainnet-calldata.json`

## Included txs
1. `WikiLaunchpad.setTimelock(...)`
2. `WikiLaunchpad.setIdleYieldRouter(...)`
3. `WikiLaunchpad.createSale(...)`

## Sale assumptions in this draft
- Hardcap: `25,000,000 USDC`
- Softcap: `5,000,000 USDC`
- Price: `0.10 USDC / WIK` (stored as `pricePerToken = 100000`)
- Total sale tokens: `250,000,000 WIK`
- Timeline (UTC):
  - start: `2026-05-10 00:00:00`
  - end: `2026-05-24 00:00:00`
  - tge: `2026-05-25 00:00:00`
- Vesting: `30d` cliff + `180d` linear

## IMPORTANT before execution
- Replace `metaURI` with final IPFS CID.
- Reconfirm `pricePerToken` unit expectations against your frontend/SDK before executing on mainnet.
- Ensure project owner address and sale token inventory are correct.
- After createSale, project owner must call `depositSaleTokens(saleId)` before users can commit.

## Funding prerequisite for `depositSaleTokens(saleId)`
- `depositSaleTokens` pulls `totalTokens` from `projectOwner` via `transferFrom`.
- This means `projectOwner` must hold enough WIK and approve Launchpad first.
- If tokens are locked in other contracts, they are **not** usable until transferred/unlocked to `projectOwner`.
- Run funding check:
  - `npm run check:launchpad:funding:mainnet`

Typical sequence after `createSale`:
1. Move sale tokens to `projectOwner` wallet/Safe (if currently in vesting/treasury/other contract).
2. From `projectOwner`, call `WIK.approve(<WikiLaunchpad>, <totalTokens>)`.
3. Call `WikiLaunchpad.depositSaleTokens(saleId)`.

If npm shows `EJSONPARSE`, run `node scripts/restore-package-json.js` first, then rerun your npm command.
- If you see `401 Unauthorized` from Alchemy, your env still has a placeholder/invalid key; set a valid key or use a different RPC URL.
- You can force a specific RPC at runtime: `node scripts/check-launchpad-sale-funding.js safe-launchpad-wik-25m-mainnet.json --rpc https://arb1.arbitrum.io/rpc`
