#!/usr/bin/env node
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
['.env', '.env.local', 'wikicious-v6-mainnet.env.txt'].forEach((file) => {
  const full = path.resolve(process.cwd(), file);
  if (fs.existsSync(full)) dotenv.config({ path: full });
});
const { ethers } = require('ethers');

function load(p) { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }

async function main() {
  const rpc = [process.env.ALCHEMY_ARBITRUM_URL, process.env.ARBITRUM_RPC_URL, process.env.RPC_URL, 'https://arb1.arbitrum.io/rpc']
    .filter(Boolean).filter((u) => !String(u).includes('YOUR_ALCHEMY_KEY'))[0];
  console.log(`Using RPC: ${rpc}`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const batch = load('safe-postdeploy-staking-options-major-mainnet.json');
  const stakingAddr = batch.transactions.find(t => t.to)?.to;
  const optionsAddr = batch.transactions.filter(t => t.to)[4]?.to;

  const staking = new ethers.Contract(stakingAddr, [
    'function timelock() view returns (address)',
    'function wikPerSecond() view returns (uint256)',
    'function pools(uint256) view returns (address lpToken,uint256 allocPoint,uint256 lastRewardTime,uint256 accWIKPerShare,uint256 totalBoosted,bool active)'
  ], provider);
  const options = new ethers.Contract(optionsAddr, [
    'function timelock() view returns (address)',
    'function idleYieldRouter() view returns (address)',
    'function managers(address) view returns (bool)',
    'function vaultCount() view returns (uint256)',
    'function getVault(uint256) view returns ((string name,string symbol,uint8 vaultType,address asset,address underlying,uint256 totalAssets,uint256 totalShares,uint256 highWaterMark,uint256 epochStart,uint256 epochNumber,uint256 pendingDeposits,uint256 pendingWithdrawals,uint256 managementFeeBps,uint256 performanceFeeBps,uint256 accumulatedFees,uint256 weeklyPremium,bool active))'
  ], provider);

  const expectedTl = batch.transactions.find(t => t.contractMethod?.name === 'setTimelock').contractInputsValues._tl;
  const expectedEmission = batch.transactions.find(t => t.contractMethod?.name === 'setEmissionRate').contractInputsValues._wikPerSecond;
  const expectedPools = batch.transactions.filter(t => t.contractMethod?.name === 'addPool').map(t => t.contractInputsValues);

  const [stakingTl, emission] = await Promise.all([staking.timelock(), staking.wikPerSecond()]);
  const onchainPools = [];
  for (let i = 0; i < 20; i++) {
    try { const p = await staking.pools(i); onchainPools.push({ lpToken: p.lpToken.toLowerCase(), allocPoint: String(p.allocPoint) }); }
    catch { break; }
  }
  const poolChecks = expectedPools.map(ep => ({
    lpToken: ep.lpToken,
    allocPoint: ep.allocPoint,
    found: onchainPools.some(p => p.lpToken === ep.lpToken.toLowerCase() && p.allocPoint === String(ep.allocPoint))
  }));

  const expectedOptionsTl = batch.transactions.filter(t => t.contractMethod?.name === 'setTimelock')[1].contractInputsValues._tl;
  const expectedRouter = batch.transactions.find(t => t.contractMethod?.name === 'setIdleYieldRouter').contractInputsValues.router;
  const expectedMgr = batch.transactions.find(t => t.contractMethod?.name === 'setManager').contractInputsValues.manager;
  const expectedVaults = batch.transactions.filter(t => t.contractMethod?.name === 'createVault').map(t => t.contractInputsValues);

  const [optTl, router, mgrEnabled, count] = await Promise.all([
    options.timelock(), options.idleYieldRouter(), options.managers(expectedMgr), options.vaultCount()
  ]);

  const foundVaults = expectedVaults.map(v => ({ name: v.name, symbol: v.symbol, found: false }));
  for (let i = 0n; i < count; i++) {
    const v = await options.getVault(i);
    for (const f of foundVaults) {
      if (!f.found && v.name === f.name && v.symbol === f.symbol) f.found = true;
    }
  }

  const summary = {
    block: await provider.getBlockNumber(),
    staking: {
      timelockExpected: expectedTl,
      timelockOnchain: stakingTl,
      emissionExpected: String(expectedEmission),
      emissionOnchain: String(emission),
      pools: poolChecks,
      ok: stakingTl.toLowerCase() === expectedTl.toLowerCase() && String(emission) === String(expectedEmission) && poolChecks.every(p => p.found)
    },
    optionsVault: {
      timelockExpected: expectedOptionsTl,
      timelockOnchain: optTl,
      idleRouterExpected: expectedRouter,
      idleRouterOnchain: router,
      manager: expectedMgr,
      managerEnabled: mgrEnabled,
      vaults: foundVaults,
      ok: optTl.toLowerCase() === expectedOptionsTl.toLowerCase() && router.toLowerCase() === expectedRouter.toLowerCase() && !!mgrEnabled && foundVaults.every(v => v.found)
    }
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.staking.ok || !summary.optionsVault.ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
