#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const DEFAULT_INPUT = 'safe-postdeploy-lending-earn-wiring-mainnet.json';

function usage() {
  console.error('Usage: node scripts/prepare-lending-wiring-batch.js <safeAddress> [inputFile] [label]');
  console.error('Env: ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL');
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

async function readOwner(provider, to) {
  const c = new ethers.Contract(to, ['function owner() view returns (address)'], provider);
  try { return await c.owner(); } catch { return null; }
}

async function readTimelock(provider, to) {
  const c = new ethers.Contract(to, ['function timelock() view returns (address)'], provider);
  try { return await c.timelock(); } catch { return null; }
}

async function main() {
  const [, , safeAddressArg, inputFileArg, labelArg] = process.argv;
  if (!safeAddressArg) { usage(); process.exit(1); }
  if (!ethers.isAddress(safeAddressArg)) throw new Error('Invalid safe address');

  const rpcUrl = process.env.ALCHEMY_ARBITRUM_URL || process.env.ARBITRUM_RPC_URL;
  if (!rpcUrl) throw new Error('Missing RPC URL. Set ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const inputFile = inputFileArg || DEFAULT_INPUT;
  const label = labelArg || 'retry';
  const safeAddress = safeAddressArg.toLowerCase();
  const input = loadJson(inputFile);

  const filtered = [];
  const warnings = [];

  for (const tx of input.transactions || []) {
    const to = tx.to;
    const method = tx.contractMethod?.name || '<unknown>';
    const owner = (await readOwner(provider, to))?.toLowerCase() || null;

    if (owner && owner !== safeAddress) {
      warnings.push({
        to,
        method,
        issue: `owner is ${owner}, not provided safe ${safeAddress}. Call must come from owner/timelock path.`
      });
      continue;
    }

    if (method === 'setTimelock') {
      const currentTl = (await readTimelock(provider, to))?.toLowerCase() || null;
      const targetTl = String(tx.contractInputsValues?._tl || '').toLowerCase();
      if (currentTl && targetTl && currentTl === targetTl) {
        warnings.push({ to, method, issue: `timelock already set to ${currentTl}; skipping duplicate.` });
        continue;
      }
    }

    filtered.push(tx);
  }

  const out = {
    version: input.version || '1.0',
    chainId: input.chainId || '42161',
    createdAt: Date.now(),
    meta: {
      name: `${input.meta?.name || 'Lending/Earn wiring'} (${label})`,
      description: `Filtered for safe ${safeAddressArg}; removes txs likely to revert due owner/timelock mismatch or already-applied timelock.`
    },
    transactions: filtered
  };

  const outPath = `safe-postdeploy-lending-earn-wiring-${label}-mainnet.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  console.log(JSON.stringify({
    safeAddress: safeAddressArg,
    inputFile,
    outputFile: outPath,
    originalTxs: (input.transactions || []).length,
    filteredTxs: filtered.length,
    droppedTxs: ((input.transactions || []).length - filtered.length),
    warnings
  }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
