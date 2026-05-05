// redeploy-4-and-transfer.js
//
// PURPOSE: Redeploy the 4 contracts whose ownership transfer broke (USDC
//          address was mistakenly used as owner), then immediately initiate
//          transferOwnership() → Safe.
//
// STEP 1:  Run with your DEPLOYER wallet (the one that deployed everything else)
//          npx hardhat run scripts/redeploy-4-and-transfer.js --network arbitrum_one
//
// STEP 2:  Queue acceptOwnership() on your Gnosis Safe for all 4 contracts.
//          The script outputs a ready-to-import JSON batch for the Safe Transaction Builder.
//
// ─── CONFIG ──────────────────────────────────────────────────────────────────

require("dotenv").config({ override: true });
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// ✅ Your Gnosis Safe — new owner of all 4 contracts
const SAFE_ADDRESS = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";

// Already-deployed addresses needed as constructor args
const USDC    = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const WIK     = "0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F"; // WIKToken
const PERP    = "0x723f653a3DEFC45FB934BBF81f1411883a977468"; // WikiPerp

// ─────────────────────────────────────────────────────────────────────────────

function getDeploymentPath(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${networkName === "arbitrum_one" ? "arbitrum" : networkName}.json`,
  ];
  for (const f of candidates) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) return p;
  }
  // Default to auto file if none exist yet
  return path.join(process.cwd(), `deployments.${networkName}.auto.json`);
}

async function deployOne(name, args, overrides = {}) {
  process.stdout.write(`\n📦 Deploying ${name} ... `);
  const factory = await ethers.getContractFactory(name);

  let contract;
  try {
    contract = await factory.deploy(...args, overrides);
  } catch (e) {
    if (String(e.message).includes("gas required exceeds")) {
      console.log("⚠️  gas estimate failed — retrying with gasLimit=30_000_000");
      contract = await factory.deploy(...args, { gasLimit: 30_000_000 });
    } else {
      throw e;
    }
  }

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const txHash  = contract.deploymentTransaction()?.hash ?? null;
  console.log(`✅  ${address}`);
  return { address, txHash, args };
}

async function main() {
  // ── Validate Safe address ────────────────────────────────────────────────
  if (!ethers.isAddress(SAFE_ADDRESS)) {
    console.error("❌  SAFE_ADDRESS is not a valid Ethereum address. Check the script.");
    process.exit(1);
  }

  const networkName = hre.network.name;
  const [deployer]  = await ethers.getSigners();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Wikicious V6 — Redeploy 4 Broken Contracts + Transfer to Safe");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Network:   ${networkName}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Safe:      ${SAFE_ADDRESS}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (deployer.address.toLowerCase() === SAFE_ADDRESS.toLowerCase()) {
    console.error("❌  Deployer and Safe are the same address — use a different signer.");
    process.exit(1);
  }

  // ── Load existing deployment file ────────────────────────────────────────
  const deployPath = getDeploymentPath(networkName);
  let deployData = { contracts: {}, deployed: {}, details: {} };
  if (fs.existsSync(deployPath)) {
    deployData = JSON.parse(fs.readFileSync(deployPath, "utf8"));
    console.log(`📄 Loaded existing deployment from ${path.basename(deployPath)}`);
  } else {
    console.log(`⚠️  No existing deployment file found — will create ${path.basename(deployPath)}`);
  }

  const contracts = deployData.contracts || deployData.deployed || {};
  const details   = deployData.details || {};

  // ── Signers for WikiMultisigGuard (Safe + deployer, threshold 2) ─────────
  // These are the addresses that can approve multisig transactions.
  // Update this list to match your actual Safe signers if needed.
  const guardSigners = [
    deployer.address,   // deployer (your hot wallet)
    SAFE_ADDRESS,       // the Safe itself
  ];
  const guardThreshold = 1; // change to 2 if both must co-sign

  // ── Deploy the 4 contracts ───────────────────────────────────────────────
  console.log("📋 Step 1/3 — Deploying 4 contracts\n");

  const deploys = [
    {
      name: "WikiCopyTrading",
      deploy: () => deployOne("WikiCopyTrading", [USDC, PERP, deployer.address]),
    },
    {
      name: "WikiDAOTreasury",
      deploy: () => deployOne("WikiDAOTreasury", [USDC, deployer.address, deployer.address]),
    },
    {
      name: "WikiLiquidStaking",
      deploy: () => deployOne("WikiLiquidStaking", [WIK, deployer.address, 100]),
    },
    {
      name: "WikiMultisigGuard",
      deploy: () => deployOne("WikiMultisigGuard", [guardSigners, guardThreshold]),
    },
  ];

  const newAddresses = {};
  const stillFailed  = [];

  for (const item of deploys) {
    try {
      const result = await item.deploy();
      newAddresses[item.name] = result.address;
      contracts[item.name]    = result.address;
      details[item.name] = {
        address:   result.address,
        txHash:    result.txHash,
        args:      result.args,
        redeployedAt: new Date().toISOString(),
        note: "Redeployed — original had broken ownership transfer",
      };
    } catch (e) {
      console.error(`\n❌  ${item.name} FAILED: ${e.message}`);
      stillFailed.push({ name: item.name, error: e.message });
    }
  }

  // ── Save updated deployment file immediately ─────────────────────────────
  deployData.contracts = contracts;
  deployData.deployed  = contracts;
  deployData.details   = details;
  deployData.lastRedeployTimestamp = new Date().toISOString();
  fs.writeFileSync(deployPath, JSON.stringify(deployData, null, 2));
  console.log(`\n✅  Deployment file updated: ${path.basename(deployPath)}`);

  if (stillFailed.length > 0) {
    console.error(`\n❌  ${stillFailed.length} contract(s) failed to deploy — fix errors and re-run:`);
    stillFailed.forEach(f => console.error(`     • ${f.name}: ${f.error}`));
    process.exit(1);
  }

  // ── Transfer ownership → Safe ────────────────────────────────────────────
  console.log("\n📋 Step 2/3 — Calling transferOwnership() → Safe on each contract\n");

  const OWNABLE2STEP_ABI = [
    "function owner() view returns (address)",
    "function pendingOwner() view returns (address)",
    "function transferOwnership(address newOwner) external",
    "function acceptOwnership() external",
  ];

  const transferResults = [];

  for (const [name, address] of Object.entries(newAddresses)) {
    try {
      const c = new ethers.Contract(address, OWNABLE2STEP_ABI, deployer);

      const currentOwner = await c.owner().catch(() => ethers.ZeroAddress);
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`   ⚠️  ${name.padEnd(22)} owner is ${currentOwner.slice(0,10)}… (not deployer) — SKIPPED`);
        transferResults.push({ name, address, status: "skipped_not_owner", currentOwner });
        continue;
      }

      const pending = await c.pendingOwner().catch(() => ethers.ZeroAddress);
      if (pending.toLowerCase() === SAFE_ADDRESS.toLowerCase()) {
        console.log(`   ✅ ${name.padEnd(22)} Already pending — Safe just needs to acceptOwnership()`);
        transferResults.push({ name, address, status: "already_pending" });
        continue;
      }

      const tx = await c.transferOwnership(SAFE_ADDRESS);
      await tx.wait();
      console.log(`   ✅ ${name.padEnd(22)} transferOwnership() done  (tx: ${tx.hash.slice(0, 20)}…)`);
      transferResults.push({ name, address, status: "transfer_initiated", txHash: tx.hash });

    } catch (e) {
      console.error(`   ❌ ${name.padEnd(22)} FAILED: ${e.message.slice(0, 80)}`);
      transferResults.push({ name, address: newAddresses[name], status: "failed", error: e.message });
    }
  }

  // ── Generate Safe Transaction Batch for acceptOwnership ─────────────────
  console.log("\n📋 Step 3/3 — Generating Safe Transaction Builder batch\n");

  const acceptIface = new ethers.Interface(OWNABLE2STEP_ABI);
  const acceptCalldata = acceptIface.encodeFunctionData("acceptOwnership", []);

  // Safe Transaction Builder batch format
  const safeBatch = {
    version: "1.0",
    chainId: "42161",          // Arbitrum One
    createdAt: Date.now(),
    meta: {
      name: "acceptOwnership — 4 redeployed Wikicious V6 contracts",
      description: "Completes Ownable2Step transfer for WikiCopyTrading, WikiDAOTreasury, WikiLiquidStaking, WikiMultisigGuard",
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: SAFE_ADDRESS,
    },
    transactions: transferResults
      .filter(r => r.status === "transfer_initiated" || r.status === "already_pending")
      .map(r => ({
        to:    r.address,
        value: "0",
        data:  acceptCalldata,
        contractMethod: { inputs: [], name: "acceptOwnership", payable: false },
        contractInputsValues: null,
      })),
  };

  const batchPath = path.join(process.cwd(), "safe-accept-ownership-batch.json");
  fs.writeFileSync(batchPath, JSON.stringify(safeBatch, null, 2));

  // ── Summary ──────────────────────────────────────────────────────────────
  const initiated = transferResults.filter(r =>
    r.status === "transfer_initiated" || r.status === "already_pending"
  );
  const failed = transferResults.filter(r => r.status === "failed");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\n  New contract addresses:");
  for (const [name, addr] of Object.entries(newAddresses)) {
    console.log(`    ${name.padEnd(22)} ${addr}`);
  }
  console.log(`\n  ✅ transferOwnership initiated: ${initiated.length}/4 contracts`);
  if (failed.length > 0) {
    console.log(`  ❌ Failed:                      ${failed.length} contract(s) — re-run`);
  }
  console.log(`\n  📄 Deployment file updated:  ${path.basename(deployPath)}`);
  console.log(`  📄 Safe batch saved:          safe-accept-ownership-batch.json`);

  console.log(`
═══════════════════════════════════════════════════════════════
  NEXT STEP — Complete ownership on Gnosis Safe
═══════════════════════════════════════════════════════════════

  1. Open your Safe at https://app.safe.global
     Safe address: ${SAFE_ADDRESS}
     Network: Arbitrum One (chain 42161)

  2. Go to:  Apps → Transaction Builder
     OR:     https://app.safe.global/apps?appUrl=https://apps.gnosis-safe.io/tx-builder

  3. Click "Import a batch" and upload:
     safe-accept-ownership-batch.json

  4. Review & submit — all 4 acceptOwnership() calls are batched
     in ONE Safe transaction.

  5. Have the required co-signers approve and execute.

  After execution the Safe becomes owner of all 4 contracts. ✅
═══════════════════════════════════════════════════════════════
`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error("\n💥 Unhandled error:", e);
  process.exit(1);
});
