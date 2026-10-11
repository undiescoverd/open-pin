import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

/* Renders the editor's pin (apps/editor/public/favicon.svg) to the PNG sizes Chrome wants for an extension. Run when the mark
   changes: `node scripts/make-icons.mjs` with Playwright's Chromium installed. */

const here = path.dirname(fileURLToPath(import.meta.url));
const svg = await readFile(path.join(here, '../../editor/public/favicon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await writeFile(path.join(here, '../icons', `${size}.png`), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();
