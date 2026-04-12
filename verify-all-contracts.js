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
const RPC_URL = process.env.ALCHEMY_ARBITRUM_URL;

if (!RPC_URL) {
  console.error('❌ ALCHEMY_ARBITRUM_URL not set in .env');
  process.exit(1);
}
if (!fs.existsSync(DEPLOY_PATH)) {
  console.error(`❌ Missing ${DEPLOY_PATH}`);
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(DEPLOY_PATH, 'utf8'));
const SAFE = deployment.safe;
const CONTRACTS = Object.fromEntries(
  Object.entries(deployment.contracts || {}).map(([name, info]) => [name, info.address])
);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const OWNER_ABI = ['function owner() view returns (address)'];
const PENDING_OWNER_ABI = ['function pendingOwner() view returns (address)'];

async function check(name, address) {
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
  const names = Object.keys(CONTRACTS);
  const results = [];

  console.log(`🔍 Verifying ${names.length} deployed contracts against Safe ${SAFE}`);

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const res = await check(name, CONTRACTS[name]);
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
    `${JSON.stringify({ timestamp: new Date().toISOString(), source: path.basename(DEPLOY_PATH), safe: SAFE, total: results.length, results }, null, 2)}\n`
  );
  console.log('\n📄 Wrote verification-report.json');

  if (withIssues.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
