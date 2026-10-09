import type { Annotation, ArrowAnnotation, CalloutAnnotation } from '@waypost/core';

/* Annotation geometry. Sizes are designed against a 1280 px wide recording (the mockup's space) and scale with the output width,
   so a callout looks the same on a 1280 or a 2880 px recording. Everything here returns pixels of the output. */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface Size {
  width: number;
  height: number;
}
/** x, y, width, height in output pixels */
export type PxRect = [number, number, number, number];

export const REFERENCE_WIDTH = 1280;
export const FONT_FAMILY = 'Figtree, system-ui, sans-serif';

/** Pixels per design pixel. */
export const unit = (size: Size): number => size.width / REFERENCE_WIDTH;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function calloutFont(size: Size): string {
  return `600 ${20 * unit(size)}px ${FONT_FAMILY}`;
}

export interface CalloutLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  side: CalloutAnnotation['placement'];
  /** where the pointer diamond sits along the edge nearest the anchor, measured from the box's left or top edge */
  tip: number;
  lines: string[];
  lineHeight: number;
  padX: number;
  padY: number;
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

/** Where a callout's bubble goes. Measures text, so the context's font is set here and the caller restores state. */
export function layoutCallout(ctx: Ctx, a: CalloutAnnotation, size: Size): CalloutLayout {
  const u = unit(size);
  const { width: W, height: H } = size;
  ctx.font = calloutFont(size);
  const padX = 17 * u, padY = 12 * u, lineHeight = 27 * u;
  const lines = wrap(ctx, a.text || ' ', 296 * u);
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
  const width = clamp(widest + 2 * padX, 120 * u, 330 * u);
  const height = lines.length * lineHeight + 2 * padY;
  const ax = a.anchor[0] * W, ay = a.anchor[1] * H;
  const margin = 12 * u, gap = 22 * u;
  let left: number, top: number, tip: number;
  if (a.placement === 'right' || a.placement === 'left') {
    left = a.placement === 'right' ? ax + gap : ax - gap - width;
    top = clamp(ay - height / 2, margin, H - margin - height);
    tip = clamp(ay - top, 14 * u, height - 14 * u);
  } else {
    left = clamp(ax - width / 2, margin, W - margin - width);
    top = a.placement === 'bottom' ? ay + gap : ay - gap - height;
    tip = clamp(ax - left, 16 * u, width - 16 * u);
  }
  left = clamp(left, margin, W - margin - width);
  top = clamp(top, margin, H - margin - height);
  return { left, top, width, height, side: a.placement, tip, lines, lineHeight, padX, padY };
}

/** The arrow's curve and head, in output pixels. */
export function arrowGeometry(a: ArrowAnnotation, size: Size) {
  const u = unit(size);
  const [x1, y1] = [a.from[0] * size.width, a.from[1] * size.height];
  const [x2, y2] = [a.to[0] * size.width, a.to[1] * size.height];
  const curve = 0.2;
  const cx = (x1 + x2) / 2 - (y2 - y1) * curve, cy = (y1 + y2) / 2 + (x2 - x1) * curve;
  const len = Math.hypot(x2 - cx, y2 - cy) || 1;
  const nx = (x2 - cx) / len, ny = (y2 - cy) / len, head = 26 * u;
  const bx = x2 - nx * head, by = y2 - ny * head;
  const px = -ny * head * 0.55, py = nx * head * 0.55;
  return { x1, y1, x2, y2, cx, cy, bx, by, px, py };
}

const toPx = (r: readonly [number, number, number, number], s: Size): PxRect => [r[0] * s.width, r[1] * s.height, r[2] * s.width, r[3] * s.height];

/** The box around an annotation, for selection outlines and hit-testing. */
export function annotationBox(ctx: Ctx, a: Annotation, size: Size): PxRect {
  const u = unit(size);
  switch (a.type) {
    case 'spotlight':
    case 'box':
      return toPx(a.rect, size);
    case 'click':
      return [a.at[0] * size.width - 26 * u, a.at[1] * size.height - 26 * u, 52 * u, 52 * u];
    case 'arrow': {
      const g = arrowGeometry(a, size);
      const xs = [g.x1, g.x2, g.cx], ys = [g.y1, g.y2, g.cy];
      const pad = 14 * u;
      const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
      return [x, y, Math.max(...xs) + pad - x, Math.max(...ys) + pad - y];
    }
    case 'callout': {
      const l = layoutCallout(ctx, a, size);
      return [l.left, l.top, l.width, l.height];
    }
  }
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx || dy ? clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const inside = (p: readonly [number, number], r: PxRect): boolean => p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];

/** Whether a point (output pixels) is on an annotation. A box is hit on its outline only, unless `interior` says it is the selected one. */
export function hits(ctx: Ctx, a: Annotation, p: readonly [number, number], size: Size, interior = false): boolean {
  const u = unit(size);
  if (a.type === 'arrow') {
    const g = arrowGeometry(a, size);
    let [px, py] = [g.x1, g.y1];
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, mt = 1 - t;
      const qx = mt * mt * g.x1 + 2 * mt * t * g.cx + t * t * g.bx, qy = mt * mt * g.y1 + 2 * mt * t * g.cy + t * t * g.by;
      if (distanceToSegment(p[0], p[1], px, py, qx, qy) <= 12 * u) return true;
      [px, py] = [qx, qy];
    }
    return distanceToSegment(p[0], p[1], g.bx, g.by, g.x2, g.y2) <= 16 * u;
  }
  const box = annotationBox(ctx, a, size);
  if (a.type === 'box' && !interior) {
    const band = 10 * u;
    return inside(p, [box[0] - band, box[1] - band, box[2] + 2 * band, box[3] + 2 * band]) && !inside(p, [box[0] + band, box[1] + band, box[2] - 2 * band, box[3] - 2 * band]);
  }
  return inside(p, box);
}

/** The annotation under a point, topmost first (later annotations draw on top). Pass the selected id to let it claim its interior. */
export function hitTest(ctx: Ctx, annotations: readonly Annotation[], p: readonly [number, number], size: Size, selectedId?: string): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]!;
    if (hits(ctx, a, p, size, a.id === selectedId)) return a;
  }
  return null;
}
