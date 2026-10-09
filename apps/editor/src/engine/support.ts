/* The editor needs WebCodecs (to read recordings frame by frame), the origin-private file system (to keep projects) and
   OffscreenCanvas in workers. Chromium-based desktop browsers have all of them (docs/02-architecture.md, "Decisions at a glance");
   Safari and Firefox get a plain notice instead of a failure halfway through opening a recording. */

export interface BrowserFeatures {
  VideoDecoder?: unknown;
  OffscreenCanvas?: unknown;
  navigator?: { storage?: { getDirectory?: unknown } };
}

export interface Support {
  ok: boolean;
  /** what is missing, in words */
  missing: string[];
}

export function checkSupport(env: BrowserFeatures = globalThis as BrowserFeatures): Support {
  const missing: string[] = [];
  if (typeof env.VideoDecoder === 'undefined') missing.push('WebCodecs video decoding');
  if (typeof env.navigator?.storage?.getDirectory !== 'function') missing.push('private file storage');
  if (typeof env.OffscreenCanvas === 'undefined') missing.push('offscreen canvases');
  return { ok: missing.length === 0, missing };
}
