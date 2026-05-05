/**
 * Wikicious V6 — Arbitrum One source verification via Etherscan V2 API.
 *
 * Uses Hardhat verify task directly (no shell quoting issues) and loads
 * contracts/constructor args from wikicious_v6_mainnet_all.json.
 *
 * Run:
 *   node verify-etherscan-v2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const { spawnSync } = require('child_process');

if (hre.network.name === 'hardhat' && !process.env.VERIFY_V2_BOOTSTRAPPED) {
  const targetNetwork = process.env.VERIFY_NETWORK || 'arbitrum_one';
  console.log(`ℹ️  Re-running verifier on network: ${targetNetwork}`);
  const rerun = spawnSync(
    'npx',
    ['hardhat', 'run', 'verify-etherscan-v2.js', '--network', targetNetwork],
    {
      stdio: 'inherit',
      env: { ...process.env, VERIFY_V2_BOOTSTRAPPED: '1' },
    }
  );
  process.exit(rerun.status ?? 1);
}


if (hre.network.name === 'hardhat' && process.env.VERIFY_V2_BOOTSTRAPPED) {
  throw new Error('Hardhat network selected for verification. Run `npm run verify` or set HARDHAT_NETWORK=arbitrum_one.');
}

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

function normalizeError(e) {
  const msg = String(e?.message || e || 'unknown error');
  if (/Already Verified|already verified/i.test(msg)) return { status: 'already_verified', reason: msg };
  if (/Invalid API Key|Missing or invalid Action name|NOTOK/i.test(msg)) return { status: 'failed', reason: `API issue: ${msg}` };
  if (/constructor/i.test(msg) && /argument/i.test(msg)) return { status: 'failed', reason: `Constructor mismatch: ${msg}` };
  if (/does not have bytecode|No bytecode/i.test(msg)) return { status: 'failed', reason: `No bytecode at address: ${msg}` };
  return { status: 'failed', reason: msg };
}

async function verifyOne(contract) {
  try {
    await hre.run('verify:verify', {
      address: contract.address,
      constructorArguments: contract.args,
    });
    return { status: 'verified', reason: 'Successfully verified' };
  } catch (e) {
    return normalizeError(e);
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
    const res = await verifyOne(c);
    results[res.status].push({ name: c.name, address: c.address, reason: res.reason });

    if (res.status === 'failed') {
      const short = res.reason.replace(/\s+/g, ' ').slice(0, 180);
      console.log(` ❌ failed — ${short}`);
    } else {
      console.log(` ✅ ${res.status}`);
    }

    if (i < contracts.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    network: hre.network.name,
    chainId: 42161,
    source: path.basename(DEPLOY_PATH),
    summary: {
      total: contracts.length,
      verified: results.verified.length,
      already_verified: results.already_verified.length,
      failed: results.failed.length,
    },
    ...results,
  };

  fs.writeFileSync('verification-report.json', `${JSON.stringify(report, null, 2)}\n`);

  console.log('\nSummary');
  console.log(`  ✅ verified         : ${results.verified.length}`);
  console.log(`  ⚡ already verified : ${results.already_verified.length}`);
  console.log(`  ❌ failed           : ${results.failed.length}`);
  console.log('  📄 report           : verification-report.json');

  if (results.failed.length > 0) {
    console.log('\nTop failure reasons:');
    results.failed.slice(0, 10).forEach((f) => {
      console.log(`  - ${f.name}: ${String(f.reason).replace(/\s+/g, ' ').slice(0, 220)}`);
    });
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message || err}`);
  process.exit(1);
});
