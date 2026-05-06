# GS013 troubleshooting for `B21-oracle-pyth-feeds-101-markets-CRITICAL-BLOCKER-calldata.json`

If Safe shows:

- `execution reverted: "GS013"`
- `Cannot estimate`

that means **one of the inner calls reverts** during estimation.

## What this batch is doing

Every tx in `B21-oracle-pyth-feeds-101-markets-CRITICAL-BLOCKER-calldata.json` targets:

- `to = 0xA99583D3cd272F95b8f08b32297f072f5164D0DC`
- method selector `0xa263210e` = `setPythFeed(bytes32,bytes32)`

In `WikiOracle`, `setPythFeed` is `onlyOwner`, so **the Safe must be the owner** of that oracle contract.

## Most likely root cause

`setPythFeed` has no value/range checks, so the common revert is:

- Safe is not the current owner of `WikiOracle`, or
- `0xA995...D0DC` is not the active oracle contract for your deployment.

## Quick checks (before re-submitting)

1. Open `0xA99583D3cd272F95b8f08b32297f072f5164D0DC` on Arbiscan and confirm it is the intended `WikiOracle`.
2. Read `owner()` on that contract and confirm it equals your Safe:
   - expected safe in this repo metadata: `0xc01fAE37aE7a4051Eafea26e047f36394054779c`
3. If owner is different, execute ownership transfer/acceptance first, then retry the feed batch.

## If owner is correct but estimation still fails

Safe may fail estimation for huge batches on mobile. Try:

1. Splitting into smaller batches (e.g., 10–20 tx each).
2. Executing from Safe web desktop (better simulation/debug output).
3. Simulating each tx first in Tenderly/Defender.

## Optional safer alternative

`WikiOracle` also has `batchSetPythFeeds(bytes32[] ids, bytes32[] pythIds)`.

Using that method reduces 101 transactions to a smaller number of batched calls, which is usually easier for Safe simulation and execution.
