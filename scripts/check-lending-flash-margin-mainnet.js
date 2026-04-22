#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function loadJson(p) { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }

async function main() {
  const rpc = process.env.ALCHEMY_ARBITRUM_URL || process.env.ARBITRUM_RPC_URL;
  if (!rpc) throw new Error('Missing RPC URL. Set ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL');

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const batch = loadJson('safe-postdeploy-lending-flash-margin-major-markets-mainnet.json');

  const lendingAddr = batch.transactions.find(t => t.contractMethod?.name === 'addMarket')?.to;
  const flashAddr = batch.transactions.find(t => t.contractMethod?.name === 'configureToken')?.to;
  const marginAddr = batch.transactions.find(t => t.contractMethod?.name === 'setIRM')?.to;

  const lending = new ethers.Contract(lendingAddr, [
    'function marketCount() view returns (uint256)',
    'function getMarket(uint256 id) view returns ((address underlying,bytes32 oracleId,string symbol,uint256 baseRatePerSecond,uint256 multiplierPerSecond,uint256 jumpMultiplierPerSecond,uint256 kinkUtilization,uint256 totalSupply,uint256 totalBorrows,uint256 totalReserves,uint256 exchangeRate,uint256 borrowIndex,uint256 lastAccrualTime,uint256 collateralFactor,uint256 liquidationThreshold,uint256 reserveFactor,uint256 supplyCap,uint256 borrowCap,bool supplyEnabled,bool borrowEnabled,uint256 supplyWIKPerSecond,uint256 borrowWIKPerSecond,uint256 accSupplyWIKPerToken,uint256 accBorrowWIKPerBorrow))'
  ], provider);

  const flash = new ethers.Contract(flashAddr, [
    'function isSupported(address) view returns (bool)',
    'function reserves(address) view returns (bool enabled,uint256 feeBps,uint256 totalDeposited,uint256 totalLP,uint256 accFeePerShare,uint256 protocolFees,uint256 insuranceFund,uint256 dailyBorrowed,uint256 dayStart,uint256 maxDailyBorrow,uint256 totalFlashVolume,uint256 totalFlashCount)'
  ], provider);

  const margin = new ethers.Contract(marginAddr, [
    'function baseRatePerSecond() view returns (uint256)',
    'function slope1PerSecond() view returns (uint256)',
    'function slope2PerSecond() view returns (uint256)',
    'function kinkUtilization() view returns (uint256)',
    'function reserveFactorBps() view returns (uint256)'
  ], provider);

  const addMarketTxs = batch.transactions.filter(t => t.contractMethod?.name === 'addMarket');
  const configureTxs = batch.transactions.filter(t => t.contractMethod?.name === 'configureToken');
  const irmTx = batch.transactions.find(t => t.contractMethod?.name === 'setIRM');
  const reserveTx = batch.transactions.find(t => t.contractMethod?.name === 'setReserveFactor');

  const count = Number(await lending.marketCount());
  const markets = [];
  for (let i = 0; i < count; i++) markets.push(await lending.getMarket(i));

  const marketResults = [];
  for (const tx of addMarketTxs) {
    const v = tx.contractInputsValues;
    const found = markets.find(m =>
      String(m.underlying).toLowerCase() === String(v.underlying).toLowerCase() &&
      String(m.symbol) === String(v.symbol) &&
      String(m.oracleId).toLowerCase() === String(v.oracleId).toLowerCase()
    );
    marketResults.push({ symbol: v.symbol, found: !!found });
  }

  const flashResults = [];
  for (const tx of configureTxs) {
    const v = tx.contractInputsValues;
    const supported = await flash.isSupported(v.token);
    const res = await flash.reserves(v.token);
    flashResults.push({
      token: v.token,
      supported,
      enabled: Boolean(res.enabled),
      feeBpsExpected: Number(v.feeBps),
      feeBpsOnchain: Number(res.feeBps),
      maxDailyBorrowExpected: String(v.maxDailyBorrow),
      maxDailyBorrowOnchain: String(res.maxDailyBorrow),
      ok: supported && Boolean(res.enabled) && Number(res.feeBps) === Number(v.feeBps) && String(res.maxDailyBorrow) === String(v.maxDailyBorrow)
    });
  }

  const [base, s1, s2, kink, rf] = await Promise.all([
    margin.baseRatePerSecond(),
    margin.slope1PerSecond(),
    margin.slope2PerSecond(),
    margin.kinkUtilization(),
    margin.reserveFactorBps()
  ]);

  const marginResult = {
    setIRMExpected: irmTx ? irmTx.contractInputsValues : null,
    setReserveFactorExpected: reserveTx ? reserveTx.contractInputsValues : null,
    onchain: {
      base: String(base), s1: String(s1), s2: String(s2), kink: String(kink), reserveFactorBps: String(rf)
    },
    ok: irmTx && reserveTx
      ? String(base) === String(irmTx.contractInputsValues.base)
        && String(s1) === String(irmTx.contractInputsValues.s1)
        && String(s2) === String(irmTx.contractInputsValues.s2)
        && String(kink) === String(irmTx.contractInputsValues.kink)
        && String(rf) === String(reserveTx.contractInputsValues.bps)
      : false
  };

  const summary = {
    block: await provider.getBlockNumber(),
    lendingAddress: lendingAddr,
    flashAddress: flashAddr,
    marginAddress: marginAddr,
    markets: marketResults,
    flash: flashResults,
    margin: marginResult
  };

  const failed = marketResults.some(x => !x.found) || flashResults.some(x => !x.ok) || !marginResult.ok;
  console.log(JSON.stringify(summary, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
