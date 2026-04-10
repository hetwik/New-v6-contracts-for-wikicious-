// Run: npx hardhat run scripts/fix-transfer-ownership.js --network arbitrum_one

require("dotenv").config();
const { ethers } = require("hardhat");

const SAFE = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";
const ABI = [
  "function pendingOwner() view returns (address)",
  "function owner() view returns (address)",
  "function transferOwnership(address) external",
];

const CONTRACTS = {
  WikiCopyTrading: "0x63b3Fb44c64f8419857AF297eC0f97604654D4Fd",
  WikiDAOTreasury: "0x81c2D6af7150d0C036AF859880734753f977fb08",
  WikiLiquidStaking: "0x46c49B0b2b0dCE2d06245c3699148A03631399A9",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  for (const [name, addr] of Object.entries(CONTRACTS)) {
    const c = new ethers.Contract(addr, ABI, deployer);
    const owner = await c.owner();
    const pending = await c.pendingOwner();

    console.log(`\n${name} (${addr})`);
    console.log(`  owner:        ${owner}`);
    console.log(`  pendingOwner: ${pending}`);

    if (pending.toLowerCase() === SAFE.toLowerCase()) {
      console.log(
        "  ✅ Already pending — Safe just needs to acceptOwnership()"
      );
      continue;
    }
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log(
        "  ⚠️  Deployer is not owner — cannot call transferOwnership"
      );
      continue;
    }

    const tx = await c.transferOwnership(SAFE);
    await tx.wait();
    console.log(`  ✅ transferOwnership() called — tx: ${tx.hash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
