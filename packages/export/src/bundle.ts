import { PLAYER_BAR_HEIGHT as BAR_HEIGHT, embedSnippets, escapeHtml, type Guide } from '@waypost/core';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

/* Puts a published guide together (F11): the rendered media, guide.json, the player, a standalone index.html and a sheet of embed
   snippets, written to a folder the person picks or zipped for download. The folder works on any static host as it is. */

export interface BundleFile {
  /** path inside the guide folder */
  path: string;
  data: Blob | string;
}

/** The guide's own page: the player, as large as fits, and the PDF copy for anyone who'd rather read. It is the iframe target too. */
export function guideIndexHtml(guide: Guide): string {
  /* the page fits the player, picture and controls, on screen; svh where the browser has it, so mobile toolbars don't count */
  const a = (guide.size[0] / guide.size[1]).toFixed(4);
  const dark = '#0E1116', light = '#ECEFF3';
  const background =
    guide.branding.chrome === 'dark' ? `body{background:${dark};color:#ECEFF3}`
    : guide.branding.chrome === 'light' ? `body{background:${light};color:#0E1116}`
    : `body{background:${light};color:#0E1116}@media (prefers-color-scheme:dark){body{background:${dark};color:#ECEFF3}}`;
  const n = guide.steps.length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(guide.title || 'Guide')}</title>
<meta name="description" content="An interactive guide in ${n} step${n === 1 ? '' : 's'}.">
<meta name="generator" content="Waypost">
<style>
html,body{margin:0}
body{display:grid;place-items:center;min-height:100vh;min-height:100svh;padding:24px;box-sizing:border-box;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
${background}
main{width:min(1100px,100%,calc((100vh - ${48 + BAR_HEIGHT}px) * ${a}));width:min(1100px,100%,calc((100svh - ${48 + BAR_HEIGHT}px) * ${a}))}
.framed body{padding:0}
.framed main{width:min(100%,calc((100vh - ${BAR_HEIGHT}px) * ${a}));width:min(100%,calc((100svh - ${BAR_HEIGHT}px) * ${a}))}
.framed footer{display:none}
footer{margin-top:12px;text-align:center;opacity:.7}
a{color:inherit}
</style>
<script>if (window.self !== window.top) document.documentElement.classList.add('framed');</script>
</head>
<body>
<main>
<div data-waypost="guide.json"></div>
${guide.pdf ? `<footer><a href="${escapeHtml(guide.pdf)}">Download the guide as a PDF</a></footer>\n` : ''}<noscript>This guide needs JavaScript.${guide.pdf ? ` <a href="${escapeHtml(guide.pdf)}">Read the PDF copy</a> instead.` : ''}</noscript>
</main>
<script src="player.js" async></script>
</body>
</html>
`;
}

/** embed.txt: how to host the folder and the snippets, with the address filled in when the person gave one. */
export function embedText(guide: Guide, slug: string, base?: string): string {
  const root = base?.trim() ? base.trim().replace(/\/*$/, '/') : `https://YOUR-SITE/guides/${slug}/`;
  const s = embedSnippets(guide, root);
  return `${guide.title || 'Guide'}: an interactive guide made with Waypost

1. Upload this folder to any static host: GitHub Pages, Cloudflare Pages, Netlify, S3 or your own server.
${base?.trim() ? '' : `   Below, replace https://YOUR-SITE/guides/${slug}/ with the address the folder ends up at.\n`}
2. Share the standalone page:

${s.link}

3. Or put the guide on any page with these two lines:

${s.script}

4. Or, on a site that strips scripts, use an iframe:

${s.iframe}

If the page and the guide are on different sites, the guide's host must allow cross-origin requests
(an Access-Control-Allow-Origin header). GitHub Pages sends one. Where yours doesn't, use the iframe.
`;
}

/** Media is compressed already, so the zip only stores it; text is deflated. */
const STORE = /\.(mp4|webp|png|jpe?g|gif|avif|woff2?|pdf)$/i;

/** Zips the guide inside a folder named `folder`, streaming each file in so large media is read a piece at a time. */
export async function zipBundle(files: readonly BundleFile[], folder: string): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let failure: unknown = null;
  let finished!: () => void;
  const done = new Promise<void>(resolve => (finished = resolve));
  const zip = new Zip((error, chunk, final) => {
    if (error) failure = error;
    else parts.push(chunk as Uint8Array<ArrayBuffer>);
    if (error || final) finished();
  });
  for (const file of files) {
    const name = `${folder}/${file.path}`;
    const entry = STORE.test(file.path) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    const blob = typeof file.data === 'string' ? new Blob([file.data]) : file.data;
    const reader = blob.stream().getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      entry.push(value);
      if (failure) throw failure;
    }
    entry.push(new Uint8Array(0), true);
  }
  zip.end();
  await done;
  if (failure) throw failure;
  return new Blob(parts, { type: 'application/zip' });
}

/**
 * Writes the guide into a folder the person picked (File System Access API). Stills and segments from an earlier export of the
 * same guide are cleared first, so files for deleted steps don't linger.
 */
export async function writeBundle(dir: FileSystemDirectoryHandle, files: readonly BundleFile[]): Promise<void> {
  for (const stale of ['steps', 'seg']) await dir.removeEntry(stale, { recursive: true }).catch(() => undefined);
  for (const file of files) {
    const parts = file.path.split('/');
    let folder = dir;
    for (const name of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(name, { create: true });
    const handle = await folder.getFileHandle(parts[parts.length - 1]!, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(file.data);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }
}
