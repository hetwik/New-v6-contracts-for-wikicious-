#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function walk(dir, matcher, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "artifacts" || entry.name === "cache" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, matcher, out);
    else if (matcher(p)) out.push(p);
  }
  return out;
}

function grepInFiles(files, regex) {
  const hits = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    const lines = txt.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (regex.test(line)) hits.push({ file: f, line: idx + 1, text: line.trim() });
    });
  }
  return hits;
}

function printHits(title, hits) {
  if (hits.length === 0) {
    console.log(`✅ ${title}: none found`);
    return;
  }
  console.log(`❌ ${title}: ${hits.length} issue(s)`);
  for (const h of hits.slice(0, 50)) {
    console.log(`   - ${path.relative(ROOT, h.file)}:${h.line} -> ${h.text}`);
  }
  if (hits.length > 50) console.log(`   ... ${hits.length - 50} more`);
}

function main() {
  const srcFiles = walk(path.join(ROOT, "src"), (p) => p.endsWith(".sol"));
  const testFiles = walk(path.join(ROOT, "test"), (p) => p.endsWith(".js"));

  const oldTimelockPattern = /msg\.sender == owner\(\) && \(timelock == address\(0\) \|\| msg\.sender == timelock\)/;
  const placeholderPattern = /expect\(true\)\.to\.equal\(true\)/;

  const oldTimelockHits = grepInFiles(srcFiles, oldTimelockPattern);
  const placeholderHits = grepInFiles(testFiles, placeholderPattern);

  console.log("🔎 Mainnet readiness quick checks");
  printHits("Deprecated timelock guard pattern", oldTimelockHits);
  printHits("Placeholder security assertions", placeholderHits);

  let ok = true;
  if (oldTimelockHits.length > 0) ok = false;
  if (placeholderHits.length > 0) ok = false;

  if (!ok) {
    console.log("\n❌ Readiness check failed. Resolve the above findings before mainnet.");
    process.exit(1);
  }

  console.log("\n✅ Readiness check passed.");
}

main();
