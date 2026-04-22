#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const DEFAULT_PERP = '0x723f653a3DEFC45FB934BBF81f1411883a977468';

function usage() {
  console.error('Usage: node scripts/prepare-perp-market-batch.js <input-safe.json> <label> [perpAddress]');
  console.error('Env required: ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL');
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

async function main() {
  const [, , inputPath, label, perpAddrArg] = process.argv;
  if (!inputPath || !label) {
    usage();
    process.exit(1);
  }

  const rpcUrl = process.env.ALCHEMY_ARBITRUM_URL || process.env.ARBITRUM_RPC_URL;
  if (!rpcUrl) throw new Error('Missing RPC URL. Set ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const input = loadJson(inputPath);
  const perpAddress = perpAddrArg || input.transactions?.[0]?.to || DEFAULT_PERP;

  const perpAbi = [
    'function marketCount() view returns (uint256)',
    'function getMarket(uint256 id) view returns ((bytes32 marketId,string symbol,uint256 maxLeverage,uint256 makerFeeBps,uint256 takerFeeBps,uint256 maintenanceMarginBps,uint256 maxOpenInterestLong,uint256 maxOpenInterestShort,uint256 openInterestLong,uint256 openInterestShort,uint256 maxPositionSizePerUser,int256 fundingRate,uint256 lastFundingTime,uint256 cumulativeFundingLong,uint256 cumulativeFundingShort,bool active,uint256 lastOIUpdateBlock,uint256 oiChangesThisBlock))',
    'function owner() view returns (address)'
  ];

  const perp = new ethers.Contract(perpAddress, perpAbi, provider);
  const [count, owner] = await Promise.all([perp.marketCount(), perp.owner().catch(() => ethers.ZeroAddress)]);

  const existing = new Set();
  for (let i = 0n; i < count; i++) {
    const m = await perp.getMarket(i);
    existing.add(String(m.marketId).toLowerCase());
  }

  const createTx = (input.transactions || []).filter(t => t.contractMethod?.name === 'createMarket');
  const already = [];
  const missing = [];
  for (const tx of createTx) {
    const id = String(tx.contractInputsValues.marketId).toLowerCase();
    if (existing.has(id)) already.push(tx);
    else missing.push(tx);
  }

  const out = {
    version: input.version || '1.0',
    chainId: input.chainId || '42161',
    createdAt: Date.now(),
    meta: {
      name: `${input.meta?.name || 'Perp createMarket batch'} (${label})`,
      description: `Filtered from ${path.basename(inputPath)}; includes only markets not currently present on-chain.`
    },
    transactions: missing
  };

  const outPath = `safe-add-perp-markets-${label}-mainnet.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  const report = {
    perpAddress,
    owner,
    marketCountOnchain: Number(count),
    sourceTransactions: createTx.length,
    alreadyExisting: already.length,
    toCreate: missing.length,
    outputFile: outPath,
    alreadySymbols: already.map(t => t.contractInputsValues.symbol)
  };

  console.log(JSON.stringify(report, null, 2));
  if (missing.length === 0) {
    console.error('All markets from this batch already exist on-chain; nothing to execute.');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
