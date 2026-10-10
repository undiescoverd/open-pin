import type { Blur, Effect, EffectType } from './schema';

/* Effect regions (F7; docs/05-editor-interactions.md, 4.1): each has a stack of effects and sits on a layer of the Effects lane,
   as in DaVinci Resolve. Layers are numbered from 0 at the bottom, with no empty layers, and two regions never overlap in time on
   one layer. The helpers here change `blurs` in place, so commands call them on an Immer draft. Times are source seconds. */

export interface EffectInfo {
  name: string;
  /** the default amount, 0 to 100 */
  amount: number;
  /** what the amount means, for the Inspector */
  label: string;
  unit: string;
  /** the colours it can take, the first being the default; only tint and solid fill have colours */
  colors?: readonly EffectColor[];
}

export const EFFECT_COLORS = {
  ink: '#0E1116',
  gray: '#8A93A3',
  white: '#FFFFFF',
  coral: '#FF5A4E',
  marigold: '#FFB020',
  lagoon: '#13B8A6',
  iris: '#6E6BFF',
} as const;
export type EffectColor = keyof typeof EFFECT_COLORS;

export const EFFECTS: Record<EffectType, EffectInfo> = {
  pixelate: { name: 'Pixelate', amount: 45, label: 'Block size', unit: '' },
  blur: { name: 'Blur', amount: 45, label: 'Amount', unit: '' },
  darken: { name: 'Darken', amount: 40, label: 'Amount', unit: '%' },
  desaturate: { name: 'Desaturate', amount: 100, label: 'Amount', unit: '%' },
  tint: { name: 'Tint', amount: 35, label: 'Strength', unit: '%', colors: ['coral', 'marigold', 'lagoon', 'iris', 'ink', 'white'] },
  solid: { name: 'Solid fill', amount: 100, label: 'Opacity', unit: '%', colors: ['ink', 'gray', 'white', 'coral'] },
};

/** A new effect with its default amount (and colour). */
export function newEffect(type: EffectType, id: string): Effect {
  const info = EFFECTS[type];
  return { id, type, on: true, amount: info.amount, ...(info.colors ? { color: EFFECT_COLORS[info.colors[0]!] } : {}) };
}

/** "Pixelate + Darken", or "No effects". */
export function effectSummary(blur: Pick<Blur, 'effects'>): string {
  return blur.effects.filter(e => e.on).map(e => EFFECTS[e.type].name).join(' + ') || 'No effects';
}

/** "Blur N" with the lowest number no other region uses. */
export function nextBlurName(blurs: ReadonlyArray<Pick<Blur, 'name'>>): string {
  const used = new Set(blurs.map(b => b.name));
  let n = blurs.length + 1;
  while (used.has(`Blur ${n}`)) n++;
  return `Blur ${n}`;
}

type Span = Pick<Blur, 'id' | 'start' | 'end' | 'layer'>;

const EPS = 1e-6;

/** The highest layer in use; -1 with no regions. */
export function topLayer(blurs: readonly Span[]): number {
  return blurs.reduce((m, b) => Math.max(m, b.layer), -1);
}

/** Whether another region on `layer` overlaps `start` to `end`. */
export function overlapsOn(blurs: readonly Span[], layer: number, start: number, end: number, exceptId?: string): boolean {
  return blurs.some(o => o.id !== exceptId && o.layer === layer && o.start < end - EPS && o.end > start + EPS);
}

/** The lowest layer with room for `start` to `end`; a new layer on top if none has. */
export function freeLayer(blurs: readonly Span[], start: number, end: number, exceptId?: string): number {
  const n = topLayer(blurs.filter(b => b.id !== exceptId));
  for (let layer = 0; layer <= n; layer++) if (!overlapsOn(blurs, layer, start, end, exceptId)) return layer;
  return n + 1;
}

/** Renumbers the layers 0 to n-1 in the same order, so the lane never shows an empty row. */
export function compactLayers(blurs: Span[]): void {
  const used = [...new Set(blurs.map(b => b.layer))].sort((a, b) => a - b);
  for (const b of blurs) b.layer = used.indexOf(b.layer);
}

