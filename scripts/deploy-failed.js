const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

const EXT_DEFAULTS = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

// ── Already-deployed addresses from your arbitrum_one deployment ──
const DEPLOYED = {
  WIKToken: "0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F",
  WikiOracle: "0xA99583D3cd272F95b8f08b32297f072f5164D0DC",
  WikiVault: "0x4533E181FdF5b0C66e0816992F38c23d57e42Df8",
  WikiPerp: "0x723f653a3DEFC45FB934BBF81f1411883a977468",
  WikiRevenueSplitter: "0xAaDDf07470A4749F51A374Cdeb7889f99f222937",
  WikiFlashLoan: "0xAF8Dfefc70595BE1ACAd711722e67f9894345d8e",
  WikiVirtualAMM: "0x9C63c27B8A73A990a2D89141622A639a2363b88A",
  WikiYieldAggregator: "0x95F3Cf765b479478c44D0EE932f17444ADA6A9a1",
  WikiInsuranceFundYield: "0x1376a071B84006489DeE4bDEF68eB8fA9854e758",
  WikiPOL: "0xEfbfEd647213c78316CDB8418026Cba6515BC7FB",
  WikiTokenVesting: "0x39ef6574b791164E32C9E8bd432637AB0EB3EbBd",
};

function normalizeAddress(value, label) {
  const raw = String(value || "").trim();
  if (!ethers.isAddress(raw))
    throw new Error(`${label} invalid address: ${raw || "<empty>"}`);
  return ethers.getAddress(raw);
}

