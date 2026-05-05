// scripts/fix-remaining-ownership.js
// Handles the 3 contracts skipped by the main ownership transfer:
//   1. WikiMultisigGuard  - regular Ownable (no acceptOwnership), needs transferOwnership(safe) directly
//   2. WikiCopyTrading    - "not owner" at transfer time, need to diagnose current state
//   3. WikiDAOTreasury    - "not owner" at transfer time, need to diagnose current state

const { ethers } = require("hardhat");

const SAFE    = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";
const DEPLOYER = "0x79698a8D914016b770AF796D8F08D660d64C0997";

const CONTRACTS = {
  WikiMultisigGuard: "0x54E70D534f1904eda2Ec36C2f597463Fa7e871d5",
  WikiCopyTrading:   "0x203021D57021b892B794254Fad5a829df6523fD4",
  WikiDAOTreasury:   "0x091d53687FF0A6a716A558f714Af4DBB04204e08",
};

// Minimal ABI covering both Ownable and Ownable2Step
const ABI = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Safe:  ", SAFE);
  console.log("─".repeat(60));

  const results = [];

  for (const [name, address] of Object.entries(CONTRACTS)) {
    console.log(`\n▶ ${name} (${address})`);
    const c = new ethers.Contract(address, ABI, signer);

    let currentOwner, pendingOwner;

    try {
      currentOwner = await c.owner();
      console.log("  owner():", currentOwner);
    } catch {
      console.log("  owner(): NOT AVAILABLE (not Ownable?)");
      results.push({ name, status: "no_owner_function" });
      continue;
    }

    try {
      pendingOwner = await c.pendingOwner();
      console.log("  pendingOwner():", pendingOwner);
    } catch {
      pendingOwner = null;
      console.log("  pendingOwner(): not supported (regular Ownable)");
    }

    // ── CASE A: Safe is already the owner (done) ──────────────────────────
    if (currentOwner.toLowerCase() === SAFE.toLowerCase()) {
      console.log("  ✅ Safe is already owner — nothing to do.");
      results.push({ name, status: "already_done" });
      continue;
    }

    // ── CASE B: Ownable2Step, pendingOwner is Safe (needs acceptOwnership) ─
    if (
      pendingOwner &&
      pendingOwner.toLowerCase() === SAFE.toLowerCase()
    ) {
      console.log("  ⏳ pendingOwner is Safe — acceptOwnership must be called from Safe.");
      console.log("  → Add this contract to your Safe batch (see output JSON below).");
      results.push({ name, address, status: "needs_accept" });
      continue;
    }

    // ── CASE C: Deployer is owner — call transferOwnership ─────────────────
    if (currentOwner.toLowerCase() === DEPLOYER.toLowerCase()) {
      // Ownable2Step: transferOwnership puts it in pending, Safe must then accept
      // Ownable (single-step): transferOwnership completes immediately
      const isOwnable2Step = pendingOwner !== null;

      console.log(
        `  🔑 Deployer is owner. Type: ${isOwnable2Step ? "Ownable2Step" : "Ownable (single-step)"}`
      );
      console.log("  → Calling transferOwnership(safe)...");

      try {
        const tx = await c.transferOwnership(SAFE);
        console.log("  tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("  ✅ Confirmed in block", receipt.blockNumber);

        if (isOwnable2Step) {
          console.log("  ⚠️  Safe must now call acceptOwnership() on this contract.");
          results.push({ name, address, status: "needs_accept", txHash: tx.hash });
        } else {
          console.log("  ✅ Single-step transfer complete — Safe is now owner.");
          results.push({ name, status: "transferred", txHash: tx.hash });
        }
      } catch (err) {
        console.error("  ❌ transferOwnership failed:", err.message);
        results.push({ name, status: "error", error: err.message });
      }
      continue;
    }

    // ── CASE D: Unknown owner ──────────────────────────────────────────────
    console.log(`  ⚠️  Unknown owner (${currentOwner}). Manual investigation needed.`);
    results.push({ name, address, status: "unknown_owner", currentOwner });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("SUMMARY");
  console.log("═".repeat(60));
  for (const r of results) {
    const icon = {
      already_done:         "✅",
      transferred:          "✅",
      needs_accept:         "⏳",
      no_owner_function:    "⚠️ ",
      unknown_owner:        "❌",
      error:                "❌",
    }[r.status] || "?";
    console.log(`  ${icon} ${r.name}: ${r.status}${r.txHash ? " — tx: " + r.txHash : ""}${r.currentOwner ? " — owner: " + r.currentOwner : ""}`);
  }

  // ── Generate a Safe batch for any needs_accept entries ────────────────────
  const needsAccept = results.filter(r => r.status === "needs_accept" && r.address);
  if (needsAccept.length > 0) {
    const batch = {
      version: "1.0",
      chainId: "42161",
      createdAt: Date.now(),
      meta: {
        name: "Accept Ownership - Remaining Contracts",
        description: `acceptOwnership for ${needsAccept.length} contract(s) that were re-queued`,
        txBuilderVersion: "1.16.5",
        createdFromSafeAddress: SAFE,
        createdFromOwnerAddress: "",
      },
      transactions: needsAccept.map(r => ({
        to: r.address,
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

    const fs = require("fs");
    const outPath = "./safe-accept-remaining.json";
    fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
    console.log(`\n📄 Safe batch written to: ${outPath}`);
    console.log("   Import this in Safe Transaction Builder → acceptOwnership for remaining contracts.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
