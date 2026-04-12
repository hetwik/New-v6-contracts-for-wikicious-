#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CANONICAL_PATH = path.join(ROOT, 'wikicious_v6_mainnet_all.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  if (!fs.existsSync(CANONICAL_PATH)) {
    throw new Error(`Missing canonical deployment file: ${CANONICAL_PATH}`);
  }

  const canonical = loadJson(CANONICAL_PATH);
  const contracts = canonical.contracts || {};
  const names = Object.keys(contracts);

  if (names.length === 0) {
    throw new Error('wikicious_v6_mainnet_all.json has no contracts');
  }

  const addresses = new Set();
  const compactContracts = {};
  const details = {};

  for (const name of names) {
    const entry = contracts[name];
    if (!entry || !entry.address) {
      throw new Error(`Contract ${name} is missing address in canonical file`);
    }
    compactContracts[name] = entry.address;
    details[name] = {
      address: entry.address,
      txHash: entry.txHash || null,
      args: Array.isArray(entry.args) ? entry.args : [],
      source: 'wikicious_v6_mainnet_all.json',
    };
    addresses.add(entry.address.toLowerCase());
  }

  const nowIso = new Date().toISOString();

  const deployment = {
    network: canonical.network,
    chainId: canonical.chainId,
    deployer: canonical.deployer,
    safe: canonical.safe,
    timestamp: canonical.timestamp || nowIso,
    syncedAt: nowIso,
    sourceOfTruth: 'wikicious_v6_mainnet_all.json',
    totalContracts: names.length,
    uniqueAddresses: addresses.size,
    contracts: compactContracts,
    attemptedContracts: names.length,
    successfulContracts: names.length,
    failedContracts: [],
    deployFailures: [],
    external: canonical.external || {},
    deployed: compactContracts,
    details,
  };

  writeJson(path.join(ROOT, 'deployments.arbitrum_one.json'), deployment);
  writeJson(path.join(ROOT, 'deployments.arbitrum_one.auto.json'), deployment);

  const four = ['WikiCopyTrading', 'WikiDAOTreasury', 'WikiLiquidStaking', 'WikiMultisigGuard'];
  const fourAddresses = Object.fromEntries(
    four.filter((n) => compactContracts[n]).map((n) => [n, compactContracts[n]])
  );
  if (Object.keys(fourAddresses).length > 0) {
    writeJson(path.join(ROOT, 'new-four-addresses.json'), fourAddresses);
  }

  console.log(`✅ Synced mainnet artifacts for ${names.length} contracts (${addresses.size} unique addresses).`);
}

main();
