const { ethers } = require("hardhat");

async function main() {
  // Genesis Safe — the new owner for all contracts
  const SAFE = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";

  // The 4 contracts that were missed in the original ownership batch
  // Addresses taken directly from deployments.arbitrum_one.auto.json
  const CONTRACTS = {
    WikiCopyTrading:  "",
    WikiDAOTreasury:  "0x091d53687FF0A6a716A558f714Af4DBB04204e08",
    WikiLiquidStaking:"0xD2107b327FB1b304661EAdB3033D96F961cF99ab",
    WikiMultisigGuard:"0x54E70D534f1904eda2Ec36C2f597463Fa7e871d5",
  };

  const [deployer] = await ethers.getSigners();
  console.log(`Using wallet: ${deployer.address}`);
  console.log(`Transferring ownership to Safe: ${SAFE}\n`);

  const ABI = [
    "function owner() view returns (address)",
    "function pendingOwner() view returns (address)",
    "function transferOwnership(address newOwner) public",
  ];

  for (const [name, address] of Object.entries(CONTRACTS)) {
    console.log(`--- Processing ${name} (${address}) ---`);
    try {
      const contract = new ethers.Contract(address, ABI, deployer);

      const currentOwner = await contract.owner();
      console.log(`  Current owner: ${currentOwner}`);

      if (currentOwner.toLowerCase() === SAFE.toLowerCase()) {
        console.log(`  ✅ Safe already owns this contract — skipping\n`);
        continue;
      }

      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`  ⚠  Deployer is NOT the current owner — skipping\n`);
        continue;
      }

      const tx = await contract.transferOwnership(SAFE);
      console.log(`  Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ transferOwnership confirmed\n`);

    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}\n`);
    }
  }

  console.log("Done. Now go to your Safe and run acceptOwnership() for each contract.");
}

main().catch((err) => { console.error(err); process.exit(1); });
