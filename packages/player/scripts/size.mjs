#!/usr/bin/env node
/* The player's size budget (docs/02-architecture.md: under 60 KB gzipped, renderer included). Run after `vite build`. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET = 60 * 1024;
const file = join(dirname(fileURLToPath(import.meta.url)), '../dist/player.js');
const bytes = readFileSync(file);
const gzipped = gzipSync(bytes, { level: 9 }).length;
const kb = n => `${(n / 1024).toFixed(1)} KB`;
console.log(`player.js: ${kb(bytes.length)}, ${kb(gzipped)} gzipped (budget ${kb(BUDGET)})`);
if (gzipped > BUDGET) {
  console.error('player.js is over its size budget.');
  process.exit(1);
}
