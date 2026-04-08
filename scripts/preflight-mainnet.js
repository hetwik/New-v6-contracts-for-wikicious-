const { ethers } = require('ethers');
require('dotenv').config({ override: true });

const REQUIRED = [
  'DEPLOYER_PRIVATE_KEY',
  'ALCHEMY_ARBITRUM_URL',
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
  'DEPLOY_CONFIRM_MAINNET',
];

const CANONICAL = {
  EXT_USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  EXT_WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  EXT_WBTC: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
  EXT_ARB: '0x912ce59144191c1204e64559fe8253a0e49e6548',
  EXT_WSTETH: '0x5979d7b546e38e414f7e9822514be443a4800529',
  EXT_RETH: '0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8',
  EXT_PYTH: '0xff1a0f4744e8582df1ae09d5611b887b6a12925c',
  EXT_LZ_ENDPOINT: '0x1a44076050125825900e736c501f859c50fe728c',
  EXT_ENTRYPOINT: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  EXT_UNI_ROUTER: '0xe592427a0aece92de3edee1f18e0157c05861564',
  EXT_SEQ_FEED: '0xfdb631f5ee196f0ed6faa767959853a9f217697d',
};

function isPkValid(v) {
  if (!v) return false;
  const t = v.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(t) || /^[0-9a-fA-F]{64}$/.test(t);
}

function normalizePk(v) {
  const t = (v || '').trim();
  return t.startsWith('0x') ? t : `0x${t}`;
}

function normalizeAddr(v) {
  return ethers.getAddress(String(v).trim()).toLowerCase();
}

function assertAddress(name, value) {
  if (!value || !ethers.isAddress(String(value).trim())) {
    throw new Error(`${name} must be a valid 42-char address`);
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

  for (const key of Object.keys(CANONICAL)) {
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

  try {
    assertAddress('GENESIS_SAFE_ADDRESS', process.env.GENESIS_SAFE_ADDRESS);
  } catch (e) {
    problems.push(e.message);
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
  const feeData = await provider.getFeeData();
  const safe = ethers.getAddress(process.env.GENESIS_SAFE_ADDRESS.trim());

  if (Number(network.chainId) !== 42161) {
    throw new Error(`Wrong chainId ${network.chainId}. Expected 42161 (Arbitrum One).`);
  }
  if (safe === wallet.address) {
    throw new Error('GENESIS_SAFE_ADDRESS must not equal deployer address');
  }

  console.log('✅ Mainnet preflight passed');
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance : ${ethers.formatEther(bal)} ETH`);
  console.log(`   Base fee: ${feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : 'n/a'} gwei`);

  const min = ethers.parseEther('0.05');
  if (bal < min) {
    console.warn('⚠️  Low deployer balance (<0.05 ETH). Deployment may fail due to gas.');
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
