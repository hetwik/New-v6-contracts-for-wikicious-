#!/usr/bin/env node
/*
 * Build and optionally execute WIK redistribution txs when constructor allocations
 * were all set to deployer.
 *
 * Usage:
 *   node scripts/redistribute-wik-from-deployer.js [deployment.json] [--mode holders|safe] [--execute] [--rpc <url>] [--pk <privateKey>]
 *
 * Env fallback:
 *   RPC_URL / ARBITRUM_RPC_URL / ALCHEMY_ARBITRUM_URL
 *   DEPLOYER_PRIVATE_KEY / PRIVATE_KEY
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const ALLOCATIONS = {
  community: 400_000_000n * 10n ** 18n,
  pol: 150_000_000n * 10n ** 18n,
  team: 150_000_000n * 10n ** 18n,
  investor: 100_000_000n * 10n ** 18n,
  treasury: 100_000_000n * 10n ** 18n,
  publicSale: 50_000_000n * 10n ** 18n,
  reserve: 50_000_000n * 10n ** 18n
};

function pickRpc(argv) {
  const i = argv.indexOf('--rpc');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.RPC_URL || process.env.ARBITRUM_RPC_URL || process.env.ALCHEMY_ARBITRUM_URL || '';
}

function pickPk(argv) {
  const i = argv.indexOf('--pk');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
}

function pickMode(argv) {
  const i = argv.indexOf('--mode');
  if (i !== -1 && argv[i + 1]) return argv[i + 1].toLowerCase();
  return 'holders';
}

function pickDeploymentArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--mode' || a === '--rpc' || a === '--pk') {
      i += 1;
      continue;
    }
    if (a === '--execute') continue;
    if (!a.startsWith('--')) return a;
  }
  return 'wikicious_v6_mainnet_all.json';
}

function normalizePk(pk) {
  if (!pk) return pk;
  return pk.startsWith('0x') ? pk : `0x${pk}`;
}

function fmt(n) {
  return ethers.formatUnits(n, 18);
}

function buildPlan(data, mode) {
  const contracts = data.contracts || {};
  const safe = data.safe;
  const deployer = data.deployer;
  const token = contracts.WIKToken?.address;

  if (!ethers.isAddress(safe)) throw new Error(`Invalid safe in deployment file: ${safe}`);
  if (!ethers.isAddress(deployer)) throw new Error(`Invalid deployer in deployment file: ${deployer}`);
  if (!ethers.isAddress(token)) throw new Error('Missing contracts.WIKToken.address in deployment file');

  const constructorArgs = contracts.WIKToken?.args || [];
  const argsDistinct = [...new Set(constructorArgs.map((x) => x.toLowerCase()))];

  const holders = {
    community: contracts.WikiStaking?.address || safe,
    pol: contracts.WikiPOL?.address || safe,
    team: contracts.WikiTokenVesting?.address || safe,
    investor: contracts.WikiTokenVesting?.address || safe,
    treasury: contracts.WikiDAOTreasury?.address || safe,
    publicSale: contracts.WikiLaunchpad?.address || safe,
    reserve: safe
  };

  const targets = mode === 'safe'
    ? Object.fromEntries(Object.keys(ALLOCATIONS).map((k) => [k, safe]))
    : holders;

  for (const [name, addr] of Object.entries(targets)) {
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid target for ${name}: ${addr}`);
    }
  }

  const steps = Object.entries(ALLOCATIONS).map(([bucket, amount]) => ({
    bucket,
    to: targets[bucket],
    amount: amount.toString(),
    amountWIK: fmt(amount)
  }));

  return {
    network: data.network,
    chainId: data.chainId,
    generatedAt: new Date().toISOString(),
    mode,
    token,
    deployer,
    safe,
    tokenConstructorArgsDistinct: argsDistinct,
    looksMisallocatedToDeployer: argsDistinct.length === 1 && argsDistinct[0] === deployer.toLowerCase(),
    steps
  };
}

async function executePlan(plan, rpc, pk) {
  if (!rpc) throw new Error('Missing RPC URL. Set --rpc or RPC_URL/ARBITRUM_RPC_URL/ALCHEMY_ARBITRUM_URL.');
  if (!pk) throw new Error('Missing private key. Set --pk or DEPLOYER_PRIVATE_KEY/PRIVATE_KEY.');

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(normalizePk(pk), provider);
  if (wallet.address.toLowerCase() !== plan.deployer.toLowerCase()) {
    throw new Error(`Signer mismatch. Expected deployer ${plan.deployer}, got ${wallet.address}`);
  }

  const token = new ethers.Contract(plan.token, ERC20_ABI, wallet);
  const balance = await token.balanceOf(wallet.address);

  const required = plan.steps.reduce((acc, s) => acc + BigInt(s.amount), 0n);
  if (balance < required) {
    throw new Error(`Insufficient WIK balance. Need ${fmt(required)}, have ${fmt(balance)}.`);
  }

  console.log(`\nExecuting ${plan.steps.length} transfers from ${wallet.address} ...`);
  for (const step of plan.steps) {
    const tx = await token.transfer(step.to, BigInt(step.amount));
    console.log(`  sent ${step.amountWIK} WIK to ${step.to} | tx: ${tx.hash}`);
    await tx.wait();
  }

  const finalBalance = await token.balanceOf(wallet.address);
  console.log(`\nDone. Remaining deployer WIK: ${fmt(finalBalance)}`);
}

(async () => {
  try {
    const argv = process.argv.slice(2);
    const deploymentArg = pickDeploymentArg(argv);
    const mode = pickMode(argv);
    if (!['holders', 'safe'].includes(mode)) {
      throw new Error('Invalid --mode. Use holders or safe.');
    }

    const raw = fs.readFileSync(path.resolve(deploymentArg), 'utf8');
    const data = JSON.parse(raw);
    const plan = buildPlan(data, mode);

    const out = mode === 'safe'
      ? 'wik-safe-only-redistribution-plan-mainnet.json'
      : 'wik-holder-redistribution-plan-mainnet.json';

    fs.writeFileSync(out, JSON.stringify(plan, null, 2));

    console.log(`Saved plan: ${out}`);
    console.log(`Mode: ${mode}`);
    console.log(`Token: ${plan.token}`);
    console.log(`Deployer: ${plan.deployer}`);
    console.log(`looksMisallocatedToDeployer: ${plan.looksMisallocatedToDeployer}`);

    for (const step of plan.steps) {
      console.log(`  - ${step.bucket.padEnd(10)} -> ${step.to} : ${step.amountWIK} WIK`);
    }

    const shouldExecute = argv.includes('--execute');
    if (shouldExecute) {
      await executePlan(plan, pickRpc(argv), pickPk(argv));
    } else {
      console.log('\nDry run only. Add --execute to broadcast transfers.');
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
})();
