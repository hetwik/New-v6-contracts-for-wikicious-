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

// Canonical Arbitrum One addresses — used to catch copy-paste errors
const CANONICAL = {
  EXT_USDC:        '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  EXT_WETH:        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  EXT_WBTC:        '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
  EXT_ARB:         '0x912ce59144191c1204e64559fe8253a0e49e6548',
  EXT_WSTETH:      '0x5979d7b546e38e414f7e9822514be443a4800529',
  EXT_RETH:        '0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8',
  EXT_PYTH:        '0xff1a0f4744e8582df1ae09d5611b887b6a12925c',
  EXT_LZ_ENDPOINT: '0x1a44076050125825900e736c501f859c50fe728c',
  EXT_ENTRYPOINT:  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  EXT_UNI_ROUTER:  '0xe592427a0aece92de3edee1f18e0157c05861564',
  EXT_SEQ_FEED:    '0xfdb631f5ee196f0ed6faa767959853a9f217697d',
};

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

// Fix: was called normalizeAddr but never defined — defined here
function normalizeAddr(v) {
  return String(v || '').trim().toLowerCase();
}

function assertAddress(name, value) {
  if (!value || !ethers.isAddress(String(value).trim())) {
    throw new Error(`${name} must be a valid 42-char address`);
  }
  if (normalizeAddr(value) === ethers.ZeroAddress) {
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

  // 1. Required keys present
  for (const key of REQUIRED) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      problems.push(`Missing ${key}`);
    }
  }

  // 2. Confirm mainnet flag (fix: was failing due to space before = in .env)
  if ((process.env.DEPLOY_CONFIRM_MAINNET || '').trim() !== 'YES') {
    problems.push('DEPLOY_CONFIRM_MAINNET must be exactly YES (no spaces around =)');
  }

  // 3. Private key format
  if (!isPkValid(process.env.DEPLOYER_PRIVATE_KEY)) {
    problems.push('DEPLOYER_PRIVATE_KEY must be 64 hex chars (with or without 0x)');
  }

  // 4. RPC URL format
  try { assertHttpsUrl('ALCHEMY_ARBITRUM_URL', process.env.ALCHEMY_ARBITRUM_URL); } catch (e) { problems.push(e.message); }

  // 5. Address format + canonical check
  for (const key of CONTRACT_ADDR_KEYS) {
    try {
      assertAddress(key, process.env[key]);
      // Check canonical address match (only for EXT_ keys, not GENESIS_SAFE_ADDRESS)
      if (CANONICAL[key]) {
        const actual = normalizeAddr(process.env[key]);
        if (process.env.ALLOW_NON_CANONICAL_EXT !== '1' && actual !== CANONICAL[key]) {
          problems.push(`${key} does not match canonical Arbitrum One address (expected ${CANONICAL[key]})`);
        }
      }
    } catch (e) {
      problems.push(e.message);
    }
  }

  // 6. Duplicate address check
  const addrVals = CONTRACT_ADDR_KEYS
    .map((k) => [k, normalizeAddr(process.env[k] || '')])
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

  // 7. Live RPC checks
  const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_ARBITRUM_URL);
  const wallet   = new ethers.Wallet(normalizePk(process.env.DEPLOYER_PRIVATE_KEY), provider);
  const network  = await provider.getNetwork();
  const bal      = await provider.getBalance(wallet.address);
  const nonce    = await provider.getTransactionCount(wallet.address);
  const feeData  = await provider.getFeeData(); // Fix: was referenced but never fetched

  if (Number(network.chainId) !== 42161) {
    throw new Error(`Wrong chainId ${network.chainId}. Expected 42161 (Arbitrum One).`);
  }

  const safe = process.env.GENESIS_SAFE_ADDRESS; // Fix: was referenced but never assigned
  if (normalizeAddr(safe) === normalizeAddr(wallet.address)) {
    throw new Error('GENESIS_SAFE_ADDRESS must not equal deployer address');
  }

  // 8. Verify EXT_ contracts have bytecode on-chain
  for (const key of CONTRACT_ADDR_KEYS.filter((k) => k !== 'GENESIS_SAFE_ADDRESS')) {
    try {
      await assertHasCode(provider, key, process.env[key]);
    } catch (e) {
      console.warn(`⚠️  ${e.message}`);
    }
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
