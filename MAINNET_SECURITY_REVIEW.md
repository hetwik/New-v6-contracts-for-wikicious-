# Mainnet Security Readiness Review (April 8, 2026)

## Scope reviewed
- `src/WikiSpotRouter.sol`
- `src/WikiVault.sol`
- `src/WikiPerp.sol`
- `test/09_Security_Invariants.test.js`
- `test/14_SpotRouter_ExactOutGuard.test.js`

## Executive summary

This codebase has many defensive patterns (e.g., `nonReentrant`, `Pausable`, access controls), but **it is not currently safe to claim “secure against all DEX attacks”**. The reviewed contracts include at least one high-severity logic issue and several design/control risks that should be resolved before a mainnet deployment.

---

## Findings

### 1) High — `swapExactOut` can consume full `maxAmountIn` instead of exact input

In `WikiSpotRouter.swapExactOut`, the code intends exact-output behavior, but `_executeSwapExactOut` uses a simplified path that calls `_executeSwap` with `maxIn` as input and then assigns the resulting **output amount** to `amountIn`. This is a semantic mismatch that can overcharge users and break exact-out guarantees.

Why this is dangerous:
- user expects “spend up to maxIn, use only what is necessary”
- implementation can spend the entire approved max input
- `amountIn` accounting/event data becomes inaccurate

---

### 2) High — Timelock protection is declared but not actually enforced on critical owner fund paths

`WikiVault` comments say owner fund movements should go through timelock, but `withdrawProtocolFees` is only `onlyOwner` and does not require timelock execution. Similar pattern exists in `WikiSpotRouter` for fee withdrawals.

Why this matters:
- operational key compromise or malicious owner action can move funds immediately
- weakens governance safety assumptions for mainnet users

---

### 3) Medium — Security invariant tests include placeholders and weak assertions

`test/09_Security_Invariants.test.js` states broad attack coverage but several tests are placeholders (`expect(true).to.equal(true)`), and some checks only confirm bytecode presence rather than exploit-resistant behavior.

Why this matters:
- creates false confidence in attack resistance
- does not prove runtime behavior against real adversarial flows

---

### 4) Medium — Solvency check is incomplete and can mislead monitoring

`WikiVault.isSolvent()` checks `USDC.balanceOf(this) >= totalLocked + insuranceFund + protocolFees`, but free user balances are not included in `tracked`.

Why this matters:
- health dashboards may show solvent status while obligations to users are understated
- can delay incident detection

---

## Recommendation before mainnet

1. Fix `swapExactOut` to use true exact-output Uniswap path and accurate input accounting.
2. Enforce timelock on all owner fund-moving/admin-sensitive operations (or remove timelock claims from docs/comments and clearly document trust model).
3. Replace placeholder “security” tests with adversarial tests that actually execute attack flows.
4. Strengthen solvency/invariant accounting to include all user liabilities.
5. Run full static analysis + fuzzing + independent external audit before mainnet.

## Bottom line

Current state is **not ready** for a strong “secure against all DEX attacks” claim. Proceeding to mainnet without fixing the high-severity and governance-control issues would add meaningful risk.
