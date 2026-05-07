#!/usr/bin/env node
const fs = require('fs');
const { ethers } = require('ethers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(label, fn, retries = 5, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const msg = (e && (e.shortMessage || e.message)) ? (e.shortMessage || e.message) : String(e);
      if (!/initializing|timeout|429|rate|temporar|missing revert data|CALL_EXCEPTION/i.test(msg)) break;
      await sleep(delayMs * (i + 1));
    }
  }
  throw new Error(`${label} failed after retries: ${lastErr?.shortMessage || lastErr?.message || lastErr}`);
}

async function main() {
  const rpc = process.env.RPC_URL || process.env.ARBITRUM_RPC_URL || process.env.ALCHEMY_ARBITRUM_URL || process.env.TENDERLY_RPC_URL;
  if (!rpc) throw new Error('Missing RPC URL. Set one of: RPC_URL, ARBITRUM_RPC_URL, ALCHEMY_ARBITRUM_URL, TENDERLY_RPC_URL.');

  const deployments = JSON.parse(fs.readFileSync('wikicious_v6_mainnet_all.json', 'utf8'));
  const C = deployments.contracts || {};
  const chainId = String(deployments.chainId || 42161);

  const addr = {
    perp: process.env.PERP_ADDRESS || C.WikiPerp?.address,
    vamm: process.env.VAMM_ADDRESS || C.WikiVirtualAMM?.address,
    spot: process.env.SPOT_ADDRESS || C.WikiSpot?.address,
    lending: process.env.LENDING_ADDRESS || C.WikiLending?.address,
    staking: process.env.STAKING_ADDRESS || C.WikiStaking?.address,
  };

  const provider = new ethers.JsonRpcProvider(rpc);
  const txs = [];

  const pushTx = (to, data, name, inputs = [], values = {}) => {
    if (!to) return;
    txs.push({
      to,
      value: '0',
      data,
      contractMethod: { name, payable: false, inputs },
      contractInputsValues: values,
    });
  };

  // 1) Perp: pause every active market + global pause
  if (addr.perp) {
    const perpAbi = [
      'function marketCount() view returns (uint256)',
      'function getMarket(uint256 id) view returns ((bytes32 marketId,string symbol,uint256 maxLeverage,uint256 makerFeeBps,uint256 takerFeeBps,uint256 maintenanceMarginBps,uint256 maxOpenInterestLong,uint256 maxOpenInterestShort,uint256 openInterestLong,uint256 openInterestShort,uint256 maxPositionSizePerUser,int256 fundingRate,uint256 lastFundingTime,uint256 cumulativeFundingLong,uint256 cumulativeFundingShort,bool active,uint256 lastOIUpdateBlock,uint256 oiChangesThisBlock))',
      'function pauseMarket(uint256 idx)',
      'function pause()'
    ];
    const perp = new ethers.Contract(addr.perp, perpAbi, provider);
    const iface = new ethers.Interface(perpAbi);
    const count = Number(await withRetry('perp.marketCount', () => perp.marketCount()));
    for (let i = 0; i < count; i++) {
      const m = await withRetry(`perp.getMarket(${i})`, () => perp.getMarket(i));
      if (m.active) {
        pushTx(addr.perp, iface.encodeFunctionData('pauseMarket', [i]), 'pauseMarket',
          [{ internalType: 'uint256', name: 'idx', type: 'uint256' }], { idx: String(i) });
      }
    }
  }

  const out = {
    version: '1.0',
    chainId,
    createdAt: Date.now(),
    meta: {
      name: 'EMERGENCY: pause active Perp markets only (mainnet)',
      description: 'Auto-generated emergency batch: pauses only active Perp markets via pauseMarket(idx).'
    },
    transactions: txs,
  };

  fs.writeFileSync('safe-emergency-pause-all-mainnet-calldata.json', JSON.stringify(out, null, 2));
  console.log(`Generated ${txs.length} transactions -> safe-emergency-pause-all-mainnet-calldata.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
