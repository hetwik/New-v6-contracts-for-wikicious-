# Notes: major markets lending/flash/margin batch

File: `safe-postdeploy-lending-flash-margin-major-markets-mainnet.json`

## Included
- `WikiLending.addMarket(...)` for WETH, WBTC, ARB, USDT, WSTETH.
- `WikiFlashLoan.configureToken(...)` for USDC, USDT, WETH, WBTC, ARB, WSTETH.
- `WikiMarginLoan.setIRM(...)` and `WikiMarginLoan.setReserveFactor(...)`.

## Important
- Review all risk params (`colFactor`, `liqThreshold`, caps, IRM) before execution.
- Ensure owner/timelock path is correct, otherwise Safe may throw GS013.
- Execute in smaller chunks if gas simulation on mobile Safe UI is unstable.
