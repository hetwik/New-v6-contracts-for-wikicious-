#!/usr/bin/env node
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
['.env', '.env.local', 'wikicious-v6-mainnet.env.txt'].forEach((file) => {
  const full = path.resolve(process.cwd(), file);
  if (fs.existsSync(full)) dotenv.config({ path: full });
});
const { ethers } = require('ethers');

const CREATE_FEE_USDC = 500_000_000n; // 500e6

function load(p) { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }
function save(p, j) { fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); }

function poolKey(a, b, fee) {
  const [x, y] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.solidityPacked(['address', 'address', 'uint256'], [x, y, fee]));
}

async function main() {
  const [, , safeAddress, inputArg, labelArg] = process.argv;
  if (!safeAddress || !ethers.isAddress(safeAddress)) {
    throw new Error('Usage: node scripts/prepare-liquidity-pools-batch.js <safeAddress> [inputFile] [label]');
  }

  const rpc = [process.env.ALCHEMY_ARBITRUM_URL, process.env.ARBITRUM_RPC_URL, process.env.RPC_URL, 'https://arb1.arbitrum.io/rpc']
    .filter(Boolean)
    .filter((u) => !String(u).includes('YOUR_ALCHEMY_KEY'))[0];
  console.log(`Using RPC: ${rpc}`);

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const inputFile = inputArg || 'safe-postdeploy-liquidity-pools-major-mainnet.json';
  const label = labelArg || 'retry';
  const batch = load(inputFile);

  const approveTx = batch.transactions.find(t => t.contractMethod?.name === 'approve');
  const poolTxs = batch.transactions.filter(t => t.contractMethod?.name === 'createPool');
  if (!approveTx) throw new Error('approve tx not found in input');

  const usdc = new ethers.Contract(approveTx.to, ['function balanceOf(address) view returns (uint256)'], provider);
  const lp = new ethers.Contract(poolTxs[0].to, ['function pairToPool(bytes32) view returns (uint256)'], provider);

  const remaining = [];
  const existing = [];
  for (const tx of poolTxs) {
    const v = tx.contractInputsValues;
    const key = poolKey(v.tokenA, v.tokenB, v.feeBps);
    const poolRef = await lp.pairToPool(key);
    if (poolRef > 0n) existing.push({ pair: `${v.tokenA}/${v.tokenB}@${v.feeBps}`, poolRef: String(poolRef) });
    else remaining.push(tx);
  }

  const neededFee = CREATE_FEE_USDC * BigInt(remaining.length);
  const balance = await usdc.balanceOf(safeAddress);

  const outTx = [];
  if (remaining.length > 0) {
    const updatedApprove = JSON.parse(JSON.stringify(approveTx));
    updatedApprove.contractInputsValues.amount = neededFee.toString();
    outTx.push(updatedApprove, ...remaining);
  }

  const out = {
    version: batch.version || '1.0',
    chainId: batch.chainId || '42161',
    createdAt: Date.now(),
    meta: {
      name: `${batch.meta?.name || 'Liquidity pools batch'} (${label})`,
      description: `Filtered to only missing pools; approve amount updated to exact required createPool fees.`
    },
    transactions: outTx
  };

  const outPath = `safe-postdeploy-liquidity-pools-${label}-mainnet.json`;
  save(outPath, out);

  const report = {
    safeAddress,
    inputFile,
    outputFile: outPath,
    poolsRequested: poolTxs.length,
    poolsExisting: existing.length,
    poolsToCreate: remaining.length,
    existing,
    usdcBalance: balance.toString(),
    usdcFeeRequired: neededFee.toString(),
    enoughUsdc: balance >= neededFee
  };
  console.log(JSON.stringify(report, null, 2));

  if (remaining.length === 0) {
    console.error('All pools already exist. No execution needed.');
  } else if (balance < neededFee) {
    console.error('Insufficient USDC in Safe for createPool fees.');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