function getDeploymentCandidates(networkName) {
  return [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${
      networkName === "arbitrum_one" ? "arbitrum" : networkName
    }.json`,
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
    `Missing deployment file for ${networkName}. Expected one of: ${getDeploymentCandidates(
      networkName
    ).join(", ")}`
  );
}

function getFailedContractNames(data) {
  const fromNames = Array.isArray(data.failedContracts)
    ? data.failedContracts
    : [];
  const fromFailures = Array.isArray(data.deployFailures)
    ? data.deployFailures.map((item) => item?.name).filter(Boolean)
    : [];
  const fromLegacy = Array.isArray(data.failed)
    ? data.failed
        .map((item) => (typeof item === "string" ? item : item?.name))
        .filter(Boolean)
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
    if (!address)
      throw new Error(`${name} deployment mined but contractAddress missing`);
    console.log(`✅ ${address}`);
    return { address, txHash: sent.hash, args };
  }

  let contract;
  try {
    contract = await factory.deploy(...args, deployOverrides);
  } catch (e) {
    const msg = String(e?.message || "");
    if (
      !deployOverrides.gasLimit &&
      msg.includes("gas required exceeds allowance")
    ) {
      console.log(
        "⚠️  gas estimate failed, retrying with manual gasLimit=30000000"
      );
      contract = await factory.deploy(...args, { gasLimit: 30_000_000 });
    } else {
      throw e;
    }
  }

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${address}`);
  return {
    address,
    txHash: contract.deploymentTransaction()?.hash || null,
    args,
  };
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();
  const { filePath, fileName, data } = loadDeploymentFile(networkName);

  const contracts = { ...DEPLOYED, ...(data.contracts || data.deployed || {}) };
  const details = data.details || {};
  const failedContracts = getFailedContractNames(data);

  if (failedContracts.length === 0) {
    console.log(`✅ No failed contracts recorded in ${fileName}`);
    return;
  }

  const extUSDC = normalizeAddress(
    process.env.EXT_USDC || EXT_DEFAULTS.USDC,
    "EXT_USDC"
  );
  const signerPool = [
    deployer.address,
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
  ];

  // ── Helper: get address from live contracts map or DEPLOYED fallback ──
  const addr = (key) => contracts[key] || DEPLOYED[key];

  const handlers = {
    // ── Original handlers ──────────────────────────────────────────
    WikiIndexBasket: async () => {
      const oracle = addr("WikiOracle");
      const splitter = addr("WikiRevenueSplitter");
      if (!oracle || !splitter)
        throw new Error(
          "WikiIndexBasket needs WikiOracle + WikiRevenueSplitter"
        );
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
    WikiMultisigGuard: async () =>
      deployOne("WikiMultisigGuard", [signerPool, 2]),
    WikiStrategyVault: async () =>
      deployOne("WikiStrategyVault", [
        extUSDC,
        0,
        50,
        1000,
        "Wiki Strategy Vault",
        "wSV",
        deployer.address,
      ]),

    // ── New handlers for the 22 remaining failed contracts ─────────

    WikiSpot: async () =>
      deployOne("WikiSpot", [deployer.address, deployer.address]),

    WikiOrderBook: async () => deployOne("WikiOrderBook", [deployer.address]),

    WikiStaking: async () =>
      deployOne("WikiStaking", [addr("WIKToken"), extUSDC, deployer.address]),

    AaveV3Adapter: async () =>
      deployOne("AaveV3Adapter", [
        addr("WikiYieldAggregator"),
        deployer.address,
      ]),

    WikiAffiliate: async () =>
      deployOne("WikiAffiliate", [deployer.address, extUSDC]),

    WikiAPIGateway: async () =>
      deployOne("WikiAPIGateway", [
        deployer.address,
        extUSDC,
        deployer.address,
      ]),

    WikiBackstopVault: async () =>
      deployOne("WikiBackstopVault", [
        deployer.address,
        extUSDC,
        deployer.address,
      ]),

    // first constructor arg is unused/unnamed in WikiBonus
    WikiBonus: async () =>
      deployOne("WikiBonus", [
        deployer.address,
        deployer.address,
        deployer.address,
      ]),

    WikiCopyTrading: async () =>
      deployOne("WikiCopyTrading", [
        extUSDC,
        addr("WikiPerp"),
        deployer.address,
      ]),

    WikiDAOTreasury: async () =>
      deployOne("WikiDAOTreasury", [
        extUSDC,
        deployer.address,
        deployer.address,
      ]),

    WikiFiatOnRamp: async () =>
      deployOne("WikiFiatOnRamp", [
        extUSDC,
        addr("WikiRevenueSplitter"),
        deployer.address,
      ]),

    WikiFundingArbVault: async () =>
      deployOne("WikiFundingArbVault", [extUSDC, deployer.address]),

    // Depends on WikiStaking — will use freshly-deployed address if staking was just deployed above
    WikiGaugeVoting: async () => {
      const staking = addr("WikiStaking");
      if (!staking)
        throw new Error(
          "WikiGaugeVoting requires WikiStaking — deploy WikiStaking first"
        );
      return deployOne("WikiGaugeVoting", [
        deployer.address,
        staking,
        addr("WIKToken"),
        extUSDC,
        deployer.address,
      ]);
    },

    WikiLaunchpad: async () => {
      const staking = addr("WikiStaking");
      if (!staking)
        throw new Error(
          "WikiLaunchpad requires WikiStaking — deploy WikiStaking first"
        );
      return deployOne("WikiLaunchpad", [extUSDC, staking, deployer.address]);
    },

    WikiLiqProtection: async () =>
      deployOne("WikiLiqProtection", [
        deployer.address,
        extUSDC,
        deployer.address,
      ]),
    WikiLiquidStaking: async () =>
      deployOne("WikiLiquidStaking", [
        addr("WIKToken"), // wik token address
        deployer.address, // owner
        100, // protocolFeeBps = 1%
      ]),

    WikiMakerRewards: async () =>
      deployOne("WikiMakerRewards", [addr("WIKToken"), deployer.address]),

    WikiMarketMakerAgreement: async () =>
      deployOne("WikiMarketMakerAgreement", [
        deployer.address,
        extUSDC,
        addr("WIKToken"),
      ]),

    WikiOptionsVault: async () =>
      deployOne("WikiOptionsVault", [deployer.address]),

    WikiSocialRewards: async () =>
      deployOne("WikiSocialRewards", [
        addr("WIKToken"),
        deployer.address,
        deployer.address,
      ]),

    WikiTelegramGateway: async () =>
      deployOne("WikiTelegramGateway", [deployer.address, deployer.address]),

    WikiTradeHistory: async () =>
      deployOne("WikiTradeHistory", [deployer.address]),
  };

  console.log(
    `\n🔁 Retrying failed contracts on ${networkName} from ${fileName} ...`
  );

  const retried = [];
  const skipped = [];
  const stillFailed = [];

  for (const name of failedContracts) {
    if (contracts[name] && !DEPLOYED[name]) {
      // already deployed in a previous run (not just a DEPLOYED constant)
      console.log(`⏭️  ${name} already deployed at ${contracts[name]}`);
      retried.push(name);
      continue;
    }
    // Check file contracts (not DEPLOYED fallback) to avoid re-deploying
    const fileContracts = data.contracts || data.deployed || {};
    if (fileContracts[name]) {
      console.log(`⏭️  ${name} already deployed at ${fileContracts[name]}`);
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
      contracts[name] = result.address; // update live map for dependent handlers
      (data.contracts || (data.contracts = {}))[name] = result.address;
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
  data.failedContracts = [
    ...new Set([...skipped, ...stillFailed.map((item) => item.name)]),
  ];
  data.deployFailures = stillFailed;
  data.retryTimestamp = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Updated ${fileName}`);
  console.log(`✅ Retried successfully/already-present: ${retried.length}`);
  console.log(`⚠️  Skipped (no recipe):                  ${skipped.length}`);
  console.log(
    `❌ Still failed:                           ${stillFailed.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
