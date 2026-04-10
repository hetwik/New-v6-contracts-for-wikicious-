// deploy-multisigguard-fix.js
//
// Deploys ONLY WikiMultisigGuard (the one that failed with "threshold too low")
// then transfers ownership to Safe.
//
// Run with deployer wallet:
//   npx hardhat run scripts/deploy-multisigguard-fix.js --network arbitrum_one

require("dotenv").config({ override: true });
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// ── CONFIG ────────────────────────────────────────────────────
const SAFE_ADDRESS = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";

// WikiMultisigGuard: 2-of-2 between deployer and Safe.
// The contract enforces threshold >= 2, so minimum valid setup is 2 signers + threshold 2.
// You can add more signer addresses here if you want a larger pool.
const GUARD_SIGNERS = [
  "0xc01fAE37aE7a4051Eafea26e047f36394054779c", // Safe (signer 1)
  // Add your deployer or other ops wallet as signer 2:
  // "0xYourOtherWallet",
  "0x34f192e2338cdbbccd9afbb06a3f7ac0bd18c128",
];
const GUARD_THRESHOLD = 2; // must be >= 2 per contract validation
// ─────────────────────────────────────────────────────────────

function getDeploymentPath(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
  ];
  for (const f of candidates) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), `deployments.${networkName}.auto.json`);
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();

  // Auto-include deployer in signers if not already present
  const signers = [...new Set([deployer.address, ...GUARD_SIGNERS])];

  console.log("\n══════════════════════════════════════════════════");
  console.log("  Deploy WikiMultisigGuard (threshold fix)");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Network:   ${networkName}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Safe:      ${SAFE_ADDRESS}`);
  console.log(`  Signers:   ${signers.join(", ")}`);
  console.log(`  Threshold: ${GUARD_THRESHOLD} of ${signers.length}`);
  console.log("══════════════════════════════════════════════════\n");

  if (signers.length < GUARD_THRESHOLD) {
    console.error(
      `❌ Not enough signers (${signers.length}) for threshold ${GUARD_THRESHOLD}`
    );
    process.exit(1);
  }

  // ── Deploy ────────────────────────────────────────────────
  process.stdout.write("📦 Deploying WikiMultisigGuard ... ");
  const factory = await ethers.getContractFactory("WikiMultisigGuard");
  const contract = await factory.deploy(signers, GUARD_THRESHOLD);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction()?.hash ?? null;
  console.log(`✅  ${address}`);

  // ── transferOwnership → Safe ──────────────────────────────
  process.stdout.write("🔁 Calling transferOwnership() → Safe ... ");
  const OWNABLE_ABI = [
    "function owner() view returns (address)",
    "function transferOwnership(address) external",
    "function acceptOwnership() external",
  ];
  const c = new ethers.Contract(address, OWNABLE_ABI, deployer);
  const tx = await c.transferOwnership(SAFE_ADDRESS);
  await tx.wait();
  console.log(`✅  tx: ${tx.hash.slice(0, 20)}…`);

  // ── Update deployment JSON ────────────────────────────────
  const deployPath = getDeploymentPath(networkName);
  let data = { contracts: {}, deployed: {}, details: {} };
  if (fs.existsSync(deployPath)) {
    data = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  }
  const contracts = data.contracts || data.deployed || {};
  contracts["WikiMultisigGuard"] = address;
  data.contracts = contracts;
  data.deployed = contracts;
  data.details = data.details || {};
  data.details["WikiMultisigGuard"] = {
    address,
    txHash,
    args: [signers, GUARD_THRESHOLD],
    redeployedAt: new Date().toISOString(),
    note: "Fixed — original failed with threshold too low",
  };
  fs.writeFileSync(deployPath, JSON.stringify(data, null, 2));
  console.log(`\n📄 Deployment file updated: ${path.basename(deployPath)}`);

  // ── Safe batch for acceptOwnership ────────────────────────
  const iface = new ethers.Interface(OWNABLE_ABI);
  const acceptData = iface.encodeFunctionData("acceptOwnership", []);
  const safeBatch = {
    version: "1.0",
    chainId: "42161",
    createdAt: Date.now(),
    meta: {
      name: "acceptOwnership — WikiMultisigGuard",
      createdFromSafeAddress: SAFE_ADDRESS,
    },
    transactions: [
      {
        to: address,
        value: "0",
        data: acceptData,
        contractMethod: { inputs: [], name: "acceptOwnership", payable: false },
        contractInputsValues: null,
      },
    ],
  };
  const batchPath = path.join(process.cwd(), "safe-accept-multisigguard.json");
  fs.writeFileSync(batchPath, JSON.stringify(safeBatch, null, 2));

  console.log(`
══════════════════════════════════════════════════
  WikiMultisigGuard deployed & transfer initiated ✅
══════════════════════════════════════════════════
  New address: ${address}

  NEXT — accept ownership on Safe:
  1. Go to app.safe.global → Apps → Transaction Builder
  2. Import: safe-accept-multisigguard.json
  3. Submit & execute
══════════════════════════════════════════════════
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
