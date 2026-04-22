#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const HLM = '0x4A73f367cD326092f75c8BE8056C5091F6096D48';
const BACKSTOP = '0xf3785092A8077C861BF1cCf2B56ba35524A73Fc4';
const CHAIN_ID = '42161';

function usage() {
  console.error('Usage: node scripts/build-gmx-routing-batch.js <input.json> <label>');
  console.error('Input shape: { candidates:[{symbol,marketId,gmxMarket}] }');
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

function isAddress(a) {
  try { return ethers.isAddress(a); } catch { return false; }
}

function mkTx(to, inputName, marketId, gmxMarket) {
  return {
    to,
    value: '0',
    data: '0x',
    contractMethod: {
      name: 'setGMXMarket',
      payable: false,
      inputs: [
        { internalType: 'bytes32', name: 'marketId', type: 'bytes32' },
        { internalType: 'address', name: inputName, type: 'address' }
      ]
    },
    contractInputsValues: { marketId, [inputName]: gmxMarket }
  };
}

function mkCalldataTx(to, encoded) {
  return { to, value: '0', data: encoded };
}

function main() {
  const [, , inputPath, label] = process.argv;
  if (!inputPath || !label) {
    usage();
    process.exit(1);
  }

  const j = loadJson(inputPath);
  const candidates = j.candidates || [];
  if (!candidates.length) throw new Error('No candidates found in input file');

  for (const c of candidates) {
    if (!c.marketId || !String(c.marketId).startsWith('0x') || String(c.marketId).length !== 66) {
      throw new Error(`Bad marketId for ${c.symbol}`);
    }
    if (!isAddress(c.gmxMarket) || c.gmxMarket.toLowerCase() === ethers.ZeroAddress) {
      throw new Error(`Bad/zero gmxMarket for ${c.symbol}: ${c.gmxMarket}`);
    }
  }

  const ifaceHlm = new ethers.Interface(['function setGMXMarket(bytes32 marketId,address gmxMkt)']);
  const ifaceBs = new ethers.Interface(['function setGMXMarket(bytes32 marketId,address gmxMarket)']);

  const tx = [];
  const calldataTx = [];

  for (const c of candidates) {
    tx.push(mkTx(HLM, 'gmxMkt', c.marketId, c.gmxMarket));
    tx.push(mkTx(BACKSTOP, 'gmxMarket', c.marketId, c.gmxMarket));

    calldataTx.push(mkCalldataTx(HLM, ifaceHlm.encodeFunctionData('setGMXMarket', [c.marketId, c.gmxMarket])));
    calldataTx.push(mkCalldataTx(BACKSTOP, ifaceBs.encodeFunctionData('setGMXMarket', [c.marketId, c.gmxMarket])));
  }

  const outManifest = {
    version: '1.0',
    chainId: CHAIN_ID,
    createdAt: Date.now(),
    meta: {
      name: `GMX routing batch ${label}`,
      description: `Sets GMX market mappings for batch ${label} on HLM + Backstop.`
    },
    transactions: tx
  };

  const outCalldata = {
    version: '1.0',
    chainId: CHAIN_ID,
    createdAt: Date.now(),
    meta: {
      name: `GMX routing batch ${label} (pre-encoded calldata)`,
      description: `Pre-encoded setGMXMarket calls for batch ${label}.`
    },
    transactions: calldataTx
  };

  const manifestPath = `safe-postdeploy-gmx-routing-${label}-mainnet.json`;
  const calldataPath = `safe-postdeploy-gmx-routing-${label}-mainnet-calldata.json`;
  fs.writeFileSync(manifestPath, JSON.stringify(outManifest, null, 2) + '\n');
  fs.writeFileSync(calldataPath, JSON.stringify(outCalldata, null, 2) + '\n');

  console.log(`Wrote ${manifestPath}`);
  console.log(`Wrote ${calldataPath}`);
  console.log(`Entries: ${candidates.length} symbols (${candidates.length * 2} transactions per file)`);
}

try { main(); } catch (e) { console.error(e.message || e); process.exit(1); }
