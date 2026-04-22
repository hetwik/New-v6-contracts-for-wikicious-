#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function loadJson(relPath) {
  const p = path.resolve(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normalizeAddress(a) {
  return String(a || '').toLowerCase();
}

function normalizeBool(v) {
  if (typeof v === 'boolean') return v;
  return String(v).toLowerCase() === 'true';
}

async function main() {
  const rpcUrl = process.env.ALCHEMY_ARBITRUM_URL || process.env.ARBITRUM_RPC_URL;
  if (!rpcUrl) {
    throw new Error('Missing RPC URL. Set ALCHEMY_ARBITRUM_URL or ARBITRUM_RPC_URL.');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 42161) {
    throw new Error(`Expected chainId 42161 (Arbitrum One), got ${network.chainId}`);
  }

  const core = loadJson('safe-postdeploy-spotrouter-pools-mainnet.json');
  const phase2 = loadJson('safe-postdeploy-spotrouter-pools-phase2-mainnet.json');
  const allTx = [...core.transactions, ...phase2.transactions];
  const routerAddress = allTx[0]?.to;
  if (!routerAddress) throw new Error('No transactions found in spotrouter artifacts.');

  const abi = [
    'function pools(address tokenIn, address tokenOut) view returns (uint24 fee,address hopToken,uint24 hopFee,bool active)',
    'function spreadBps() view returns (uint256)',
    'function maxSpreadBps() view returns (uint256)',
    'function feeRecipient() view returns (address)',
    'function timelock() view returns (address)'
  ];

  const router = new ethers.Contract(routerAddress, abi, provider);

  let failures = 0;
  for (const [idx, tx] of allTx.entries()) {
    const v = tx.contractInputsValues;
    const expected = {
      fee: Number(v.fee),
      hopToken: normalizeAddress(v.hopToken),
      hopFee: Number(v.hopFee),
      active: normalizeBool(v.active)
    };

    const onchain = await router.pools(v.tokenIn, v.tokenOut);
    const actual = {
      fee: Number(onchain.fee),
      hopToken: normalizeAddress(onchain.hopToken),
      hopFee: Number(onchain.hopFee),
      active: Boolean(onchain.active)
    };

    const ok = expected.fee === actual.fee
      && expected.hopToken === actual.hopToken
      && expected.hopFee === actual.hopFee
      && expected.active === actual.active;

    if (!ok) {
      failures += 1;
      console.error(`Mismatch #${idx + 1} ${v.tokenIn} -> ${v.tokenOut}`);
      console.error('  expected', expected);
      console.error('  actual  ', actual);
    }
  }

  const [spreadBps, maxSpreadBps, feeRecipient, timelock] = await Promise.all([
    router.spreadBps(),
    router.maxSpreadBps(),
    router.feeRecipient(),
    router.timelock()
  ]);

  console.log(JSON.stringify({
    router: routerAddress,
    checkedPools: allTx.length,
    mismatches: failures,
    spreadBps: Number(spreadBps),
    maxSpreadBps: Number(maxSpreadBps),
    feeRecipient,
    timelock,
    artifacts: {
      core: 'safe-postdeploy-spotrouter-pools-mainnet.json',
      phase2: 'safe-postdeploy-spotrouter-pools-phase2-mainnet.json'
    }
  }, null, 2));

  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
