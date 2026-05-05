/*
 * Checks canonical mainnet deployment from wikicious_v6_mainnet_all.json:
 *   1) bytecode exists
 *   2) owner() equals Safe when owner() exists
 *   3) pendingOwner() is zero when pendingOwner() exists
 *
 * Run: node verify-all-contracts.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const DEPLOY_PATH = path.join(process.cwd(), 'wikicious_v6_mainnet_all.json');
const RPC_CANDIDATES = [
  process.env.ALCHEMY_ARBITRUM_URL,
  process.env.ARBITRUM_RPC_URL,
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.llamarpc.com',
  'https://rpc.ankr.com/arbitrum',
].filter(Boolean);

if (!fs.existsSync(DEPLOY_PATH)) {
  console.error(`❌ Missing ${DEPLOY_PATH}`);
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(DEPLOY_PATH, 'utf8'));
const SAFE = deployment.safe;
const CONTRACTS = Object.fromEntries(
  Object.entries(deployment.contracts || {}).map(([name, info]) => [name, info.address])
);

const OWNER_ABI = ['function owner() view returns (address)'];
const PENDING_OWNER_ABI = ['function pendingOwner() view returns (address)'];

async function getProvider() {
  for (const url of RPC_CANDIDATES) {
    const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
    try {
      const net = await provider.getNetwork();
      if (Number(net.chainId) === 42161) {
        return { provider, url };
      }
    } catch {
      // try next RPC
    }
  }
  return null;
}

async function check(provider, name, address) {
  const out = { name, address, bytecode: false, owner: null, pendingOwner: null, issues: [] };
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    out.issues.push('NO_BYTECODE');
    return out;
  }
  out.bytecode = true;

  try {
    const c = new ethers.Contract(address, OWNER_ABI, provider);
    out.owner = await c.owner();
    if (out.owner.toLowerCase() !== SAFE.toLowerCase()) {
      out.issues.push(`OWNER_NOT_SAFE:${out.owner}`);
    }
  } catch {
    out.owner = 'N/A';
  }

  try {
    const c = new ethers.Contract(address, PENDING_OWNER_ABI, provider);
    out.pendingOwner = await c.pendingOwner();
    if (out.pendingOwner !== ethers.ZeroAddress) {
      out.issues.push(`PENDING_OWNER_SET:${out.pendingOwner}`);
    }
  } catch {
    out.pendingOwner = 'N/A';
  }

  return out;
}

async function main() {
  const conn = await getProvider();
  if (!conn) {
    console.error('❌ Unable to connect to Arbitrum RPC. Tried candidates:');
    RPC_CANDIDATES.forEach((u) => console.error(`   - ${u}`));
    console.error('Set ALCHEMY_ARBITRUM_URL in .env and re-run.');
    process.exit(2);
  }

  const { provider, url } = conn;
  const names = Object.keys(CONTRACTS);
  const results = [];

  console.log(`🔍 Verifying ${names.length} deployed contracts against Safe ${SAFE}`);
  console.log(`🌐 RPC: ${url}`);

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const res = await check(provider, name, CONTRACTS[name]);
    results.push(res);
    process.stdout.write(`  checked ${i + 1}/${names.length}\r`);
    if (i < names.length - 1) await new Promise((r) => setTimeout(r, 120));
  }
  process.stdout.write('\n');

  const withIssues = results.filter((r) => r.issues.length > 0);
  const ownerChecked = results.filter((r) => r.owner !== 'N/A');
  const ownerSafe = ownerChecked.filter((r) => String(r.owner).toLowerCase() === SAFE.toLowerCase());

  console.log(`✅ Bytecode present: ${results.filter((r) => r.bytecode).length}/${results.length}`);
  console.log(`✅ owner()==safe   : ${ownerSafe.length}/${ownerChecked.length} (owner() contracts only)`);
  console.log(`❌ Issue count      : ${withIssues.length}`);

  if (withIssues.length) {
    console.log('\nContracts with issues:');
    withIssues.forEach((r) => console.log(`- ${r.name} (${r.address}) => ${r.issues.join(', ')}`));
  }

  fs.writeFileSync(
    'verification-report.json',
    `${JSON.stringify({ timestamp: new Date().toISOString(), source: path.basename(DEPLOY_PATH), rpc: url, safe: SAFE, total: results.length, results }, null, 2)}\n`
  );
  console.log('\n📄 Wrote verification-report.json');

  if (withIssues.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
