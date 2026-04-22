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
function keyFor(a, b, fee) {
  const [x, y] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.solidityPacked(['address', 'address', 'uint256'], [x, y, fee]));
}

async function main() {
  const args = process.argv.slice(2);
  const yieldOnly = args.includes('--yield-only');
  const liquidityOnly = args.includes('--liquidity-only');
  if (yieldOnly && liquidityOnly) throw new Error('Use only one flag: --yield-only or --liquidity-only');
  const rpc = [process.env.ALCHEMY_ARBITRUM_URL, process.env.ARBITRUM_RPC_URL, process.env.RPC_URL, 'https://arb1.arbitrum.io/rpc']
    .filter(Boolean)
    .filter((u) => !String(u).includes('YOUR_ALCHEMY_KEY'))[0];
  console.log(`Using RPC: ${rpc}`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const lpBatch = load('safe-postdeploy-liquidity-pools-major-mainnet.json');
  const yBatch = load('safe-postdeploy-yield-vaults-major-mainnet.json');

  const lpAddr = lpBatch.transactions.find(t => t.contractMethod?.name === 'createPool')?.to;
  const lp = new ethers.Contract(lpAddr, ['function pairToPool(bytes32) view returns (uint256)'], provider);

  const poolChecks = [];
  if (!yieldOnly) {
    for (const tx of lpBatch.transactions.filter(t => t.contractMethod?.name === 'createPool')) {
      const v = tx.contractInputsValues;
      const key = keyFor(v.tokenA, v.tokenB, v.feeBps);
      const idx = await lp.pairToPool(key);
      poolChecks.push({ pair: `${v.tokenA}/${v.tokenB}@${v.feeBps}`, exists: Number(idx) > 0, poolRef: String(idx) });
    }
  }

  let summaryYield = {
    managedLiquidityVault: null,
    realYieldLP: null,
    strategyVault: null,
    yieldAggregatorStrategies: []
  };

  if (!liquidityOnly) {
  const mAddr = yBatch.transactions.find(t => t.to.toLowerCase() === yBatch.transactions[0].to.toLowerCase())?.to;
  const managed = new ethers.Contract(mAddr, ['function keeper() view returns (address)', 'function treasury() view returns (address)'], provider);
  const realAddr = yBatch.transactions.find(t => t.contractMethod?.name === 'setRevenueSplitter')?.to;
  const real = new ethers.Contract(realAddr, ['function revenueSplitter() view returns (address)', 'function feeSplitBps() view returns (uint256)'], provider);
  const stratAddr = yBatch.transactions.find(t => t.contractMethod?.name === 'setHarvester')?.to;
  const strat = new ethers.Contract(stratAddr, ['function harvesters(address) view returns (bool)'], provider);
  const aggAddr = yBatch.transactions.find(t => t.contractMethod?.name === 'addStrategy')?.to;
  const agg = new ethers.Contract(aggAddr, ['function strategies(uint256) view returns (string,address,uint256,uint256,uint256,bool,uint256,uint256)'], provider);

  const expectedKeeper = yBatch.transactions.find(t => t.contractMethod?.name === 'setKeeper').contractInputsValues.k;
  const expectedTreasury = yBatch.transactions.find(t => t.contractMethod?.name === 'setTreasury').contractInputsValues.t;
  const expectedSplitter = yBatch.transactions.find(t => t.contractMethod?.name === 'setRevenueSplitter').contractInputsValues.r;
  const expectedFeeSplit = yBatch.transactions.find(t => t.contractMethod?.name === 'setFeeSplitBps').contractInputsValues.bps;
  const expectedHarvester = yBatch.transactions.find(t => t.contractMethod?.name === 'setHarvester').contractInputsValues.h;

  const [keeper, treasury, splitter, feeSplit, harvesterEnabled] = await Promise.all([
    managed.keeper(), managed.treasury(), real.revenueSplitter(), real.feeSplitBps(), strat.harvesters(expectedHarvester)
  ]);

  // find added strategies by name+vault among first 50 entries
  const expectedStrats = yBatch.transactions
    .filter(t => t.contractMethod?.name === 'addStrategy')
    .map(t => ({ name: t.contractInputsValues.name, vault: t.contractInputsValues.vault.toLowerCase() }));

  const foundStrats = expectedStrats.map(s => ({ ...s, found: false }));
  for (let i = 0; i < 50; i++) {
    try {
      const st = await agg.strategies(i);
      for (const f of foundStrats) {
        if (!f.found && st[0] === f.name && String(st[1]).toLowerCase() === f.vault) f.found = true;
      }
    } catch {
      break;
    }
  }


    summaryYield = {
      managedLiquidityVault: {
        keeperExpected: expectedKeeper,
        keeperOnchain: keeper,
        treasuryExpected: expectedTreasury,
        treasuryOnchain: treasury,
        ok: keeper.toLowerCase() === expectedKeeper.toLowerCase() && treasury.toLowerCase() === expectedTreasury.toLowerCase()
      },
      realYieldLP: {
        revenueSplitterExpected: expectedSplitter,
        revenueSplitterOnchain: splitter,
        feeSplitBpsExpected: String(expectedFeeSplit),
        feeSplitBpsOnchain: String(feeSplit),
        ok: splitter.toLowerCase() === expectedSplitter.toLowerCase() && String(feeSplit) === String(expectedFeeSplit)
      },
      strategyVault: {
        harvester: expectedHarvester,
        enabled: harvesterEnabled,
        ok: !!harvesterEnabled
      },
      yieldAggregatorStrategies: foundStrats
    };
  }

  const summary = {
    block: await provider.getBlockNumber(),
    mode: yieldOnly ? 'yield-only' : (liquidityOnly ? 'liquidity-only' : 'full'),
    pools: poolChecks,
    ...summaryYield
  };

  const failedPools = !yieldOnly && poolChecks.some(p => !p.exists);
  const failedYield = !liquidityOnly && (
    !summary.managedLiquidityVault.ok
    || !summary.realYieldLP.ok
    || !summary.strategyVault.ok
    || summary.yieldAggregatorStrategies.some(s => !s.found)
  );
  const failed = failedPools || failedYield;

  console.log(JSON.stringify(summary, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
