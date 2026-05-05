const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

const ARBITRUM_LIVE = {
  PYTH: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  SEQUENCER_FEED: "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",
  CHAINLINK: {
    BTCUSDT: ["0x6ce185539ad4fdaeBc62adeD98E2AE0C68b4cFf", 86400, 8],
    ETHUSDT: ["0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", 86400, 8],
    ARBUSDT: ["0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6", 86400, 8],
    BNBUSDT: ["0x6970460aabF80C5BE983C6b74e5D06dEDCA95D4A", 86400, 8],
    EURUSD: ["0xA14d53bC1F1c0F31B4aA3BD109344E5009051a84", 3600, 8],
    GBPUSD: ["0x3bB4645c46f61d2474BC06ED80E1C99D8B02CE13", 3600, 8],
    USDJPY: ["0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7", 3600, 8],
    XAUUSD: ["0x1F954Dc24a49708C26E0C1777f16750B5C6d5a2c", 3600, 8],
    XAGUSD: ["0xC56765f04B248394CF1619D20dB8082Edbfa75b1", 86400, 8],
  },
};

function loadDeployment(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
  ];
  for (const file of candidates) {
    const full = path.join(process.cwd(), file);
    if (fs.existsSync(full)) return { file, data: JSON.parse(fs.readFileSync(full, "utf8")) };
  }
  throw new Error(`No deployment file found for ${networkName}`);
}

function parsePythMap() {
  const raw = process.env.PYTH_FEED_MAP_JSON || "";
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PYTH_FEED_MAP_JSON must be a JSON object, e.g. {\"BTCUSDT\":\"0x...\"}");
  }
  return parsed;
}

async function main() {
  const networkName = hre.network.name;
  if (networkName !== "arbitrum_one" && networkName !== "arbitrum_sepolia") {
    throw new Error(`Unsupported network for live oracle setup: ${networkName}`);
  }

  const [deployer] = await ethers.getSigners();
  const { data, file } = loadDeployment(networkName);
  const contracts = data.contracts || data.deployed || data.addresses || {};
  const oracleAddress = contracts.WikiOracle;

  if (!oracleAddress || !ethers.isAddress(oracleAddress)) {
    throw new Error(`WikiOracle address missing in ${file}`);
  }

  const oracle = await ethers.getContractAt("WikiOracle", oracleAddress, deployer);

  console.log(`\n🔮 Oracle live feed setup on ${networkName}`);
  console.log(`📄 Deployment source: ${file}`);
  console.log(`📍 WikiOracle: ${oracleAddress}`);
  console.log(`🛰️ Sequencer feed (constructor-time): ${ARBITRUM_LIVE.SEQUENCER_FEED}`);
  console.log(`📡 Pyth contract (constructor-time): ${ARBITRUM_LIVE.PYTH}\n`);

  for (const [symbol, [feed, hb, dec]] of Object.entries(ARBITRUM_LIVE.CHAINLINK)) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(symbol));
    process.stdout.write(`🔗 Chainlink ${symbol} ... `);
    const tx = await oracle.setChainlinkFeed(
      id,
      feed,
      hb,
      dec,
      ethers.parseUnits("0", 18),
      ethers.parseUnits("10000000", 18)
    );
    await tx.wait();
    console.log("✅");
  }

  const pythMap = parsePythMap();
  const pythEntries = Object.entries(pythMap);
  if (pythEntries.length > 0) {
    for (const [symbol, pythId] of pythEntries) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(symbol));
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(pythId))) {
        throw new Error(`Invalid pyth feed id for ${symbol}: ${pythId}`);
      }
      process.stdout.write(`🟣 Pyth ${symbol} ... `);
      const tx = await oracle.setPythFeed(id, pythId);
      await tx.wait();
      console.log("✅");
    }
  } else {
    console.log("⚠️  No PYTH_FEED_MAP_JSON provided. Skipping setPythFeed calls.");
    console.log("   Example:");
    console.log('   PYTH_FEED_MAP_JSON={"BTCUSDT":"0xe62df6...","ETHUSDT":"0xff6149..."}');
  }

  console.log("\n✅ Live oracle setup completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
