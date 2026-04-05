const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

const EXT_MAINNET = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  WSTETH: "0x5979D7b546E38E414F7E9822514be443A4800529",
  RETH: "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA",
  PYTH: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  LZ_ENDPOINT: "0x1a44076050125825900e736c501f859c50fE728c",
  ENTRYPOINT: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  AAVE_POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  UNI_ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  GMX_ROUTER: "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
  SEQ_FEED: "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",
};

const CONTRACTS_TO_SKIP = new Set([
  "sWIKToken",
  "IAaveV3Pool",
  "IAToken",
  "IExternalLender",
  "IOracle",
  "ILayerZeroEndpointV5",
  "IWIKToken",
  "IUniswapV3Router",
  "IQuoterV5",
  "IIdleYieldRouter",
  "IEntryPoint",
  "IPriceFeed",
  "IUniswapV3SwapRouter",
  "IYieldVault",
  "IGMXExchangeRouter",
  "IGMXReader",
  "IGMXDataStore",
  "Order",
  "IRadiantPool",
  "IRWAToken",
  "IKeeperRegistry",
]);

function normalizeAddress(value, label) {
  const raw = String(value || "").trim();
  if (!raw || !ethers.isAddress(raw)) {
    throw new Error(`${label} must be a valid address (got: ${raw || "<empty>"})`);
  }
  return ethers.getAddress(raw);
}

function normalizeAddressOrFallback(value, label, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return normalizeAddress(fallback, `${label}_FALLBACK`);
  if (!ethers.isAddress(raw)) {
    const fb = normalizeAddress(fallback, `${label}_FALLBACK`);
    console.warn(`⚠️  ${label} invalid ("${raw}"), falling back to ${fb}`);
    return fb;
  }
  return ethers.getAddress(raw);
}

function getExternalAddresses(networkName) {
  const ext = networkName === "arbitrum_one"
    ? {
        ...EXT_MAINNET,
        USDC: process.env.EXT_USDC || EXT_MAINNET.USDC,
        WETH: process.env.EXT_WETH || EXT_MAINNET.WETH,
        WBTC: process.env.EXT_WBTC || EXT_MAINNET.WBTC,
        ARB: process.env.EXT_ARB || EXT_MAINNET.ARB,
        USDT: process.env.EXT_USDT || EXT_MAINNET.USDT,
        WSTETH: process.env.EXT_WSTETH || EXT_MAINNET.WSTETH,
        RETH: process.env.EXT_RETH || EXT_MAINNET.RETH,
        PYTH: process.env.EXT_PYTH || EXT_MAINNET.PYTH,
        LZ_ENDPOINT: process.env.EXT_LZ_ENDPOINT || EXT_MAINNET.LZ_ENDPOINT,
        ENTRYPOINT: process.env.EXT_ENTRYPOINT || EXT_MAINNET.ENTRYPOINT,
        AAVE_POOL: process.env.EXT_AAVE_POOL || EXT_MAINNET.AAVE_POOL,
        UNI_ROUTER: process.env.EXT_UNI_ROUTER || EXT_MAINNET.UNI_ROUTER,
        GMX_ROUTER: process.env.EXT_GMX_ROUTER || EXT_MAINNET.GMX_ROUTER,
        SEQ_FEED: process.env.EXT_SEQ_FEED || EXT_MAINNET.SEQ_FEED,
      }
    : {
        USDC: process.env.EXT_USDC || ethers.ZeroAddress,
        WETH: process.env.EXT_WETH || ethers.ZeroAddress,
        WBTC: process.env.EXT_WBTC || ethers.ZeroAddress,
        ARB: process.env.EXT_ARB || ethers.ZeroAddress,
        USDT: process.env.EXT_USDT || ethers.ZeroAddress,
        WSTETH: process.env.EXT_WSTETH || ethers.ZeroAddress,
        RETH: process.env.EXT_RETH || ethers.ZeroAddress,
        PYTH: process.env.EXT_PYTH || ethers.ZeroAddress,
        LZ_ENDPOINT: process.env.EXT_LZ_ENDPOINT || ethers.ZeroAddress,
        ENTRYPOINT: process.env.EXT_ENTRYPOINT || ethers.ZeroAddress,
        AAVE_POOL: process.env.EXT_AAVE_POOL || ethers.ZeroAddress,
        UNI_ROUTER: process.env.EXT_UNI_ROUTER || ethers.ZeroAddress,
        GMX_ROUTER: process.env.EXT_GMX_ROUTER || ethers.ZeroAddress,
        SEQ_FEED: process.env.EXT_SEQ_FEED || ethers.ZeroAddress,
      };

  return Object.fromEntries(
    Object.entries(ext).map(([k, v]) => {
      const label = `EXT_${k}`;
      // For arbitrum_one, invalid overrides should not hard-fail deployment:
      // we safely fall back to known good mainnet constants.
      if (networkName === "arbitrum_one") {
        return [k, normalizeAddressOrFallback(v, label, EXT_MAINNET[k])];
      }
      // For non-mainnet, invalid values become zero-address instead of throwing,
      // so missing/partial env files don't crash immediately.
      return [k, normalizeAddressOrFallback(v, label, ethers.ZeroAddress)];
    })
  );
}