/** Puts any region that overlaps another on its layer onto a new layer at the top. For documents from elsewhere. */
export function separateLayers(blurs: Span[]): void {
  const placed: Span[] = [];
  for (const b of [...blurs].sort((x, y) => x.layer - y.layer || x.start - y.start)) {
    if (overlapsOn(placed, b.layer, b.start, b.end)) b.layer = topLayer(placed) + 1;
    placed.push(b);
  }
  compactLayers(blurs);
}

/** Lifts every region other than `b` on layer `from` and above by one, making room for a new layer at `from`. */
function liftFrom(blurs: Span[], b: Span, from: number): void {
  for (const o of blurs) if (o !== b && o.layer >= from) o.layer++;
}

export type LayerMove = 'up' | 'down' | 'front' | 'back';

/** Whether `b` is alone on the top or bottom layer, so it can't go further that way. */
export function layerEnd(blurs: readonly Span[], id: string): { top: boolean; bottom: boolean } {
  const b = blurs.find(x => x.id === id);
  if (!b) return { top: true, bottom: true };
  const alone = !blurs.some(o => o.id !== id && o.layer === b.layer);
  return { top: alone && b.layer === topLayer(blurs), bottom: alone && b.layer === 0 };
}

/**
 * Bring forward and Send backward pass exactly one layer: into the next layer if it has room, otherwise into a new layer just
 * past it. Bring to front and Send to back make a new layer at the top or bottom. Returns false when it is already there.
 */
export function moveLayer(blurs: Span[], id: string, how: LayerMove): boolean {
  const b = blurs.find(x => x.id === id);
  if (!b) return false;
  const ends = layerEnd(blurs, id);
  if ((how === 'up' || how === 'front') && ends.top) return false;
  if ((how === 'down' || how === 'back') && ends.bottom) return false;
  const L = b.layer, n = topLayer(blurs);
  if (how === 'front') b.layer = n + 1;
  else if (how === 'back') {
    liftFrom(blurs, b, 0);
    b.layer = 0;
  } else if (how === 'up') {
    if (L < n && !overlapsOn(blurs, L + 1, b.start, b.end, b.id)) b.layer = L + 1;
    else {
      liftFrom(blurs, b, L + 2);
      b.layer = L + 2;
    }
  } else if (L > 0 && !overlapsOn(blurs, L - 1, b.start, b.end, b.id)) b.layer = L - 1;
  else {
    const at = Math.max(0, L - 1);
    liftFrom(blurs, b, at);
    b.layer = at;
  }
  compactLayers(blurs);
  return true;
}

/**
 * Dragging a bar onto a row of the Effects lane: `row` is a layer, or above the top (> top layer) or below the bottom (< 0) for a
 * new top or bottom layer. It moves only where it fits; when the row is taken at that time a new layer is slotted in just past
 * it, on the side the bar came from.
 */
export function dropOnLayer(blurs: Span[], id: string, row: number): void {
  const b = blurs.find(x => x.id === id);
  if (!b || row === b.layer) return;
  const n = topLayer(blurs);
  const ends = layerEnd(blurs, id);
  if (row > n) {
    if (!ends.top) b.layer = n + 1;
  } else if (row < 0) {
    if (!ends.bottom) {
      liftFrom(blurs, b, 0);
      b.layer = 0;
    }
  } else if (!overlapsOn(blurs, row, b.start, b.end, b.id)) b.layer = row;
  else {
    const at = row > b.layer ? row + 1 : row;
    liftFrom(blurs, b, at);
    b.layer = at;
  }
  compactLayers(blurs);
}

/**
 * How far a region can reach on its layer without running into a neighbour, judged from where it was (`from`): the end of the
 * nearest region before it and the start of the nearest after it, inside `limit`.
 */
export function layerRoom(blurs: readonly Span[], id: string, from: { start: number; end: number }, limit: { min: number; max: number }): { min: number; max: number } {
  const b = blurs.find(x => x.id === id);
  if (!b) return limit;
  let { min, max } = limit;
  for (const o of blurs) {
    if (o.id === id || o.layer !== b.layer) continue;
    if (o.end <= from.start + EPS) min = Math.max(min, o.end);
    else if (o.start >= from.end - EPS) max = Math.min(max, o.start);
  }
  return { min, max };
}
