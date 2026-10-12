import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync } from 'fflate';
import { build } from 'vite';

/* Builds the extension into dist/: three scripts (each a single file, since content scripts can't import modules) and a manifest
   whose bridge only runs on the editor's own pages. Flags: --out=DIR builds somewhere else; --dev also allows http://localhost and http://127.0.0.1 (for running the
   editor locally and for the browser tests); --zip also writes waypost-click-capture.zip for the Chrome Web Store.
   WAYPOST_EDITOR_ORIGINS="https://guides.example.com" (comma separated) adds the pages of a self-hosted editor. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args);
const out = args.find(a => a.startsWith('--out='))?.slice('--out='.length);
const dist = out ? path.resolve(out) : path.join(root, 'dist');

const PRODUCTION = ['https://waypost-ac2.pages.dev/*', 'https://*.waypost-ac2.pages.dev/*'];
const LOCAL = ['http://localhost/*', 'http://127.0.0.1/*'];
const extra = (process.env.WAYPOST_EDITOR_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)
  .map(origin => `${origin}/*`);
const editorPages = [...PRODUCTION, ...extra, ...(flags.has('--dev') ? LOCAL : [])];

await rm(dist, { recursive: true, force: true });
const entries = { background: 'src/background.ts', capture: 'src/capture.ts', bridge: 'src/bridge.ts' };
for (const [name, entry] of Object.entries(entries)) {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: 'chrome110',
      lib: { entry, name: `waypost_${name}`, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };
const manifest = {
  manifest_version: 3,
  name: 'Waypost click capture',
  version: pkg.version,
  description: 'While Waypost records a browser tab, logs each click (where it was and what it was on) so the guide starts with a step at every click. Everything stays in your browser.',
  minimum_chrome_version: '110',
  icons,
  action: { default_title: 'Waypost click capture', default_icon: icons },
  permissions: ['storage'],
  background: { service_worker: 'background.js' },
  content_scripts: [
    { matches: ['<all_urls>'], js: ['capture.js'], run_at: 'document_start', all_frames: false },
    { matches: editorPages, js: ['bridge.js'], run_at: 'document_idle', all_frames: false },
  ],
};
await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(path.join(dist, 'icons'), { recursive: true });
await cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });

if (flags.has('--zip')) {
  const files = {};
  for (const file of ['background.js', 'capture.js', 'bridge.js', 'manifest.json', ...Object.values(icons)]) files[file] = new Uint8Array(await readFile(path.join(dist, file)));
  await writeFile(path.join(root, 'waypost-click-capture.zip'), zipSync(files));
}
console.log(`Built the extension in ${path.relative(process.cwd(), dist) || '.'}${flags.has('--dev') ? ' (with localhost)' : ''}.`);
