#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/split-safe-batch.js <input.json> [chunkSize=75] [outputPrefix]');
  process.exit(1);
}

const input = process.argv[2];
if (!input) usage();
const chunkSize = Number(process.argv[3] || 75);
if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
  throw new Error('chunkSize must be a positive integer');
}

const inputPath = path.resolve(process.cwd(), input);
if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${input}`);
}

const batch = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!batch || !Array.isArray(batch.transactions)) {
  throw new Error('Invalid Safe batch: missing transactions[]');
}

const txs = batch.transactions;
const total = txs.length;
const baseName = process.argv[4] || path.basename(input, '.json');
const parts = Math.ceil(total / chunkSize);

for (let i = 0; i < parts; i++) {
  const start = i * chunkSize;
  const end = Math.min(start + chunkSize, total);
  const partTx = txs.slice(start, end);
  const out = {
    ...batch,
    createdAt: Date.now(),
    meta: {
      ...(batch.meta || {}),
      name: `${batch.meta?.name || baseName} (part ${i + 1}/${parts})`,
      description: `${batch.meta?.description || ''} Split from ${path.basename(input)}; tx ${start}-${end - 1} of ${total}.`.trim(),
    },
    transactions: partTx,
  };

  const outFile = `${baseName}.part${String(i + 1).padStart(2, '0')}.json`;
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`✅ ${outFile} (${partTx.length} tx)`);
}

console.log(`Done. ${total} tx split into ${parts} files (chunkSize=${chunkSize}).`);
