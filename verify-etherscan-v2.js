/**
 * Wikicious V6 — Arbitrum One source verification via Etherscan V2 API.
 *
 * Reads canonical contract addresses + constructor args from
 * wikicious_v6_mainnet_all.json and verifies each contract through Hardhat.
 *
 * Run:
 *   node verify-etherscan-v2.js
 */
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOY_PATH = path.join(process.cwd(), 'wikicious_v6_mainnet_all.json');

function loadContracts() {
  if (!fs.existsSync(DEPLOY_PATH)) {
    throw new Error(`Missing canonical deployment file: ${DEPLOY_PATH}`);
  }
  const json = JSON.parse(fs.readFileSync(DEPLOY_PATH, 'utf8'));
  return Object.entries(json.contracts || {}).map(([name, info]) => ({
    name,
    address: info.address,
    args: Array.isArray(info.args) ? info.args : [],
  }));
}

function verifyOne(contract) {
  const argsStr = contract.args.map((a) => JSON.stringify(a)).join(' ');
  const cmd = `npx hardhat verify --network arbitrum_one ${contract.address} ${argsStr}`;
  try {
    const out = execSync(cmd, { stdio: 'pipe', timeout: 120000 }).toString();
    return {
      status: out.includes('Already Verified') ? 'already_verified' : 'verified',
      output: out.trim(),
    };
  } catch (e) {
    const msg = `${e.stdout?.toString() || ''}${e.stderr?.toString() || ''}`;
    if (msg.match(/Already Verified|already verified/i)) {
      return { status: 'already_verified', output: msg.trim() };
    }
    return { status: 'failed', output: msg.trim() };
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error('ETHERSCAN_API_KEY is required (.env) for Etherscan V2 verification');
  }

  const contracts = loadContracts();
  const results = { verified: [], already_verified: [], failed: [] };

  console.log(`🔍 Verifying ${contracts.length} contracts using Etherscan V2 (Arbitrum chainId 42161)...`);
  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    process.stdout.write(`  [${i + 1}/${contracts.length}] ${c.name}...`);
    const res = verifyOne(c);
    results[res.status].push({ name: c.name, address: c.address, output: res.output });
    console.log(res.status === 'failed' ? ' ❌ failed' : ` ✅ ${res.status}`);
    if (i < contracts.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  fs.writeFileSync(
    'verification-report.json',
    `${JSON.stringify({ timestamp: new Date().toISOString(), source: path.basename(DEPLOY_PATH), ...results }, null, 2)}\n`
  );

  console.log('\nSummary');
  console.log(`  ✅ verified         : ${results.verified.length}`);
  console.log(`  ⚡ already verified : ${results.already_verified.length}`);
  console.log(`  ❌ failed           : ${results.failed.length}`);
  console.log('  📄 report           : verification-report.json');

  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message || err}`);
  process.exit(1);
});
