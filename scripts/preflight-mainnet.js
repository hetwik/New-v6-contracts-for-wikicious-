const { ethers } = require('ethers');
require('dotenv').config({ override: true });

const REQUIRED = [
  'DEPLOYER_PRIVATE_KEY',
  'ALCHEMY_ARBITRUM_URL',
  'ETHERSCAN_API_KEY',
  'EXT_USDC',
  'EXT_WETH',
  'EXT_WBTC',
  'EXT_ARB',
  'EXT_WSTETH',
  'EXT_RETH',
  'EXT_PYTH',
  'EXT_LZ_ENDPOINT',
  'EXT_ENTRYPOINT',
  'EXT_UNI_ROUTER',
  'EXT_SEQ_FEED',
  'GENESIS_SAFE_ADDRESS',
];

const CONTRACT_ADDR_KEYS = REQUIRED.filter((k) => k.startsWith('EXT_')).concat('GENESIS_SAFE_ADDRESS');

function isPkValid(v) {
  if (!v) return false;
  const t = v.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(t) || /^[0-9a-fA-F]{64}$/.test(t);
}

function normalizePk(v) {
  const t = (v || '').trim();
  return t.startsWith('0x') ? t : `0x${t}`;
}

function assertAddress(name, value) {
  if (!value || !ethers.isAddress(String(value).trim())) {
    throw new Error(`${name} must be a valid 42-char address`);
  }
  if (value.toLowerCase() === ethers.ZeroAddress) {
    throw new Error(`${name} must not be zero address`);
  }
}

function assertHttpsUrl(name, value) {
  if (!value || !String(value).trim()) throw new Error(`${name} is missing`);
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (!['https:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use https:// or wss://`);
  }
}

async function assertHasCode(provider, name, address) {
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error(`${name} (${address}) has no contract bytecode on RPC network`);
  }
}

async function main() {
  const problems = [];

  for (const key of REQUIRED) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      problems.push(`Missing ${key}`);
    }
  }

  if ((process.env.DEPLOY_CONFIRM_MAINNET || '').trim() !== 'YES') {
    problems.push('DEPLOY_CONFIRM_MAINNET must be exactly YES');
  }

  if (!isPkValid(process.env.DEPLOYER_PRIVATE_KEY)) {
    problems.push('DEPLOYER_PRIVATE_KEY must be 64 hex chars (with or without 0x)');
  }

  try { assertHttpsUrl('ALCHEMY_ARBITRUM_URL', process.env.ALCHEMY_ARBITRUM_URL); } catch (e) { problems.push(e.message); }

  for (const key of CONTRACT_ADDR_KEYS) {
    try {
      assertAddress(key, process.env[key]);
      const actual = normalizeAddr(process.env[key]);
      if (process.env.ALLOW_NON_CANONICAL_EXT !== '1' && actual !== CANONICAL[key]) {
        problems.push(`${key} does not match canonical Arbitrum One address`);
      }
    } catch (e) {
      problems.push(e.message);
    }
  }

  const addrVals = CONTRACT_ADDR_KEYS
    .map((k) => [k, (process.env[k] || '').toLowerCase().trim()])
    .filter(([, v]) => v);
  const seen = new Map();
  for (const [k, v] of addrVals) {
    if (seen.has(v)) {
      problems.push(`Address collision: ${k} duplicates ${seen.get(v)} (${v})`);
    } else {
      seen.set(v, k);
    }
  }

  if (problems.length > 0) {
    console.error('❌ Mainnet preflight failed:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_ARBITRUM_URL);
  const wallet = new ethers.Wallet(normalizePk(process.env.DEPLOYER_PRIVATE_KEY), provider);
  const network = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);
  const nonce = await provider.getTransactionCount(wallet.address);

  if (Number(network.chainId) !== 42161) {
    throw new Error(`Wrong chainId ${network.chainId}. Expected 42161 (Arbitrum One).`);
  }
  if (safe === wallet.address) {
    throw new Error('GENESIS_SAFE_ADDRESS must not equal deployer address');
  }

  for (const key of CONTRACT_ADDR_KEYS.filter((k) => k !== 'GENESIS_SAFE_ADDRESS')) {
    await assertHasCode(provider, key, process.env[key]);
  }

  console.log('✅ Mainnet preflight passed');
  console.log(`   Network : chainId ${network.chainId}`);
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Nonce   : ${nonce}`);
  console.log(`   Balance : ${ethers.formatEther(bal)} ETH`);
  console.log(`   Base fee: ${feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : 'n/a'} gwei`);

  const min = ethers.parseEther('0.03');
  if (bal < min) {
    console.warn('⚠️  Low deployer balance (<0.03 ETH). Deployment may fail due to gas/verification txs.');
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
