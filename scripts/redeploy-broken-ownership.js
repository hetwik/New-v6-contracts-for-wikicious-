// scripts/redeploy-broken-ownership.js
// WikiCopyTrading and WikiDAOTreasury were deployed with USDC as owner (constructor bug).
// This script redeploys both with the correct owner arg, then immediately
// calls transferOwnership(safe) so the Safe can acceptOwnership.

const { ethers } = require("hardhat");
const fs = require("fs");

const SAFE     = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";
const DEPLOYER = "0x79698a8D914016b770AF796D8F08D660d64C0997";

// Existing deployed addresses we reference as constructor args
const ADDRESSES = {
  USDC:     "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  WikiPerp: "0x723f653a3DEFC45FB934BBF81f1411883a977468",
};

const OWNABLE2STEP_ABI = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function transferOwnership(address newOwner)",
];

async function deploy(contractName, args, signer) {
  console.log(`\n▶ Deploying ${contractName}...`);
  console.log("  args:", args);

  const Factory = await ethers.getContractFactory(contractName, signer);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`  ✅ Deployed at: ${address}`);
  console.log(`  tx: ${contract.deploymentTransaction().hash}`);
  return { contract, address };
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  if (signer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error(`Wrong signer! Expected deployer ${DEPLOYER}, got ${signer.address}`);
  }

  const results = {};

  // ── 1. WikiCopyTrading ────────────────────────────────────────────────────
  // Original broken args: (USDC, WikiPerp, deployer) → owner was set to USDC
  // Correct args: (USDC, WikiPerp, deployer) — verify your contract constructor
  // sets owner = args[2] (the deployer). If it sets owner = args[0], fix below.
  {
    const { contract, address } = await deploy("WikiCopyTrading", [
      ADDRESSES.USDC,
      ADDRESSES.WikiPerp,
      DEPLOYER,  // <-- owner arg, must be the 3rd param in your constructor
    ], signer);

    // Verify owner is deployer
    const c = new ethers.Contract(address, OWNABLE2STEP_ABI, signer);
    const owner = await c.owner();
    console.log(`  owner() = ${owner}`);
    if (owner.toLowerCase() !== DEPLOYER.toLowerCase()) {
      // Owner arg might be first — redeploy with deployer first
      console.warn("  ⚠️  owner is NOT deployer. Check your constructor — trying deployer as first arg...");
      throw new Error(
        "WikiCopyTrading constructor sets owner from unexpected arg position.\n" +
        "Open WikiCopyTrading.sol and find 'Ownable(...)' or 'owner =' to confirm which arg is owner,\n" +
        "then update the args array in this script accordingly."
      );
    }

    console.log("  ✅ Owner is deployer. Calling transferOwnership(safe)...");
    const tx = await c.transferOwnership(SAFE);
    await tx.wait();
    console.log("  ✅ transferOwnership done. Safe must now call acceptOwnership().");

    results.WikiCopyTrading = {
      address,
      deployTx: contract.deploymentTransaction().hash,
      transferTx: tx.hash,
    };
  }

  // ── 2. WikiDAOTreasury ────────────────────────────────────────────────────
  // Original broken args: (USDC, deployer, deployer) → owner was set to USDC
  {
    const { contract, address } = await deploy("WikiDAOTreasury", [
      ADDRESSES.USDC,
      DEPLOYER,
      DEPLOYER,
    ], signer);

    const c = new ethers.Contract(address, OWNABLE2STEP_ABI, signer);
    const owner = await c.owner();
    console.log(`  owner() = ${owner}`);
    if (owner.toLowerCase() !== DEPLOYER.toLowerCase()) {
      console.warn("  ⚠️  owner is NOT deployer. Check constructor arg order.");
      throw new Error(
        "WikiDAOTreasury constructor sets owner from unexpected arg position.\n" +
        "Check which constructor arg maps to Ownable owner."
      );
    }

    console.log("  ✅ Owner is deployer. Calling transferOwnership(safe)...");
    const tx = await c.transferOwnership(SAFE);
    await tx.wait();
    console.log("  ✅ transferOwnership done. Safe must now call acceptOwnership().");

    results.WikiDAOTreasury = {
      address,
      deployTx: contract.deploymentTransaction().hash,
      transferTx: tx.hash,
    };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("NEW ADDRESSES — update your deployments.json with these:");
  console.log("═".repeat(60));
  for (const [name, info] of Object.entries(results)) {
    console.log(`  ${name}: ${info.address}`);
  }

  // ── Generate Safe acceptOwnership batch ───────────────────────────────────
  const batch = {
    version: "1.0",
    chainId: "42161",
    createdAt: Date.now(),
    meta: {
      name: "Accept Ownership - WikiCopyTrading & WikiDAOTreasury",
      description: "Redeployed with correct owner. Safe must call acceptOwnership() on both.",
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: SAFE,
      createdFromOwnerAddress: "",
    },
    transactions: Object.entries(results).map(([name, info]) => ({
      to: info.address,
      value: "0",
      data: null,
      contractMethod: {
        inputs: [],
        name: "acceptOwnership",
        payable: false,
      },
      contractInputsValues: {},
    })),
  };

  const batchPath = "./safe-accept-redeployed.json";
  fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));

  const summaryPath = "./redeployed-addresses.json";
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  console.log(`\n📄 Safe batch written to:      ${batchPath}`);
  console.log(`📄 New addresses written to:   ${summaryPath}`);
  console.log("\n⚠️  Don't forget to:");
  console.log("   1. Update your frontend/backend env vars with the new contract addresses.");
  console.log("   2. Load safe-accept-redeployed.json into Safe Transaction Builder.");
  console.log("   3. Re-run any post-deploy setup (setters, role grants) on the new contracts.");
}

main().catch(err => {
  console.error("\n❌", err.message);
  process.exit(1);
});
