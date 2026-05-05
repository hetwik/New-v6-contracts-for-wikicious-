const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const NETWORK = process.env.SAFE_BATCH_NETWORK || "arbitrum_one";

const DEFAULT_CHAINLINK_FEEDS = {
  BTCUSDT: ["0x6ce185860a4963106506c203335a2910413708e9", 86400, 8],
  ETHUSDT: ["0x639fe6ab55c921f74e7fac1ee960c0b6293ba612", 86400, 8],
  ARBUSDT: ["0xb2a824043730fe05f3da2efafa1cbbe83fa548d6", 86400, 8],
  BNBUSDT: ["0x6970460aabf80c5be983c6b74e5d06dedca95d4a", 86400, 8],
  EURUSD: ["0xa14d53bc1f1c0f31b4aa3bd109344e5009051a84", 3600, 8],
  GBPUSD: ["0x3bb4645c46f61d2474bc06ed80e1c99d8b02ce13", 3600, 8],
  USDJPY: ["0x3607e46698d218b3a5cae44bf381475c0a5e2ca7", 3600, 8],
  XAUUSD: ["0x1f954dc24a49708c26e0c1777f16750b5c6d5a2c", 3600, 8],
  XAGUSD: ["0xc56765f04b248394cf1619d20db8082edbfa75b1", 86400, 8],
};

const DEFAULT_PYTH_IDS = {
  BTCUSDT: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETHUSDT: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};

function loadDeployment(networkName) {
  const files = [`deployments.${networkName}.auto.json`, `deployments.${networkName}.json`];
  for (const f of files) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) return { file: f, data: JSON.parse(fs.readFileSync(p, "utf8")) };
  }
  throw new Error(`Missing deployment file for ${networkName}`);
}

function parseJsonObjectEnv(envName, fallback) {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${envName} must be a JSON object`);
  }
  return parsed;
}

function normalizeChainlinkFeeds(feeds) {
  const out = {};
  for (const [symbol, config] of Object.entries(feeds)) {
    if (!Array.isArray(config) || config.length !== 3) {
      throw new Error(`Invalid chainlink config for ${symbol}. Use [feed, heartbeat, decimals]`);
    }
    const [feed, heartbeat, decimals] = config;
    if (!ethers.isAddress(feed)) throw new Error(`Invalid chainlink feed for ${symbol}: ${feed}`);
    out[symbol] = [ethers.getAddress(feed), Number(heartbeat), Number(decimals)];
  }
  return out;
}

function normalizePythIds(ids) {
  const out = {};
  for (const [symbol, pythId] of Object.entries(ids)) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(pythId))) {
      throw new Error(`Invalid pyth id for ${symbol}: ${pythId}`);
    }
    out[symbol] = pythId;
  }
  return out;
}

function main() {
  const { data, file } = loadDeployment(NETWORK);
  const contracts = data.contracts || data.deployed || data.addresses || {};
  const oracleAddress = process.env.WIKI_ORACLE_ADDRESS || contracts.WikiOracle;
  if (!oracleAddress || !ethers.isAddress(oracleAddress)) {
    throw new Error(`WikiOracle missing/invalid in ${file}. Set WIKI_ORACLE_ADDRESS in env if deploy file is incomplete.`);
  }

  const chainlinkFeeds = normalizeChainlinkFeeds(parseJsonObjectEnv("CHAINLINK_FEEDS_JSON", DEFAULT_CHAINLINK_FEEDS));
  const pythIds = normalizePythIds(parseJsonObjectEnv("PYTH_FEED_MAP_JSON", DEFAULT_PYTH_IDS));

  const iface = new ethers.Interface([
    "function setChainlinkFeed(bytes32 id, address feed, uint32 heartbeat, uint8 decimals, uint256 minPrice, uint256 maxPrice)",
    "function setPythFeed(bytes32 id, bytes32 pythId)",
  ]);

  const txs = [];
  for (const [symbol, [feed, heartbeat, decimals]] of Object.entries(chainlinkFeeds)) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(symbol));
    const data = iface.encodeFunctionData("setChainlinkFeed", [
      id,
      feed,
      heartbeat,
      decimals,
      ethers.parseUnits("0", 18),
      ethers.parseUnits("10000000", 18),
    ]);
    txs.push({ to: oracleAddress, value: "0", data, contractMethod: `${symbol}.setChainlinkFeed` });
  }

  for (const [symbol, pythId] of Object.entries(pythIds)) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(symbol));
    const data = iface.encodeFunctionData("setPythFeed", [id, pythId]);
    txs.push({ to: oracleAddress, value: "0", data, contractMethod: `${symbol}.setPythFeed` });
  }

  const safeBatch = {
    version: "1.0",
    chainId: NETWORK === "arbitrum_one" ? "42161" : "421614",
    createdAt: Date.now(),
    meta: {
      name: "WikiOracle live feeds batch",
      description: `Generated from ${file} for ${NETWORK}`,
    },
    transactions: txs,
  };

  const out = path.join(process.cwd(), `safe-oracle-batch.${NETWORK}.json`);
  fs.writeFileSync(out, JSON.stringify(safeBatch, null, 2));
  console.log(`✅ Generated ${out}`);
  console.log(`📍 WikiOracle: ${oracleAddress}`);
  console.log(`🔗 Chainlink symbols: ${Object.keys(chainlinkFeeds).length}`);
  console.log(`🟣 Pyth symbols: ${Object.keys(pythIds).length}`);
  console.log(`🧾 Tx count: ${txs.length}`);
}

main();
