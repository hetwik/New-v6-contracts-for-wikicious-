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
  const perp = process.env.PERP_ADDRESS || '0x723f653a3DEFC45FB934BBF81f1411883a977468';
  if (!rpc) throw new Error('Missing RPC URL. Set one of: RPC_URL, ARBITRUM_RPC_URL, ALCHEMY_ARBITRUM_URL, TENDERLY_RPC_URL.');

  const provider = new ethers.JsonRpcProvider(rpc);
  const abi = [
    'function marketCount() view returns (uint256)',
    'function getMarket(uint256 id) view returns ((bytes32 marketId,string symbol,uint256 maxLeverage,uint256 makerFeeBps,uint256 takerFeeBps,uint256 maintenanceMarginBps,uint256 maxOpenInterestLong,uint256 maxOpenInterestShort,uint256 openInterestLong,uint256 openInterestShort,uint256 maxPositionSizePerUser,int256 fundingRate,uint256 lastFundingTime,uint256 cumulativeFundingLong,uint256 cumulativeFundingShort,bool active,uint256 lastOIUpdateBlock,uint256 oiChangesThisBlock))',
    'function pauseMarket(uint256 idx)'
  ];
  const c = new ethers.Contract(perp, abi, provider);

  const n = Number(await withRetry('perp.marketCount', () => c.marketCount()));
  const byId = new Map();
  const dupes = [];

  for (let i = 0; i < n; i++) {
    const m = await withRetry(`perp.getMarket(${i})`, () => c.getMarket(i));
    const key = m.marketId.toLowerCase();
    if (!byId.has(key)) {
      byId.set(key, { first: i, symbol: m.symbol, active: m.active });
      continue;
    }
    const first = byId.get(key);
    dupes.push({ idx: i, firstIdx: first.first, symbol: m.symbol, marketId: m.marketId, active: m.active });
  }

  const activeDupes = dupes.filter(d => d.active);
  const iface = new ethers.Interface(['function pauseMarket(uint256 idx)']);
  const txs = activeDupes.map(d => ({
    to: perp,
    value: '0',
    data: iface.encodeFunctionData('pauseMarket', [d.idx]),
    contractMethod: {
      name: 'pauseMarket',
      payable: false,
      inputs: [{ internalType: 'uint256', name: 'idx', type: 'uint256' }]
    },
    contractInputsValues: { idx: String(d.idx) }
  }));

  const out = {
    version: '1.0',
    chainId: '42161',
    createdAt: Date.now(),
    meta: {
      name: 'Perp duplicate market pause batch (auto-generated)',
      description: 'Pauses active duplicate markets, keeping first marketId occurrence active.'
    },
    transactions: txs
  };

  fs.writeFileSync('safe-perp-pause-duplicate-markets-mainnet-calldata.json', JSON.stringify(out, null, 2));
  fs.writeFileSync('perp-duplicate-market-report.json', JSON.stringify({ perp, marketCount: n, duplicates: dupes, activeDuplicates: activeDupes }, null, 2));

  console.log(`Total markets: ${n}`);
  console.log(`Duplicate entries: ${dupes.length}`);
  console.log(`Active duplicates to pause: ${activeDupes.length}`);
  console.log('Wrote safe-perp-pause-duplicate-markets-mainnet-calldata.json');
  console.log('Wrote perp-duplicate-market-report.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
