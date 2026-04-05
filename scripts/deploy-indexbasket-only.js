const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

async function main() {
  const network = hre.network.name;
  const file = path.join(process.cwd(), `deployments.${network}.auto.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const [deployer] = await ethers.getSigners();

  const oracle = data.deployed?.WikiOracle;
  const splitter = data.deployed?.WikiRevenueSplitter;
  if (!oracle || !splitter) throw new Error("Need WikiOracle + WikiRevenueSplitter in deployment file");

  const usdc = process.env.EXT_USDC || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  const factory = await ethers.getContractFactory("WikiIndexBasket");
  const args = [
    deployer.address,
    "Wiki Top 2",
    "WIKX2",
    oracle,
    splitter,
    usdc,
    50,
    [
      { marketId: ethers.keccak256(ethers.toUtf8Bytes("BTCUSDT")), symbol: "BTCUSDT", weightBps: 5000, initPrice: 1 },
      { marketId: ethers.keccak256(ethers.toUtf8Bytes("ETHUSDT")), symbol: "ETHUSDT", weightBps: 5000, initPrice: 1 },
    ],
  ];

  const txReq = await factory.getDeployTransaction(...args);
  txReq.gasLimit = 30_000_000;

  // Force a raw tx path to bypass estimateGas issues.
  const sent = await deployer.sendTransaction(txReq);
  const receipt = await sent.wait();
  if (!receipt?.contractAddress) throw new Error("IndexBasket tx mined but no contractAddress");

  data.deployed = data.deployed || {};
  data.details = data.details || {};
  data.deployed.WikiIndexBasket = receipt.contractAddress;
  data.details.WikiIndexBasket = {
    address: receipt.contractAddress,
    txHash: sent.hash,
    args,
  };
  data.failed = (data.failed || []).filter((f) => f.name !== "WikiIndexBasket");
  data.retryTimestamp = new Date().toISOString();

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`✅ WikiIndexBasket deployed: ${receipt.contractAddress}`);
  console.log(`📄 Updated: ${path.basename(file)}`);
  console.log(`Remaining failed: ${data.failed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
