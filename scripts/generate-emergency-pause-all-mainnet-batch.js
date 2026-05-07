#!/usr/bin/env node
const fs = require('fs');
const { ethers } = require('ethers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(label, fn, retries = 5, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e && (e.shortMessage || e.message)) ? (e.shortMessage || e.message) : String(e);
      if (!/initializing|timeout|429|rate|temporar|missing revert data|CALL_EXCEPTION/i.test(msg)) break;
      await sleep(delayMs * (i + 1));
    }
  }
  throw new Error(`${label} failed after retries: ${lastErr?.shortMessage || lastErr?.message || lastErr}`);
}

function getRpcUrl() {
  return process.env.RPC_URL
    || process.env.ARBITRUM_RPC_URL
    || process.env.ALCHEMY_ARBITRUM_URL
    || process.env.TENDERLY_RPC_URL;
}

function asInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const val = Number(raw);
  if (!Number.isInteger(val) || val < 0) throw new Error(`${name} must be a non-negative integer.`);
  return val;
}

async function main() {
  const rpc = getRpcUrl();
  if (!rpc) {
    throw new Error('Missing RPC URL. Set one of: RPC_URL, ARBITRUM_RPC_URL, ALCHEMY_ARBITRUM_URL, TENDERLY_RPC_URL.');
  }

  const deployments = JSON.parse(fs.readFileSync('wikicious_v6_mainnet_all.json', 'utf8'));
  const chainId = String(deployments.chainId || 42161);
  if (chainId !== '42161') throw new Error(`Expected Arbitrum mainnet chainId 42161, got ${chainId}`);

  const perpAddress = process.env.PERP_ADDRESS || deployments.contracts?.WikiPerp?.address;
  if (!perpAddress || !ethers.isAddress(perpAddress)) {
    throw new Error('Missing/invalid PERP address (PERP_ADDRESS or contracts.WikiPerp.address).');
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (String(net.chainId) !== '42161') {
    throw new Error(`RPC network mismatch: expected 42161, got ${net.chainId}.`);
  }

  const perpAbi = [
    'function marketCount() view returns (uint256)',
    'function getMarket(uint256 id) view returns ((bytes32 marketId,string symbol,uint256 maxLeverage,uint256 makerFeeBps,uint256 takerFeeBps,uint256 maintenanceMarginBps,uint256 maxOpenInterestLong,uint256 maxOpenInterestShort,uint256 openInterestLong,uint256 openInterestShort,uint256 maxPositionSizePerUser,int256 fundingRate,uint256 lastFundingTime,uint256 cumulativeFundingLong,uint256 cumulativeFundingShort,bool active,uint256 lastOIUpdateBlock,uint256 oiChangesThisBlock))',
    'function pauseMarket(uint256 idx)',
  ];

  const perp = new ethers.Contract(perpAddress, perpAbi, provider);
  const iface = new ethers.Interface(perpAbi);
  const count = Number(await withRetry('perp.marketCount', () => perp.marketCount()));

  const start = asInt('START_IDX', 0);
  const endDefault = count > 0 ? count - 1 : 0;
  const end = asInt('END_IDX', endDefault);
  if (start > end) throw new Error(`Invalid range: START_IDX ${start} > END_IDX ${end}`);
  if (count === 0) throw new Error('No markets found on perp.');

  const txs = [];
  let activeCount = 0;
  for (let i = start; i <= Math.min(end, count - 1); i++) {
    const m = await withRetry(`perp.getMarket(${i})`, () => perp.getMarket(i));
    if (!m.active) continue;
    activeCount++;
    txs.push({
      to: perpAddress,
      value: '0',
      data: iface.encodeFunctionData('pauseMarket', [i]),
      contractMethod: {
        name: 'pauseMarket',
        payable: false,
        inputs: [{ internalType: 'uint256', name: 'idx', type: 'uint256' }],
      },
      contractInputsValues: { idx: String(i) },
    });
  }

  const outFile = process.env.OUT_FILE || 'safe-perp-pause-active-markets-mainnet-calldata.json';
  const out = {
    version: '1.0',
    chainId: '42161',
    createdAt: Date.now(),
    meta: {
      name: 'EMERGENCY: pause active Perp markets only (mainnet)',
      description: `Auto-generated pauseMarket(idx) batch for active markets in index range ${start}-${Math.min(end, count - 1)}.`,
    },
    transactions: txs,
  };

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Perp: ${perpAddress}`);
  console.log(`marketCount=${count}, range=${start}-${Math.min(end, count - 1)}, activeInRange=${activeCount}`);
  console.log(`Generated ${txs.length} transactions -> ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