function getPreferredContractOrder() {
  return [
    "WIKToken",
    "WikiOracle",
    "WikiVault",
    "WikiMarketRegistry",
    "WikiTVLGuard",
    "WikiRateLimiter",
    "WikiAMM",
    "WikiVirtualAMM",
    "WikiSpot",
    "WikiSpotRouter",
    "WikiOrderBook",
    "WikiPerp",
    "WikiStaking",
    "WikiLending",
    "WikiRevenueSplitter",
    "WikiIdleYieldRouter",
  ];
}

function sortContracts(contracts) {
  const prio = new Map(getPreferredContractOrder().map((name, i) => [name, i]));
  return contracts.sort((a, b) => {
    const ap = prio.has(a) ? prio.get(a) : Number.MAX_SAFE_INTEGER;
    const bp = prio.has(b) ? prio.get(b) : Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return a.localeCompare(b);
  });
}

function pickAddressByName(name, deployed, deployer, ext) {
  const k = name.toLowerCase();

  if (k.includes("owner") || k.includes("admin") || k.includes("guardian") || k.includes("keeper") || k.includes("treasury") || k.includes("operator") || k.includes("safe") || k.includes("wallet") || k.includes("receiver") || k.includes("beneficiary")) {
    return deployer;
  }
  if (k.includes("usdc")) return ext.USDC;
  if (k.includes("weth")) return ext.WETH;
  if (k.includes("wbtc")) return ext.WBTC;
  if (k.includes("arb")) return ext.ARB;
  if (k.includes("usdt")) return ext.USDT;
  if (k.includes("entrypoint")) return ext.ENTRYPOINT;
  if (k.includes("router") && k.includes("uni")) return ext.UNI_ROUTER;
  if (k.includes("endpoint") || k.includes("layerzero") || k.includes("lz")) return ext.LZ_ENDPOINT;
  if (k.includes("pyth")) return ext.PYTH;
  if (k.includes("seq") || k.includes("sequencer")) return ext.SEQ_FEED;

  const byName = Object.entries(deployed).find(([contractName]) =>
    contractName.toLowerCase() === k || contractName.toLowerCase().includes(k)
  );
  if (byName) return byName[1];

  return deployer;
}

function buildArg(input, deployed, deployer, ext) {
  const type = input.type;
  const name = input.name || "";

  if (type === "address") return pickAddressByName(name, deployed, deployer, ext);
  if (type === "address[]") return [deployer];
  if (type.startsWith("uint") || type.startsWith("int")) {
    const k = name.toLowerCase();
    if (k.includes("bps") || k.includes("fee")) return 300;
    if (k.includes("duration") || k.includes("deadline") || k.includes("period")) return 3600;
    if (k.includes("supply") || k.includes("amount") || k.includes("cap") || k.includes("tvl") || k.includes("limit")) return ethers.parseUnits("1000", 6);
    return 1;
  }
  if (type === "bool") return true;
  if (type === "string") return name ? `wik-${name}` : "wik";
  if (type.startsWith("bytes32")) return ethers.encodeBytes32String(name || "WIK");
  if (type.startsWith("bytes")) return "0x";

  return 0;
}

async function deployContract(name, deployed, deployer, ext) {
  const factory = await ethers.getContractFactory(name);
  const inputs = factory.interface.deploy?.inputs || [];
  const args = inputs.map((input) => buildArg(input, deployed, deployer, ext));

  process.stdout.write(`📦 ${name}(${inputs.length}) ... `);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${address}`);

  return { contract, address, args: args.map((a) => (typeof a === "bigint" ? a.toString() : a)) };
}

function getContractNames() {
  const srcDir = path.join(process.cwd(), "src");
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".sol"));
  const names = files.map((f) => path.basename(f, ".sol"));
  return sortContracts(names.filter((n) => !CONTRACTS_TO_SKIP.has(n)));
}

async function main() {
  const networkName = hre.network.name;
  const ext = getExternalAddresses(networkName);
  const [deployerSigner] = await ethers.getSigners();
  const deployer = deployerSigner.address;

  console.log(`\n🚀 Deploying all contracts to network: ${networkName}`);
  console.log(`Deployer: ${deployer}`);

  const names = getContractNames();
  const deployed = {};
  const failed = [];
  const details = {};

  for (const name of names) {
    try {
      const { contract, address, args } = await deployContract(name, deployed, deployer, ext);
      deployed[name] = address;
      details[name] = {
        address,
        args,
        txHash: contract.deploymentTransaction()?.hash || null,
      };
    } catch (error) {
      console.log(`❌ ${name} failed`);
      failed.push({ name, reason: error.message });
    }
  }

  const out = {
    network: networkName,
    timestamp: new Date().toISOString(),
    deployer,
    external: ext,
    deployed,
    failed,
    details,
  };

  const outFile = `deployments.${networkName}.auto.json`;
  fs.writeFileSync(path.join(process.cwd(), outFile), JSON.stringify(out, null, 2));

  console.log("\n══════════════════════════════════════════════");
  console.log(`✅ Deployed: ${Object.keys(deployed).length}`);
  console.log(`⚠️ Failed : ${failed.length}`);
  console.log(`📄 Saved  : ${outFile}`);

  if (failed.length > 0) {
    console.log("\nFailed contracts:");
    for (const f of failed) {
      console.log(`- ${f.name}: ${f.reason.slice(0, 160)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
