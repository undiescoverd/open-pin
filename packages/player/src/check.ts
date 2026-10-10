import { GUIDE_SCHEMA, type Guide } from '@waypost/core';

/* The player checks the essentials of guide.json by hand rather than with the schema in @waypost/core: Zod alone would take a
   good part of the player's 60 KB budget. The editor validates every guide.json it writes against the full schema. */

export class GuideError extends Error {
  override name = 'GuideError';
}

/** A path inside the guide folder: no other origin, no absolute path, no parent folders. */
export function isGuidePath(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(value) && !value.split('/').includes('..');
}

const isSize = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && n > 0);

export function checkGuide(value: unknown): Guide {
  const g = value as Partial<Guide> | null;
  if (!g || typeof g !== 'object') throw new GuideError("guide.json isn't a Waypost guide.");
  if (typeof g.schema === 'string' && g.schema.startsWith('waypost.guide/') && g.schema !== GUIDE_SCHEMA) {
    throw new GuideError('This guide was made by a newer version of Waypost. Export it again with the matching player.');
  }
  if (g.schema !== GUIDE_SCHEMA) throw new GuideError("guide.json isn't a Waypost guide.");
  if (!isSize(g.size) || !isSize(g.sourceSize) || !g.frame || !g.playback || !g.branding) throw new GuideError('guide.json is incomplete.');
  if (!Array.isArray(g.steps) || g.steps.length === 0) throw new GuideError('This guide has no steps.');
  const paths = [g.poster, g.background, g.logo?.image, g.outro?.file, ...g.steps.flatMap(s => [s.still, s.segment?.file])].filter(p => p != null);
  if (!paths.every(isGuidePath)) throw new GuideError('guide.json points at files outside its folder.');
  if (g.cta && !/^https?:\/\//i.test(g.cta.url)) throw new GuideError('The call to action needs a web address.');
  return g as Guide;
}
