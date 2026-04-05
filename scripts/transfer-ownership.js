// transfer-ownership.js
// Run AFTER deployment with your deployer wallet
// Usage: npx hardhat run scripts/transfer-ownership.js --network arbitrum
//
// Step 1: Deployer runs this script → initiates transfer on all 16 contracts
// Step 2: Treasury wallet calls acceptOwnership() on each contract (run accept-ownership.js)

require('dotenv').config();
const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// 🔴 SET THIS before running — your new treasury/hardware wallet
// ─────────────────────────────────────────────────────────────
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '';

function deploymentFileByNetwork(networkName) {
  const candidates = [
    `deployments.${networkName}.auto.json`,
    `deployments.${networkName}.json`,
    `deployments.${networkName === 'arbitrum_one' ? 'arbitrum' : networkName}.json`,
  ];
  for (const f of candidates) {
    const p = path.join(__dirname, `../${f}`);
    if (fs.existsSync(p)) return f;
  }
  return candidates[0];
}

async function main() {
  if (!TREASURY_ADDRESS || !ethers.isAddress(TREASURY_ADDRESS)) {
    console.error('\n❌ ERROR: Set TREASURY_ADDRESS in your .env file');
    console.error('   Example: TREASURY_ADDRESS=0xYourHardwareWalletAddress\n');
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log('\n🔑 Transfer Ownership — Wikicious Contracts');
  console.log(`   From (Deployer):  ${deployer.address}`);
  console.log(`   To   (Treasury):  ${TREASURY_ADDRESS}`);
  console.log('');

  // Sanity check — deployer should NOT be the same as treasury
  if (deployer.address.toLowerCase() === TREASURY_ADDRESS.toLowerCase()) {
    console.error('❌ ERROR: TREASURY_ADDRESS is the same as deployer. Use a different wallet.\n');
    process.exit(1);
  }

  // Load deployed addresses from network-specific file
  const deploymentsFile = deploymentFileByNetwork(hre.network.name);
  const deploymentsPath = path.join(__dirname, `../${deploymentsFile}`);
  if (!fs.existsSync(deploymentsPath)) {
    console.error(`❌ ERROR: ${deploymentsFile} not found.`);
    console.error('   Run: npm run deploy  first\n');
    process.exit(1);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const contracts   = deployments.contracts || deployments.deployed || {};
  console.log(`📄 Loaded ${Object.keys(contracts).length} contract addresses from ${deploymentsFile}\n`);

  // Minimal Ownable2Step ABI — only what we need
  const OWNABLE2STEP_ABI = [
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
    'function transferOwnership(address newOwner) external',
  ];

  // Attempt ownership transfer on every deployed contract that supports Ownable2Step
  const contractList = Object.entries(contracts)
    .filter(([, address]) => address)
    .map(([name, address]) => ({ name, address }));

  console.log(`⚙️  Initiating transferOwnership on ${contractList.length} contracts...\n`);

  const results = [];

  for (const c of contractList) {
    try {
      const contract = new ethers.Contract(c.address, OWNABLE2STEP_ABI, deployer);

      // Verify deployer is currently the owner
      const currentOwner = await contract.owner().catch(() => ethers.ZeroAddress);
      if (currentOwner === ethers.ZeroAddress) {
        console.log(`   ⚠️  ${c.name.padEnd(20)} SKIPPED — no owner()/Ownable2Step ABI`);
        results.push({ name: c.name, status: 'skipped', reason: 'not ownable2step' });
        continue;
      }
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`   ⚠️  ${c.name.padEnd(20)} SKIPPED — owner is ${currentOwner.slice(0,10)}… (not deployer)`);
        results.push({ name: c.name, status: 'skipped', reason: 'not owner' });
        continue;
      }

      // Check if transfer already initiated
      const pending = await contract.pendingOwner().catch(() => ethers.ZeroAddress);
      if (pending.toLowerCase() === TREASURY_ADDRESS.toLowerCase()) {
        console.log(`   ✅ ${c.name.padEnd(20)} Already pending — treasury just needs to accept`);
        results.push({ name: c.name, status: 'already_pending' });
        continue;
      }

      // Initiate transfer
      const tx = await contract.transferOwnership(TREASURY_ADDRESS);
      await tx.wait();
      console.log(`   ✅ ${c.name.padEnd(20)} Transfer initiated  (tx: ${tx.hash.slice(0, 18)}…)`);
      results.push({ name: c.name, status: 'transferred', txHash: tx.hash, address: c.address });

    } catch (e) {
      console.log(`   ❌ ${c.name.padEnd(20)} FAILED — ${e.message.slice(0, 60)}`);
      results.push({ name: c.name, status: 'failed', error: e.message });
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  const ok      = results.filter(r => r.status === 'transferred' || r.status === 'already_pending');
  const skipped = results.filter(r => r.status === 'skipped');
  const failed  = results.filter(r => r.status === 'failed');

  console.log('\n─────────────────────────────────────────────────');
  console.log(`✅ Initiated:   ${ok.length} contracts`);
  console.log(`⚠️  Skipped:    ${skipped.length} contracts`);
  console.log(`❌ Failed:      ${failed.length} contracts`);
  console.log('─────────────────────────────────────────────────');

  // Save results
  const outPath = path.join(__dirname, '../ownership-transfer.json');
  fs.writeFileSync(outPath, JSON.stringify({
    from:      deployer.address,
    to:        TREASURY_ADDRESS,
    timestamp: new Date().toISOString(),
    results,
  }, null, 2));
  console.log(`\n📄 Results saved to ownership-transfer.json`);

  if (failed.length > 0) {
    console.log('\n⚠️  Some contracts failed. Re-run this script to retry.');
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log('🔜 NEXT STEP:');
  console.log(`   Treasury wallet (${TREASURY_ADDRESS.slice(0,10)}…) must now run:`);
  console.log(`   npx hardhat run scripts/accept-ownership.js --network ${hre.network.name}`);
  console.log('   (Fund treasury with ~0.02 ETH for gas first)');
  console.log('─────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
