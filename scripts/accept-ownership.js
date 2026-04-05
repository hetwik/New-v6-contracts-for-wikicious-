// accept-ownership.js
// Run from your TREASURY wallet AFTER transfer-ownership.js completes
// Usage: npx hardhat run scripts/accept-ownership.js --network arbitrum
//
// This completes the Ownable2Step handshake — treasury becomes owner of all contracts

require('dotenv').config();
const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');
const path = require('path');

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
  const [caller] = await ethers.getSigners();
  console.log('\n🔐 Accept Ownership — Wikicious Contracts');
  console.log(`   Caller wallet:   ${caller.address}\n`);

  // Load transfer results to know which contracts to accept
  const transferPath = path.join(__dirname, '../ownership-transfer.json');
  const deploymentsFile = deploymentFileByNetwork(hre.network.name);
  const deploymentsPath = path.join(__dirname, `../${deploymentsFile}`);

  let contractAddresses = {};
  let targetOwner = process.env.TREASURY_ADDRESS || '';

  if (fs.existsSync(transferPath)) {
    const transfer = JSON.parse(fs.readFileSync(transferPath, 'utf8'));
    console.log(`📄 Loaded transfer log — initiated by ${transfer.from.slice(0,10)}… → ${transfer.to.slice(0,10)}…\n`);
    targetOwner = transfer.to;
    transfer.results.forEach(r => {
      if (r.address) contractAddresses[r.name] = r.address;
    });
  } else if (fs.existsSync(deploymentsPath)) {
    console.log(`⚠️  No ownership-transfer.json found — using ${deploymentsFile}`);
    const d = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    contractAddresses = d.contracts || d.deployed || {};
  } else {
    console.error('❌ No deployments found. Run transfer-ownership.js first.\n');
    process.exit(1);
  }

  if (!targetOwner || !ethers.isAddress(targetOwner)) {
    console.error('❌ Could not determine TREASURY_ADDRESS (target owner).');
    console.error('   Set TREASURY_ADDRESS in .env or run transfer-ownership.js first.\n');
    process.exit(1);
  }

  const callerIsTarget = caller.address.toLowerCase() === targetOwner.toLowerCase();
  if (!callerIsTarget) {
    console.log(`ℹ️  Caller is not target owner (${targetOwner}).`);
    console.log('   Script will generate multisig payloads instead of sending txs.\n');
  }

  const OWNABLE2STEP_ABI = [
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
    'function acceptOwnership() external',
  ];

  const results = [];
  const multisigTxs = [];

  for (const [name, address] of Object.entries(contractAddresses)) {
    if (!address) continue;
    try {
      const contract = new ethers.Contract(address, OWNABLE2STEP_ABI, caller);

      const pending = await contract.pendingOwner().catch(() => ethers.ZeroAddress);
      const current = await contract.owner().catch(() => ethers.ZeroAddress);

      // Already owner
      if (current.toLowerCase() === targetOwner.toLowerCase()) {
        console.log(`   ✅ ${name.padEnd(22)} Already owner — nothing to do`);
        results.push({ name, status: 'already_owner' });
        continue;
      }

      // Not pending owner
      if (pending.toLowerCase() !== targetOwner.toLowerCase()) {
        console.log(`   ⚠️  ${name.padEnd(22)} Not pending owner — run transfer-ownership.js first`);
        results.push({ name, status: 'not_pending' });
        continue;
      }

      if (callerIsTarget) {
        // Accept ownership directly (EOA target owner)
        const tx = await contract.acceptOwnership();
        await tx.wait();
        console.log(`   ✅ ${name.padEnd(22)} Ownership ACCEPTED  (tx: ${tx.hash.slice(0, 18)}…)`);
        results.push({ name, status: 'accepted', txHash: tx.hash });
      } else {
        // Multisig mode: emit calldata payload for Safe transaction builder
        const data = contract.interface.encodeFunctionData('acceptOwnership');
        multisigTxs.push({ to: address, value: '0', data, contract: name });
        console.log(`   🧾 ${name.padEnd(22)} Prepared calldata for multisig acceptOwnership()`);
        results.push({ name, status: 'prepared_multisig' });
      }

    } catch (e) {
      console.log(`   ❌ ${name.padEnd(22)} FAILED — ${e.message.slice(0, 60)}`);
      results.push({ name, status: 'failed', error: e.message });
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  const accepted = results.filter(r => r.status === 'accepted' || r.status === 'already_owner');
  const prepared = results.filter(r => r.status === 'prepared_multisig');
  const failed   = results.filter(r => r.status === 'failed');
  const pending  = results.filter(r => r.status === 'not_pending');

  console.log('\n─────────────────────────────────────────────────');
  console.log(`✅ Accepted:    ${accepted.length} contracts`);
  console.log(`🧾 Prepared:    ${prepared.length} multisig txs`);
  console.log(`⚠️  Pending:    ${pending.length} contracts (re-run transfer script)`);
  console.log(`❌ Failed:      ${failed.length} contracts`);
  console.log('─────────────────────────────────────────────────');

  if (accepted.length > 0 && failed.length === 0 && pending.length === 0) {
    console.log('\n🎉 SUCCESS — Treasury wallet is now owner of all contracts!');
    console.log(`   Owner: ${targetOwner}`);
    console.log('\n   You can now:');
    console.log('   • Withdraw fees via the Admin Dashboard');
    console.log('   • Pause/unpause contracts if needed');
    console.log('   • Update oracle guardians and keepers');
    console.log('\n   🔒 Keep your treasury private key OFFLINE (hardware wallet)');
  }

  if (failed.length > 0) {
    console.log('\n⚠️  Some contracts failed. Re-run this script to retry.');
  }

  // Save final ownership record
  const outPath = path.join(__dirname, '../ownership-accepted.json');
  fs.writeFileSync(outPath, JSON.stringify({
    treasury: targetOwner,
    timestamp: new Date().toISOString(),
    results,
  }, null, 2));
  console.log(`\n📄 Record saved to ownership-accepted.json\n`);

  if (multisigTxs.length > 0) {
    const txOut = path.join(__dirname, '../ownership-accept-multisig-txs.json');
    fs.writeFileSync(txOut, JSON.stringify({
      targetOwner,
      network: hre.network.name,
      txs: multisigTxs
    }, null, 2));
    console.log(`📄 Multisig payload saved to ownership-accept-multisig-txs.json\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
