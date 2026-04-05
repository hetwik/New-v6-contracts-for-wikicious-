const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

const EXT_DEFAULTS = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

function normalizeAddress(value, label) {
  const raw = String(value || "").trim();
  if (!ethers.isAddress(raw)) throw new Error(`${label} invalid address: ${raw || "<empty>"}`);
  return ethers.getAddress(raw);
}

function loadDeploymentFile(networkName) {
  const file = path.join(process.cwd(), `deployments.${networkName}.auto.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run deploy:testnet once first.`);
  }
  return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
}

async function deployOne(name, args, txOverrides = {}) {
  process.stdout.write(`📦 ${name} ... `);
  const factory = await ethers.getContractFactory(name);
  const { forceRawTx = false, ...deployOverrides } = txOverrides;

  if (forceRawTx) {
    const txReq = await factory.getDeployTransaction(...args);
    Object.assign(txReq, deployOverrides);
    const sent = await factory.runner.sendTransaction(txReq);
    const receipt = await sent.wait();
    const address = receipt?.contractAddress;
    if (!address) throw new Error(`${name} deployment mined but contractAddress missing`);
    console.log(`✅ ${address}`);
    return { address, txHash: sent.hash, args };
  }

  let contract;
  try {
    contract = await factory.deploy(...args, deployOverrides);
  } catch (e) {
    const msg = String(e?.message || "");
    if (!deployOverrides.gasLimit && msg.includes("gas required exceeds allowance")) {
      console.log("⚠️  gas estimate failed, retrying with manual gasLimit=30000000");
      contract = await factory.deploy(...args, { gasLimit: 30_000_000 });
    } else {
      throw e;
    }
  }
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${address}`);
  return { address, txHash: contract.deploymentTransaction()?.hash || null, args };
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();
  const { file, data } = loadDeploymentFile(networkName);

  const deployed = data.deployed || {};
  const details = data.details || {};
  const failed = data.failed || [];

  const extUSDC = normalizeAddress(process.env.EXT_USDC || EXT_DEFAULTS.USDC, "EXT_USDC");

  const signerPool = [deployer.address, ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];

  const oracle = deployed.WikiOracle;
  const splitter = deployed.WikiRevenueSplitter;

  const toRetry = ["WikiIndexBasket", "WikiMultisigGuard", "WikiStrategyVault"];
  console.log(`\n🔁 Retrying failed contracts on ${networkName} ...`);

  for (const name of toRetry) {
    if (deployed[name]) {
      console.log(`⏭️  ${name} already deployed at ${deployed[name]}`);
      continue;
    }

    if (!failed.find((f) => f.name === name)) {
      console.log(`⏭️  ${name} not in failed list, skipping`);
      continue;
    }

    try {
      let result;
      if (name === "WikiIndexBasket") {
        if (!oracle || !splitter) {
          throw new Error("WikiIndexBasket needs WikiOracle and WikiRevenueSplitter in deployment file");
        }
        result = await deployOne(name, [
          deployer.address,
          "Wiki Top 2",
          "WIKX2",
          oracle,
          splitter,
          extUSDC,
          50,
          [
            {
              marketId: ethers.keccak256(ethers.toUtf8Bytes("BTCUSDT")),
              symbol: "BTCUSDT",
              weightBps: 5000,
              initPrice: 1,
            },
            {
              marketId: ethers.keccak256(ethers.toUtf8Bytes("ETHUSDT")),
              symbol: "ETHUSDT",
              weightBps: 5000,
              initPrice: 1,
            },
          ],
        ], { gasLimit: 30_000_000, forceRawTx: true });
      } else if (name === "WikiMultisigGuard") {
        result = await deployOne(name, [signerPool, 2]);
      } else if (name === "WikiStrategyVault") {
        result = await deployOne(name, [extUSDC, 0, 50, 1000, "Wiki Strategy Vault", "wSV", deployer.address]);
      }

      deployed[name] = result.address;
      details[name] = {
        address: result.address,
        args: result.args,
        txHash: result.txHash,
      };
    } catch (e) {
      console.log(`❌ ${name} failed again: ${e.message}`);
    }
  }

  data.deployed = deployed;
  data.details = details;
  data.failed = (data.failed || []).filter((f) => !deployed[f.name]);
  data.retryTimestamp = new Date().toISOString();

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`\n✅ Updated ${path.basename(file)}`);
  console.log(`Remaining failed: ${data.failed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
