#!/usr/bin/env node
/* Turns design/tokens.json into the CSS the editor and player read:
 *   packages/ui/src/tokens.css  custom properties (--wp-*), light and dark, usable without Tailwind (the player)
 *   packages/ui/src/theme.css   Tailwind's @theme, mapping utilities such as bg-panel or text-fg-muted onto those properties
 *   packages/player/src/tokens.ts  the roles the player uses, scoped to its root inside the Shadow DOM, as a string
 * `--check` rebuilds in memory and fails if the committed files are stale, so CI catches a forgotten `pnpm tokens`. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const HEADER = '/* Generated from design/tokens.json by scripts/build-tokens.mjs. Do not edit; run `pnpm tokens`. */\n';

/* "{coral.600}" -> "#D13A30"; anything else is passed through */
function resolve(value, path) {
  if (typeof value !== 'string') throw new Error(`${path}: expected a string, got ${JSON.stringify(value)}`);
  return value.replace(/\{([\w.-]+)\}/g, (_, ref) => {
    const hit = ref.split('.').reduce((node, key) => (node == null ? undefined : node[key]), tokens.palette);
    if (typeof hit !== 'string') throw new Error(`${path}: unknown reference {${ref}}`);
    return hit;
  });
}

const decls = (entries, indent = '  ') => entries.map(([name, value]) => `${indent}--wp-${name}: ${value};`).join('\n');
const roles = theme => Object.entries(tokens.theme[theme]).map(([k, v]) => [k, resolve(v, `theme.${theme}.${k}`)]);

const light = roles('light'), dark = roles('dark');
const missing = light.map(([k]) => k).filter(k => !(k in tokens.theme.dark));
const extra = dark.map(([k]) => k).filter(k => !(k in tokens.theme.light));
if (missing.length || extra.length) throw new Error(`light and dark themes must define the same roles (missing in dark: ${missing.join(', ') || 'none'}; only in dark: ${extra.join(', ') || 'none'})`);

const flat = (group, prefix) => Object.entries(tokens[group]).map(([k, v]) => [`${prefix}-${k}`, resolve(v, `${group}.${k}`)]);
const fixed = [...flat('annotation', 'ann'), ...flat('font', 'font'), ...flat('text', 'text'), ...flat('radius', 'radius'), ...flat('motion', 'motion')];

const tokensCss = `${HEADER}
:root {
${decls(fixed)}
}

/* light is the default; [data-theme] on any element forces a theme for that subtree */
:root,
[data-theme='light'] {
  color-scheme: light;
${decls(light)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${decls(dark, '    ')}
  }
}

[data-theme='dark'] {
  color-scheme: dark;
${decls(dark)}
}
`;

/* Tailwind: our tokens replace the default colour palette, so a class can only use a token colour */
const map = (prefix, names, source) => names.map(n => `  --${prefix}-${n}: var(--wp-${source}${n});`).join('\n');
const themeCss = `${HEADER}
@theme inline {
  --color-*: initial;
${map('color', light.map(([k]) => k).filter(k => !k.startsWith('shadow-')), '')}
${map('color', Object.keys(tokens.annotation), 'ann-').replace(/--color-/g, '--color-ann-')}
${map('font', Object.keys(tokens.font), 'font-')}
${map('text', Object.keys(tokens.text), 'text-')}
${map('radius', Object.keys(tokens.radius), 'radius-')}
  --shadow-panel: var(--wp-shadow-panel);
  --shadow-pop: var(--wp-shadow-pop);
  --ease-ui: var(--wp-motion-ease-out);
}
`;

/* The player lives in a Shadow DOM on other people's pages, so its properties hang off its own root (`.wp`) rather than :root,
   and its chrome follows the guide's setting: light, dark, or the viewer's system ("auto"). Only the roles it uses are carried. */
const PLAYER_ROLES = ['app', 'panel', 'raised', 'line', 'line-strong', 'fg', 'fg-muted', 'fg-disabled', 'sel', 'scrim', 'inverse', 'on-inverse', 'shadow-pop'];
const PLAYER_FIXED = ['font-brand', 'font-ui', 'text-sm', 'text-base', 'text-md', 'text-lg', 'text-xl', 'radius-sm', 'radius-md', 'radius-lg', 'radius-pill', 'motion-ui', 'motion-ease-out'];
const pick = (entries, names) => names.map(n => entries.find(([k]) => k === n) ?? (() => { throw new Error(`player token ${n} is not defined`); })());
const playerCss = `.wp{${pick(fixed, PLAYER_FIXED).map(([k, v]) => `--wp-${k}:${v}`).join(';')}}
.wp,.wp[data-chrome=light]{color-scheme:light;${pick(light, PLAYER_ROLES).map(([k, v]) => `--wp-${k}:${v}`).join(';')}}
.wp[data-chrome=dark]{color-scheme:dark;${pick(dark, PLAYER_ROLES).map(([k, v]) => `--wp-${k}:${v}`).join(';')}}
@media (prefers-color-scheme:dark){.wp[data-chrome=auto]{color-scheme:dark;${pick(dark, PLAYER_ROLES).map(([k, v]) => `--wp-${k}:${v}`).join(';')}}}`;
const playerTokens = `${HEADER.replace('/*', '//').replace(' */', '')}
export const TOKENS_CSS = ${JSON.stringify(playerCss)};
`;

const outputs = {
  'packages/ui/src/tokens.css': tokensCss,
  'packages/ui/src/theme.css': themeCss,
  'packages/player/src/tokens.ts': playerTokens,
};

if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([file, css]) => {
    try { return readFileSync(join(root, file), 'utf8') !== css; } catch { return true; }
  });
  if (stale.length) {
    console.error(`Out of date: ${stale.map(([f]) => f).join(', ')}. Run \`pnpm tokens\` and commit the result.`);
    process.exit(1);
  }
  console.log('Design tokens are up to date.');
} else {
  for (const [file, css] of Object.entries(outputs)) writeFileSync(join(root, file), css);
  console.log(`Wrote ${Object.keys(outputs).join(', ')}.`);
}
