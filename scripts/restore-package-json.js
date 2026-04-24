#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const tpl = path.resolve(root, 'package.template.json');
const out = path.resolve(root, 'package.json');

if (!fs.existsSync(tpl)) {
  console.error(`Template not found: ${tpl}`);
  process.exit(1);
}

const raw = fs.readFileSync(tpl, 'utf8');
try {
  JSON.parse(raw);
} catch (e) {
  console.error(`Template is invalid JSON: ${e.message || e}`);
  process.exit(1);
}

fs.writeFileSync(out, raw.endsWith('\n') ? raw : `${raw}\n`);
console.log(`Restored ${out} from ${tpl}`);

try {
  JSON.parse(fs.readFileSync(out, 'utf8'));
  console.log('package.json is valid JSON ✅');
} catch (e) {
  console.error(`package.json still invalid: ${e.message || e}`);
  process.exit(1);
}
