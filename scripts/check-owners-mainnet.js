#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ethers } = require('ethers');

['.env', '.env.local', 'wikicious-v6-mainnet.env.txt'].forEach((f) => {
  const p = path.resolve(process.cwd(), f);
  if (fs.existsSync(p)) dotenv.config({ path: p });
});

const TARGETS = [
  'WikiLaunchpad',
  'WikiStaking',
  'WikiOptionsVault',
  'WikiLP',
  'WikiLending',
  'WikiSpotRouter',
  'WikiPerp'
];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

async function readCall(provider, to, sig) {
  const c = new ethers.Contract(to, [`function ${sig}`], provider);
  try { return await c[sig.split('(')[0]](); } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const rpcArgIdx = args.indexOf('--rpc');
  const rpcArg = rpcArgIdx >= 0 ? args[rpcArgIdx + 1] : null;

  const rpc = [
    rpcArg,
    process.env.ALCHEMY_ARBITRUM_URL,
    process.env.ARBITRUM_RPC_URL,
    process.env.RPC_URL,
    'https://arb1.arbitrum.io/rpc'
  ]
    .filter(Boolean)
    .filter((u) => !String(u).includes('YOUR_ALCHEMY_KEY'))[0];

  if (!rpc) throw new Error('Missing usable RPC URL. Pass --rpc or set ALCHEMY_ARBITRUM_URL/ARBITRUM_RPC_URL/RPC_URL.');
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const all = loadJson('wikicious_v6_mainnet_all.json');
  const expectedSafe = all.safe;

  const rows = [];
  for (const name of TARGETS) {
    const addr = all.contracts?.[name]?.address;
    if (!addr) {
      rows.push({ contract: name, address: null, owner: null, pendingOwner: null, timelock: null, ownerIsSafe: null });
      continue;
    }

    const [owner, pendingOwner, timelock] = await Promise.all([
      readCall(provider, addr, 'owner() view returns (address)'),
      readCall(provider, addr, 'pendingOwner() view returns (address)'),
      readCall(provider, addr, 'timelock() view returns (address)')
    ]);

    rows.push({
      contract: name,
      address: addr,
      owner,
      pendingOwner,
      timelock,
      expectedSafe,
      ownerIsSafe: owner ? String(owner).toLowerCase() === String(expectedSafe).toLowerCase() : null
    });
  }

  console.log(JSON.stringify({ rpc, expectedSafe, results: rows }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
