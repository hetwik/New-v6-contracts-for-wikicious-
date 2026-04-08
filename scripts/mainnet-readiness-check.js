#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function walk(dir, matcher, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'artifacts', 'cache', '.git'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, matcher, out);
    else if (matcher(p)) out.push(p);
  }
  return out;
}

function grepInFiles(files, regex) {
  const hits = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    const lines = txt.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        hits.push({ file: f, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

function printHits(title, hits, max = 50) {
  if (hits.length === 0) {
    console.log(`✅ ${title}: none found`);
    return true;
  }
  console.log(`❌ ${title}: ${hits.length} issue(s)`);
  for (const h of hits.slice(0, max)) {
    console.log(`   - ${path.relative(ROOT, h.file)}:${h.line} -> ${h.text}`);
  }
  if (hits.length > max) console.log(`   ... ${hits.length - max} more`);
  return false;
}

function assertFileExists(relPath, label) {
  const ok = fs.existsSync(path.join(ROOT, relPath));
  console.log(`${ok ? '✅' : '❌'} ${label}: ${relPath}`);
  return ok;
}

function main() {
  const srcFiles = walk(path.join(ROOT, 'src'), (p) => p.endsWith('.sol'));
  const testFiles = walk(path.join(ROOT, 'test'), (p) => p.endsWith('.js'));
  const jsFiles = walk(path.join(ROOT, 'scripts'), (p) => p.endsWith('.js') && !p.endsWith('mainnet-readiness-check.js'));
  const configFiles = [path.join(ROOT, 'hardhat.config.js'), path.join(ROOT, 'package.json')].filter((p) => fs.existsSync(p));

  console.log('🔎 Mainnet readiness checks');

  let ok = true;
  ok &= printHits('Skipped tests (describe.skip/it.skip)', grepInFiles(testFiles, /\b(?:describe|it)\.skip\(/));
  ok &= printHits('Focused tests (describe.only/it.only)', grepInFiles(testFiles, /\b(?:describe|it)\.only\(/));
  const todoHits = grepInFiles([...srcFiles, ...jsFiles], /\b(?:TODO|FIXME|HACK)\b/);
  if (todoHits.length > 0) {
    console.log(`⚠️ TODO/FIXME markers in contracts/scripts: ${todoHits.length} found (manual triage required)`);
    for (const h of todoHits.slice(0, 20)) {
      console.log(`   - ${path.relative(ROOT, h.file)}:${h.line} -> ${h.text}`);
    }
  } else {
    console.log('✅ TODO/FIXME markers in contracts/scripts: none found');
  }
  ok &= printHits('Placeholder security assertions', grepInFiles(testFiles, /expect\(true\)\.to\.equal\(true\)/));

  const hardhatCfg = fs.existsSync(path.join(ROOT, 'hardhat.config.js'))
    ? fs.readFileSync(path.join(ROOT, 'hardhat.config.js'), 'utf8')
    : '';
  const optimizerOn = /optimizer:\s*\{\s*enabled:\s*true/.test(hardhatCfg);
  const viaIROn = /viaIR:\s*true/.test(hardhatCfg);
  const hasMainnetChain = /chainId:\s*42161/.test(hardhatCfg);
  console.log(`${optimizerOn ? '✅' : '❌'} Hardhat optimizer enabled`);
  console.log(`${viaIROn ? '✅' : '❌'} Hardhat viaIR enabled`);
  console.log(`${hasMainnetChain ? '✅' : '❌'} Arbitrum One chainId configured`);
  ok &= optimizerOn && viaIROn && hasMainnetChain;

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  const hasReadyGate = typeof scripts['deploy:mainnet'] === 'string' && scripts['deploy:mainnet'].includes('deploy:mainnet:ready');
  console.log(`${hasReadyGate ? '✅' : '❌'} deploy:mainnet includes readiness+preflight gate`);
  ok &= hasReadyGate;

  ok &= assertFileExists('MAINNET_SECURITY_REVIEW.md', 'Security review doc present');
  ok &= assertFileExists('wikicious-v6-mainnet.env.txt', 'Mainnet env template present');

  if (!ok) {
    console.log('\n❌ Readiness check failed. Resolve all findings before mainnet deployment.');
    process.exit(1);
  }

  console.log('\n✅ Mainnet readiness check passed.');
}

main();
