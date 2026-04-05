require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ override: true });

if (process.env.HARDHAT_HTTPS_PROXY && !process.env.HTTPS_PROXY) {
  process.env.HTTPS_PROXY = process.env.HARDHAT_HTTPS_PROXY;
}
if (process.env.HARDHAT_HTTP_PROXY && !process.env.HTTP_PROXY) {
  process.env.HTTP_PROXY = process.env.HARDHAT_HTTP_PROXY;
}
if (process.env.HARDHAT_NO_PROXY && !process.env.NO_PROXY) {
  process.env.NO_PROXY = process.env.HARDHAT_NO_PROXY;
}

function normalizePrivateKey(value) {
  if (!value) return `0x${'0'.repeat(64)}`;
  const v = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return `0x${v}`;
  console.warn('⚠️ Invalid DEPLOYER_PRIVATE_KEY format; using zero key fallback for local compile.');
  return `0x${'0'.repeat(64)}`;
}

const DEPLOYER_KEY     = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY);
const ALCHEMY_ARBITRUM = process.env.ALCHEMY_ARBITRUM_URL;
const ALCHEMY_SEPOLIA  = process.env.ALCHEMY_SEPOLIA_URL;
const TENDERLY_RPC     = process.env.TENDERLY_RPC_URL;
const ETHERSCAN_KEY    = process.env.ETHERSCAN_API_KEY;
const SOURCE_DIR       = process.env.CONTRACT_SOURCES_DIR || './src';

if (!ALCHEMY_ARBITRUM && process.env.HARDHAT_NETWORK === 'arbitrum_one') {
  throw new Error('ALCHEMY_ARBITRUM_URL is required in .env for mainnet deployment');
}

module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.26',
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: 'cancun',
        },
      },
    ],
  },

  paths: {
    sources: SOURCE_DIR,
  },

  networks: {
    arbitrum_one: {
      url:      ALCHEMY_ARBITRUM || 'https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY_HERE',
      accounts: [DEPLOYER_KEY],
      chainId:  42161,
      gasPrice: 'auto',
    },
    arbitrum_sepolia: {
      url:      ALCHEMY_SEPOLIA || 'https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY_HERE',
      accounts: [DEPLOYER_KEY],
      chainId:  421614,
    },
    tenderly: {
      url:      TENDERLY_RPC || 'https://arbitrum.gateway.tenderly.co/YOUR_KEY_HERE',
      accounts: [DEPLOYER_KEY],
      chainId:  42161,
    },
  },

  etherscan: {
    apiKey: {
      arbitrumOne:     ETHERSCAN_KEY || 'YOUR_ARBISCAN_KEY_HERE',
      arbitrumSepolia: ETHERSCAN_KEY || 'YOUR_ARBISCAN_KEY_HERE',
    },
    customChains: [
      {
        network: 'arbitrumSepolia',
        chainId: 421614,
        urls: {
          apiURL:     'https://api-sepolia.arbiscan.io/api',
          browserURL: 'https://sepolia.arbiscan.io',
        },
      },
    ],
  },

  sourcify: { enabled: false },
};
