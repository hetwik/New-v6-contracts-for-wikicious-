const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });

function deploymentFileByNetwork(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${networkName === "arbitrum_one" ? "arbitrum" : networkName}.json`,
  ];

  for (const file of candidates) {
    const fullPath = path.join(__dirname, `../${file}`);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  return path.join(__dirname, `../${candidates[0]}`);
}

function normalizeKeeperAddress(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || !ethers.isAddress(value)) {
    throw new Error("Set a valid KEEPER_BOT_WALLET in .env");
  }
  return ethers.getAddress(value);
}

async function setKeeperIfSupported(deployer, name, address, keeper) {
  const signatures = [
    { signature: "setKeeper(address,bool)", args: [keeper, true] },
    { signature: "setKeeper(address)", args: [keeper] },
    { signature: "setKeeperBot(address)", args: [keeper] },
  ];

  for (const item of signatures) {
    try {
      const contract = new ethers.Contract(
        address,
        [`function ${item.signature}`],
        deployer
      );

      const fnName = item.signature.split("(")[0];
      process.stdout.write(`🔑 ${name}.${fnName} ... `);
      const tx = await contract[fnName](...item.args);
      await tx.wait();
      console.log("✅");
      return { status: "updated", signature: item.signature, txHash: tx.hash };
    } catch (error) {
      const message = (error && error.message ? error.message : "").toLowerCase();
      const unsupported =
        message.includes("is not a function") ||
        message.includes("unknown function") ||
        message.includes("no matching fragment") ||
        message.includes("function selector was not recognized") ||
        message.includes("execution reverted") ||
        message.includes("call exception");

      if (unsupported) {
        console.log("⚠️ skipped (not supported)");
        continue;
      }

      console.log(`❌ failed (${error.message.split("\n")[0]})`);
      return { status: "failed", signature: item.signature, error: error.message };
    }
  }

  return { status: "skipped", reason: "no keeper setter" };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const keeper = normalizeKeeperAddress(process.env.KEEPER_BOT_WALLET);
  const deploymentPath = deploymentFileByNetwork(hre.network.name);

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${path.basename(deploymentPath)}`);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deployments.contracts || deployments.deployed || deployments.addresses || {};
  const entries = Object.entries(contracts).filter(([, addr]) => addr && ethers.isAddress(addr));

  if (entries.length === 0) {
    throw new Error(`No deployed contracts found in ${path.basename(deploymentPath)}`);
  }

  console.log(`\n🤖 Keeper setup on network: ${hre.network.name}`);
  console.log(`📄 Using deployments: ${path.basename(deploymentPath)}`);
  console.log(`🔐 Deployer: ${deployer.address}`);
  console.log(`🛰️  Keeper:   ${keeper}\n`);

  const results = [];
  for (const [name, addr] of entries) {
    const result = await setKeeperIfSupported(deployer, name, addr, keeper);
    results.push({ name, address: addr, ...result });
  }

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  const outputPath = path.join(__dirname, "../keeper-setup.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        network: hre.network.name,
        deployer: deployer.address,
        keeper,
        timestamp: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  );

  console.log("\n─────────────────────────────────────────────────");
  console.log(`✅ Updated:   ${updated}`);
  console.log(`⚠️  Skipped:   ${skipped}`);
  console.log(`❌ Failed:    ${failed}`);
  console.log("─────────────────────────────────────────────────");
  console.log("📄 Results saved to keeper-setup.json\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
