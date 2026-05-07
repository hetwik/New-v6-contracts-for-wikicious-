const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
  const rpc = process.env.RPC_URL;
  const registry = process.env.MARKET_REGISTRY;
  const safe = process.env.SAFE_ADDRESS;
  const chainId = process.env.CHAIN_ID || '42161';

  if (!rpc || !registry || !safe) {
    throw new Error('Set RPC_URL, MARKET_REGISTRY, SAFE_ADDRESS');
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const abi = [
    'function totalMarkets() view returns (uint256)',
    'function markets(uint256) view returns (uint256 id,string symbol,string baseAsset,string quoteAsset,uint8 category,uint8 oracleSource,address oracleFeed,bytes32 pythPriceId,uint256 baseMarketId,uint256 quoteMarketId,uint256 maxLeverageBps,uint256 maintenanceMarginBps,uint256 takerFeeBps,uint256 makerFeeBps,uint256 maxOILong,uint256 maxOIShort,uint256 minPositionSize,uint256 maxPositionSize,uint256 spreadBps,uint256 offHoursSpreadBps,bool active,bool reduceOnly,uint256 pricePrecision)',
    'function pauseMarket(uint256 id)',
    'function deactivateMarket(uint256 id)'
  ];
  const c = new ethers.Contract(registry, abi, provider);
  const total = Number(await c.totalMarkets());

  const groups = new Map();
  for (let id = 1; id <= total; id++) {
    const m = await c.markets(id);
    const symbol = String(m.symbol || '').trim();
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, symbol, active: Boolean(m.active) });
  }

  const duplicates = [...groups.values()].filter(g => g.length > 1);
  if (duplicates.length === 0) {
    console.log('No duplicate symbols found.');
    return;
  }

  const iface = new ethers.Interface(['function pauseMarket(uint256 id)', 'function deactivateMarket(uint256 id)']);
  const txs = [];
  const report = [];

  for (const g of duplicates) {
    g.sort((a, b) => a.id - b.id);
    const keep = g[0];
    const disable = g.slice(1);
    report.push({ keep, disable });

    for (const d of disable) {
      txs.push({
        to: registry,
        value: '0',
        data: iface.encodeFunctionData('pauseMarket', [d.id])
      });
      txs.push({
        to: registry,
        value: '0',
        data: iface.encodeFunctionData('deactivateMarket', [d.id])
      });
    }
  }

  const batch = {
    version: '1.0',
    chainId: String(chainId),
    createdAt: Date.now(),
    meta: {
      name: 'Disable duplicate WikiMarketRegistry markets',
      description: `Auto-generated; keeps earliest symbol id and pauses/deactivates later duplicates for ${registry}`,
      createdFromSafeAddress: safe
    },
    transactions: txs
  };

  fs.writeFileSync('safe-disable-duplicate-markets-calldata.json', JSON.stringify(batch, null, 2));
  fs.writeFileSync('duplicate-markets-report.json', JSON.stringify({ registry, totalMarkets: total, duplicates: report }, null, 2));

  console.log(`Found ${duplicates.length} duplicate symbol groups.`);
  console.log(`Created ${txs.length} Safe txs in safe-disable-duplicate-markets-calldata.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
