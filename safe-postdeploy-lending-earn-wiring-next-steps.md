# Post-deploy wiring follow-ups (Lending / Flash / Margin / Earn)

This repo now includes `safe-postdeploy-lending-earn-wiring-mainnet.json` for core address/timelock wiring.

## Still required after executing the Safe

1. **WikiLending**
   - Add each market with `addMarket(...)`.
   - Set market toggles/caps via `setMarketConfig(...)`.
   - Optional incentives via `setWIKIncentives(...)`.

2. **WikiFlashLoan**
   - Configure each supported reserve token via `configureToken(token, feeBps, maxDailyBorrow)`.
   - Optional borrower controls via `setWhitelistMode(...)` and `setBorrowerApproval(...)`.

3. **WikiMarginLoan**
   - Configure IRM via `setIRM(base, s1, s2, kink)`.
   - Configure reserve factor via `setReserveFactor(...)`.

4. **Keepers / operators**
   - Run keeper setup scripts (`npm run keeper:mainnet`) and then verify any contract-specific keeper/operator lists.

## GS013 / estimateGas revert troubleshooting

- `setTimelock` and most admin wiring calls are `onlyOwner`; if ownership has already moved to timelock, direct Safe execution will revert.
- Run `npm run prepare:lending:wiring -- <YOUR_SAFE_ADDRESS> safe-postdeploy-lending-earn-wiring-mainnet.json retry` to generate a filtered retry bundle.
- If owner is timelock contract, queue transactions through timelock instead of direct Safe execution.
