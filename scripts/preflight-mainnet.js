const { ethers } = require("ethers");
require("dotenv").config({ override: true });

const REQUIRED = [
  "DEPLOYER_PRIVATE_KEY",
  "ALCHEMY_ARBITRUM_URL",
  "EXT_USDC",
  "EXT_WETH",
  "EXT_WBTC",
  "EXT_ARB",
  "EXT_WSTETH",
  "EXT_RETH",
  "EXT_PYTH",
  "EXT_LZ_ENDPOINT",
  "EXT_ENTRYPOINT",
  "EXT_UNI_ROUTER",
  "EXT_SEQ_FEED",
  "GENESIS_SAFE_ADDRESS",
];

function isPkValid(v) {
  if (!v) return false;
  const t = v.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(t) || /^[0-9a-fA-F]{64}$/.test(t);
}

function normalizePk(v) {
  const t = (v || "").trim();
  return t.startsWith("0x") ? t : `0x${t}`;
}

function assertAddress(name, value) {
  if (!value || !ethers.isAddress(value.trim())) {
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

  if (!isPkValid(process.env.DEPLOYER_PRIVATE_KEY)) {
    problems.push("DEPLOYER_PRIVATE_KEY must be 64 hex chars (with or without 0x)");
  }

  for (const key of REQUIRED.filter((k) => k.startsWith("EXT_"))) {
    try {
      assertAddress(key, process.env[key]);
    } catch (e) {
      problems.push(e.message);
    }
  }
  try {
    assertAddress("GENESIS_SAFE_ADDRESS", process.env.GENESIS_SAFE_ADDRESS);
  } catch (e) {
    problems.push(e.message);
  }

  if (problems.length > 0) {
    console.error("❌ Mainnet preflight failed:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_ARBITRUM_URL);
  const wallet = new ethers.Wallet(normalizePk(process.env.DEPLOYER_PRIVATE_KEY), provider);
  const network = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);

  if (Number(network.chainId) !== 42161) {
    throw new Error(`Wrong chainId ${network.chainId}. Expected 42161 (Arbitrum One).`);
  }

  console.log("✅ Mainnet preflight passed");
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance : ${ethers.formatEther(bal)} ETH`);

  const min = ethers.parseEther("0.01");
  if (bal < min) {
    console.warn("⚠️  Low deployer balance (<0.01 ETH). Deployment may fail due to gas.");
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
