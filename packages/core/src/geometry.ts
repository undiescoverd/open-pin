import { ZOOM_MAX, ZOOM_MIN } from './constants';
import type { Annotation, Aspect, Blur, Frame, Point, Rect } from './schema';

/* Pure geometry shared by the editor, the renderer and every export: where a blur sits at a time, what part of the frame a zoom
   shows, and where the recording sits on its background. Rects are [x, y, width, height]. */

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth start and end, for zoom and reveal animations. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

// ----- blur ------------------------------------------------------------------------------------------------------------

/** The blur's rectangle at a source time: its keyframes joined by straight lines, held before the first and after the last. */
export function blurRectAt(blur: Pick<Blur, 'keyframes'>, time: number): Rect {
  const k = blur.keyframes;
  const first = k[0]!;
  if (k.length === 1 || time <= first.time) return first.rect;
  const last = k[k.length - 1]!;
  if (time >= last.time) return last.rect;
  const i = k.findIndex(f => f.time > time);
  const a = k[i - 1]!, b = k[i]!;
  const t = (time - a.time) / (b.time - a.time || 1);
  return [lerp(a.rect[0], b.rect[0], t), lerp(a.rect[1], b.rect[1], t), lerp(a.rect[2], b.rect[2], t), lerp(a.rect[3], b.rect[3], t)];
}

/** How strongly the blur covers its rectangle at a source time: 0 outside its time range, ramped by its fades, times its opacity. */
export function blurAlphaAt(blur: Pick<Blur, 'start' | 'end' | 'fadeIn' | 'fadeOut' | 'opacity'>, time: number): number {
  if (time < blur.start - 1e-6 || time > blur.end + 1e-6) return 0;
  let a = 1;
  if (blur.fadeIn > 0) a = Math.min(a, (time - blur.start) / blur.fadeIn);
  if (blur.fadeOut > 0) a = Math.min(a, (blur.end - time) / blur.fadeOut);
  return clamp(a, 0, 1) * blur.opacity;
}

// ----- zoom ------------------------------------------------------------------------------------------------------------

/** A zoom box of `size` (a share of the frame) centred as near to a point as the frame allows. */
export function zoomBox(centre: Point, size: number): Rect {
  const z = clamp(size, ZOOM_MIN, ZOOM_MAX);
  return [clamp(centre[0] - z / 2, 0, 1 - z), clamp(centre[1] - z / 2, 0, 1 - z), z, z];
}

/** How much a zoom box magnifies: 4× for a quarter of the frame. */
export const zoomAmount = (rect: Rect): number => 1 / rect[2];

export const FULL_VIEW: Rect = [0, 0, 1, 1];

/** The part of the recording on screen while easing into a zoom: the whole frame at 0, the zoom box at 1. */
export function viewRect(zoom: Rect | null | undefined, progress: number): Rect {
  if (!zoom || progress <= 0) return FULL_VIEW;
  const t = easeInOut(progress);
  return [lerp(0, zoom[0], t), lerp(0, zoom[1], t), lerp(1, zoom[2], t), lerp(1, zoom[3], t)];
}

const isFull = (v: Rect): boolean => v[0] === 0 && v[1] === 0 && v[2] === 1 && v[3] === 1;

/** A point of the recording as a point of the view. */
export function toView(p: Point, view: Rect): Point {
  return [(p[0] - view[0]) / view[2], (p[1] - view[1]) / view[3]];
}

/** A point of the view as a point of the recording (the inverse of `toView`). */
export function fromView(p: Point, view: Rect): Point {
  return [view[0] + p[0] * view[2], view[1] + p[1] * view[3]];
}

export function rectToView(r: Rect, view: Rect): Rect {
  const [x, y] = toView([r[0], r[1]], view);
  return [x, y, r[2] / view[2], r[3] / view[3]];
}

/**
 * An annotation placed on the zoomed view. Positions move with the zoom; sizes of strokes, markers and text stay the same, so a
 * callout is as readable zoomed as not. Rects are not clamped: a box partly outside the view is cut by the frame's edge.
 */
export function annotationInView<A extends Annotation>(a: A, view: Rect): A {
  if (isFull(view)) return a;
  switch (a.type) {
    case 'click':
      return { ...a, at: toView(a.at, view) };
    case 'callout':
      return { ...a, anchor: toView(a.anchor, view) };
    case 'arrow':
      return { ...a, from: toView(a.from, view), to: toView(a.to, view) };
    case 'box':
    case 'spotlight':
      return { ...a, rect: rectToView(a.rect, view) };
  }
  return a;
}

// ----- framing ---------------------------------------------------------------------------------------------------------

export const ASPECT_RATIOS: Record<Exclude<Aspect, 'source'>, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '4:5': 4 / 5 };

export type Size2 = [number, number];
const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/** Width over height of the output for a frame setting and recording size. */
export function outputAspect(frame: Pick<Frame, 'aspect'>, source: Size2): number {
  return frame.aspect === 'source' ? source[0] / source[1] : ASPECT_RATIOS[frame.aspect];
}

/**
 * The output size that keeps the recording at its own pixel size inside the padding: the smallest frame of the chosen shape
 * whose inner area holds the whole recording. Even numbers, since video encoders need them.
 */
export function nativeOutputSize(frame: Pick<Frame, 'aspect' | 'padding'>, source: Size2): Size2 {
  const ar = outputAspect(frame, source);
  const p = frame.padding;
  const width = Math.max(source[0] / (1 - 2 * p), source[1] / (1 / ar - 2 * p));
  return [even(width), even(width / ar)];
}

/** The output size for a target height (an MP4 preset), keeping the frame's shape. */
export function outputSizeForHeight(frame: Pick<Frame, 'aspect'>, source: Size2, height: number): Size2 {
  return [even(height * outputAspect(frame, source)), even(height)];
}

export interface FrameLayout {
  width: number;
  height: number;
  /** where the recording sits, in output pixels */
  inner: Rect;
  /** whether the recording is inset on a background (then it gets rounded corners and a shadow) */
  inset: boolean;
}

/** Where the recording sits in an output of `size`: centred in the space the padding leaves, keeping its shape. */
export function frameLayout(frame: Pick<Frame, 'aspect' | 'padding'>, source: Size2, size: Size2): FrameLayout {
  const [W, H] = size;
  const pad = frame.padding * W;
  const boxW = Math.max(1, W - 2 * pad), boxH = Math.max(1, H - 2 * pad);
  const scale = Math.min(boxW / source[0], boxH / source[1]);
  const w = source[0] * scale, h = source[1] * scale;
  const inner: Rect = [(W - w) / 2, (H - h) / 2, w, h];
  const inset = inner[0] > 0.5 || inner[1] > 0.5;
  return { width: W, height: H, inner, inset };
}

/** A point on the output as a point on the recording (normalised), for pointer input on a framed canvas. */
export function outputToRecording(p: Point, layout: FrameLayout): Point {
  const [x, y, w, h] = layout.inner;
  return [(p[0] - x) / w, (p[1] - y) / h];
}
