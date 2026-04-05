/**
 * Verify deployed contracts on Etherscan/Arbiscan.
 * Supports both deploy.js outputs and deploy-all.js outputs.
 */
const hre = require("hardhat");
const { run } = hre;
const fs = require("fs");
const path = require("path");

function findDeploymentFile(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${networkName === "arbitrum_one" ? "arbitrum" : networkName}.json`,
  ];
  for (const file of candidates) {
    const p = path.join(__dirname, `../${file}`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`No deployment file found for ${networkName}. Tried: ${candidates.join(", ")}`);
}

function normalizeRecords(deployment) {
  // deploy-all format
  if (deployment.details && typeof deployment.details === "object") {
    return Object.entries(deployment.details)
      .filter(([, info]) => info && info.address)
      .map(([name, info]) => ({ name, address: info.address, args: info.args || [] }));
  }

  // legacy deploy.js format
  const contracts = deployment.contracts || {};
  return Object.entries(contracts)
    .filter(([, address]) => !!address)
    .map(([name, address]) => ({ name, address, args: [] }));
}

async function main() {
  const deploymentPath = findDeploymentFile(hre.network.name);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const records = normalizeRecords(deployment);

  console.log(`\n🔍 Verifying contracts from ${path.basename(deploymentPath)} on ${hre.network.name}...\n`);

  let ok = 0;
  let skipped = 0;

  for (const rec of records) {
    try {
      await run("verify:verify", {
        address: rec.address,
        constructorArguments: rec.args,
      });
      console.log(`✅ ${rec.name}: ${rec.address}`);
      ok++;
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes("Already Verified") || msg.includes("already verified")) {
        console.log(`✅ ${rec.name}: already verified`);
        ok++;
      } else if (msg.includes("bytecode") || msg.includes("does not have bytecode")) {
        console.log(`⏭️  ${rec.name}: no bytecode at address / not deployable on explorer`);
        skipped++;
      } else {
        console.log(`⚠️  ${rec.name}: ${msg.slice(0, 120)}`);
      }
    }
  }

  console.log("\n─────────────────────────────────────────────────");
  console.log(`✅ Verified: ${ok}`);
  console.log(`⏭️  Skipped : ${skipped}`);
  console.log(`📦 Total   : ${records.length}`);
  console.log("─────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
