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

function getDeploymentCandidates(networkName) {
  return [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${networkName === "arbitrum_one" ? "arbitrum" : networkName}.json`,
  ];
}

function loadDeploymentFile(networkName) {
  for (const fileName of getDeploymentCandidates(networkName)) {
    const filePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return { filePath, fileName, data };
    }
  }

  throw new Error(
    `Missing deployment file for ${networkName}. Expected one of: ${getDeploymentCandidates(networkName).join(", ")}`
  );
}

function getFailedContractNames(data) {
  const fromNames = Array.isArray(data.failedContracts) ? data.failedContracts : [];
  const fromFailures = Array.isArray(data.deployFailures)
    ? data.deployFailures.map((item) => item?.name).filter(Boolean)
    : [];
  const fromLegacy = Array.isArray(data.failed)
    ? data.failed.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean)
    : [];

  return [...new Set([...fromNames, ...fromFailures, ...fromLegacy])];
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
  const { filePath, fileName, data } = loadDeploymentFile(networkName);

  const contracts = data.contracts || data.deployed || {};
  const details = data.details || {};
  const failedContracts = getFailedContractNames(data);

  if (failedContracts.length === 0) {
    console.log(`✅ No failed contracts recorded in ${fileName}`);
    return;
  }

  const extUSDC = normalizeAddress(process.env.EXT_USDC || EXT_DEFAULTS.USDC, "EXT_USDC");
  const signerPool = [deployer.address, ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];

  const oracle = contracts.WikiOracle;
  const splitter = contracts.WikiRevenueSplitter;

  const handlers = {
    WikiIndexBasket: async () => {
      if (!oracle || !splitter) {
        throw new Error("WikiIndexBasket needs WikiOracle and WikiRevenueSplitter in deployment file");
      }

      return deployOne(
        "WikiIndexBasket",
        [
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
        ],
        { gasLimit: 30_000_000, forceRawTx: true }
      );
    },
    WikiMultisigGuard: async () => deployOne("WikiMultisigGuard", [signerPool, 2]),
    WikiStrategyVault: async () =>
      deployOne("WikiStrategyVault", [extUSDC, 0, 50, 1000, "Wiki Strategy Vault", "wSV", deployer.address]),
  };

  console.log(`\n🔁 Retrying failed contracts on ${networkName} from ${fileName} ...`);

  const retried = [];
  const skipped = [];
  const stillFailed = [];

  for (const name of failedContracts) {
    if (contracts[name]) {
      console.log(`⏭️  ${name} already deployed at ${contracts[name]}`);
      retried.push(name);
      continue;
    }

    const handler = handlers[name];
    if (!handler) {
      console.log(`⚠️  ${name} has no auto-retry recipe yet; skipping`);
      skipped.push(name);
      continue;
    }

    try {
      const result = await handler();
      contracts[name] = result.address;
      details[name] = {
        address: result.address,
        args: result.args,
        txHash: result.txHash,
        retryNetwork: networkName,
        retryTimestamp: new Date().toISOString(),
      };
      retried.push(name);
    } catch (error) {
      console.log(`❌ ${name} failed again: ${error.message}`);
      stillFailed.push({ name, reason: error.message });
    }
  }

  data.contracts = contracts;
  data.deployed = contracts;
  data.details = details;
  data.failedContracts = [...new Set([...skipped, ...stillFailed.map((item) => item.name)])];
  data.deployFailures = stillFailed;
  data.retryTimestamp = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Updated ${fileName}`);
  console.log(`✅ Retried successfully/already-present: ${retried.length}`);
  console.log(`⚠️  Skipped (no recipe): ${skipped.length}`);
  console.log(`❌ Still failed: ${stillFailed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
