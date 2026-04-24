#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const p = path.resolve(process.cwd(), 'package.json');
const raw = fs.readFileSync(p, 'utf8');

function lineColAt(str, idx) {
  const lines = str.slice(0, idx).split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

try {
  JSON.parse(raw);
  console.log(JSON.stringify({ file: p, valid: true }, null, 2));
} catch (e) {
  const m = /position\s+(\d+)/i.exec(String(e.message || e));
  const pos = m ? Number(m[1]) : null;
  const lc = pos != null ? lineColAt(raw, pos) : null;
  const snippet = pos != null ? raw.slice(Math.max(0, pos - 80), Math.min(raw.length, pos + 80)) : null;
  console.error(JSON.stringify({
    file: p,
    valid: false,
    error: String(e.message || e),
    position: pos,
    line: lc?.line ?? null,
    column: lc?.col ?? null,
    snippet
  }, null, 2));
  process.exit(1);
}
