/**
 * deploy-four-fresh.js
 * 
 * Deploys WikiCopyTrading, WikiDAOTreasury, WikiLiquidStaking, WikiMultisigGuard
 * fresh with the correct constructor args, then immediately calls
 * transferOwnership(SAFE) so the Safe can acceptOwnership().
 * 
 * Run:
 *   npx hardhat run scripts/deploy-four-fresh.js --network arbitrum_one
 */

const { ethers } = require("hardhat");
const fs = require("fs");

// ── Configuration ─────────────────────────────────────────────────────────────

const SAFE    = "0xc01fAE37aE7a4051Eafea26e047f36394054779c"; // Genesis Safe (2-of-3)
const USDC    = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const WIK     = "0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F"; // WIKToken
const PERP    = "0x723f653a3DEFC45FB934BBF81f1411883a977468"; // WikiPerp

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deploy(name, args) {
  process.stdout.write(`  Deploying ${name}... `);
  const F = await ethers.getContractFactory(name);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`✅ ${addr}`);
  return { contract: c, address: addr };
}

async function transferOwnership(contract, name, newOwner) {
  process.stdout.write(`  transferOwnership(${newOwner.slice(0,10)}...) on ${name}... `);
  const tx = await contract.transferOwnership(newOwner);
  await tx.wait();
  console.log(`✅ tx: ${tx.hash}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" Wikicious V6 — Fresh Deploy 4 Contracts");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(balance)} ETH`);
  console.log(`Safe     : ${SAFE}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const newAddresses = {};
  const safeAcceptTxs = [];   // will build Safe transaction builder JSON

  // ── 1. WikiCopyTrading(owner, usdc, perp) ───────────────────────────────────
  console.log("1. WikiCopyTrading");
  {
    const { contract, address } = await deploy("WikiCopyTrading", [deployer.address, USDC, PERP]);
    await transferOwnership(contract, "WikiCopyTrading", SAFE);
    newAddresses.WikiCopyTrading = address;
    safeAcceptTxs.push(buildAcceptTx(address));
    console.log();
  }

  // ── 2. WikiDAOTreasury(owner, usdc, wik) ────────────────────────────────────
  console.log("2. WikiDAOTreasury");
  {
    const { contract, address } = await deploy("WikiDAOTreasury", [deployer.address, USDC, WIK]);
    await transferOwnership(contract, "WikiDAOTreasury", SAFE);
    newAddresses.WikiDAOTreasury = address;
    safeAcceptTxs.push(buildAcceptTx(address));
    console.log();
  }

  // ── 3. WikiLiquidStaking(wik, owner, protocolFeeBps) ─────────────────────────────────────────────
  console.log("3. WikiLiquidStaking");
  {
    const { contract, address } = await deploy("WikiLiquidStaking", [WIK, deployer.address, 500]);
    await transferOwnership(contract, "WikiLiquidStaking", SAFE);
    newAddresses.WikiLiquidStaking = address;
    safeAcceptTxs.push(buildAcceptTx(address));
    console.log();
  }

  // ── 4. WikiMultisigGuard(signers[], threshold) ──────────────────────────────
  // No Ownable — just deploy with Safe as the only signer, threshold 1
  // The Safe can later call addSigner() to add more signers
  console.log("4. WikiMultisigGuard");
  {
    process.stdout.write(`  Deploying WikiMultisigGuard... `);
    const F = await ethers.getContractFactory("WikiMultisigGuard");
    const c = await F.deploy([SAFE], 1);   // Safe is signer #1, threshold = 1
    await c.waitForDeployment();
    const address = await c.getAddress();
    console.log(`✅ ${address}`);
    // WikiMultisigGuard has no Ownable — no transferOwnership needed
    newAddresses.WikiMultisigGuard = address;
    console.log(`  (No Ownable — Safe is already signer #1)\n`);
  }

  // ── Save results ─────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("NEW ADDRESSES:");
  for (const [k, v] of Object.entries(newAddresses)) {
    console.log(`  ${k}: ${v}`);
  }

  // Write new-addresses.json
  fs.writeFileSync("new-four-addresses.json", JSON.stringify(newAddresses, null, 2));
  console.log("\n✅ Saved: new-four-addresses.json");

  // Write Safe transaction builder JSON (acceptOwnership batch)
  const safeBatch = {
    version: "1.0",
    chainId: "42161",
    createdAt: Date.now(),
    meta: {
      name: "Accept Ownership — 4 Fresh Contracts",
      description: "Call acceptOwnership() on WikiCopyTrading, WikiDAOTreasury, WikiLiquidStaking. WikiMultisigGuard has no Ownable.",
    },
    transactions: safeAcceptTxs,
  };
  fs.writeFileSync("safe-accept-four-fresh.json", JSON.stringify(safeBatch, null, 2));
  console.log("✅ Saved: safe-accept-four-fresh.json  ← import this into Safe Transaction Builder");

  // Patch the mainnet deployments JSON
  const depFile = "deployments.arbitrum_one.auto.json";
  if (fs.existsSync(depFile)) {
    const dep = JSON.parse(fs.readFileSync(depFile, "utf8"));
    Object.assign(dep.deployed, newAddresses);
    fs.writeFileSync(depFile, JSON.stringify(dep, null, 2));
    console.log(`✅ Updated: ${depFile}`);
  }

  console.log("\nNext step: Import safe-accept-four-fresh.json into Safe Transaction Builder");
  console.log(`Safe URL: https://app.safe.global/arb1:${SAFE}/transactions/builder`);
}

// ── Build acceptOwnership transaction for Safe builder ────────────────────────
function buildAcceptTx(contractAddress) {
  return {
    to: contractAddress,
    value: "0",
    data: "0x",
    contractMethod: {
      inputs:  [],
      name:    "acceptOwnership",
      payable: false,
    },
    contractInputsValues: {},
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
