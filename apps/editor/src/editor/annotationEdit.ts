import { clamp01, newId, type Annotation, type AnnotationType, type Point, type Rect } from '@waypost/core';
import { DEFAULT_CALLOUT_COLOR } from '@waypost/render';
import type { CalloutPlacement } from '@waypost/core';

/* Pure geometry for drawing, moving and resizing annotations on the frame. Everything is normalised (0 to 1 of the recording
   frame); `frame` carries the pixel size so minimums such as "at least 8 px" can be expressed in pixels. */

export interface FrameSize {
  width: number;
  height: number;
}

export type RectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RECT_HANDLES: readonly RectHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export type ArrowHandle = 'from' | 'to';
export type Handle = RectHandle | ArrowHandle;

/** A drag shorter than this fraction of the frame draws a default-size shape instead (docs/05-editor-interactions.md, 5.1). */
export const DRAW_THRESHOLD = 0.015;
/** The smallest box or spotlight, in pixels of the recording. */
export const MIN_RECT_PX = 8;

export const hasRect = (a: Annotation): a is Extract<Annotation, { rect: Rect }> => a.type === 'box' || a.type === 'spotlight';

/** Where a callout's bubble should sit so it stays on the frame, judged from where it points. */
export function autoPlacement(at: Point): CalloutPlacement {
  if (at[0] < 0.18) return 'right';
  if (at[0] > 0.82) return 'left';
  return at[1] > 0.7 ? 'top' : 'bottom';
}

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  const x = clamp01(Math.min(a[0], b[0])), y = clamp01(Math.min(a[1], b[1]));
  return [x, y, clamp01(Math.max(a[0], b[0])) - x, clamp01(Math.max(a[1], b[1])) - y];
}

/** A default-size box centred on a point, kept inside the frame. */
export function defaultRect(at: Point, size: [number, number] = [0.2, 0.12]): Rect {
  const [w, h] = size;
  return [Math.min(Math.max(at[0] - w / 2, 0), 1 - w), Math.min(Math.max(at[1] - h / 2, 0), 1 - h), w, h];
}

/** A new annotation from a pointer gesture: `start` is where it began, `end` where the pointer is (equal for a plain click). */
export function createAnnotation(type: Exclude<AnnotationType, 'click'>, start: Point, end: Point, color: string): Annotation {
  const id = newId('a');
  const dragged = Math.hypot(end[0] - start[0], end[1] - start[1]) >= DRAW_THRESHOLD;
  switch (type) {
    case 'callout':
      return { id, type, anchor: start, text: 'Add a short note', placement: autoPlacement(start), color: DEFAULT_CALLOUT_COLOR, reveal: 0 };
    case 'arrow': {
      const from: Point = dragged ? start : [clamp01(start[0] - 0.12), clamp01(start[1] - 0.1)];
      return { id, type, from, to: dragged ? end : start, color, reveal: 0 };
    }
    case 'box':
      return { id, type, rect: dragged ? rectBetween(start, end) : defaultRect(start), color, reveal: 0 };
    case 'spotlight':
      return { id, type, rect: dragged ? rectBetween(start, end) : defaultRect(start, [0.24, 0.16]), reveal: 0 };
  }
}

const shift = (p: Point, dx: number, dy: number): Point => [p[0] + dx, p[1] + dy];

/** Moves an annotation by a normalised delta, stopping at the frame edges so it can't be dragged out of reach. */
export function moveAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'box':
    case 'spotlight': {
      const [x, y, w, h] = a.rect;
      return { ...a, rect: [Math.min(Math.max(x + dx, 0), 1 - w), Math.min(Math.max(y + dy, 0), 1 - h), w, h] };
    }
    case 'arrow': {
      const xs = [a.from[0], a.to[0]], ys = [a.from[1], a.to[1]];
      const ddx = Math.min(Math.max(dx, -Math.min(...xs)), 1 - Math.max(...xs));
      const ddy = Math.min(Math.max(dy, -Math.min(...ys)), 1 - Math.max(...ys));
      return { ...a, from: shift(a.from, ddx, ddy), to: shift(a.to, ddx, ddy) };
    }
    case 'click':
      return { ...a, at: [clamp01(a.at[0] + dx), clamp01(a.at[1] + dy)] };
    case 'callout':
      return { ...a, anchor: [clamp01(a.anchor[0] + dx), clamp01(a.anchor[1] + dy)] };
  }
}

/** Drags one handle of a box or spotlight. The opposite edges stay put; the size can't go under the minimum or leave the frame. */
export function resizeRect(rect: Rect, handle: RectHandle, dx: number, dy: number, frame: FrameSize): Rect {
  let [left, top, right, bottom] = [rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]];
  const minW = MIN_RECT_PX / frame.width, minH = MIN_RECT_PX / frame.height;
  if (handle.includes('w')) left = Math.min(Math.max(left + dx, 0), right - minW);
  if (handle.includes('e')) right = Math.max(Math.min(right + dx, 1), left + minW);
  if (handle.includes('n')) top = Math.min(Math.max(top + dy, 0), bottom - minH);
  if (handle.includes('s')) bottom = Math.max(Math.min(bottom + dy, 1), top + minH);
  return [left, top, right - left, bottom - top];
}

/** Applies a handle drag to an annotation: resizes a rectangle, or moves one end of an arrow. */
export function dragHandle(a: Annotation, handle: Handle, dx: number, dy: number, frame: FrameSize): Annotation {
  if (hasRect(a) && handle !== 'from' && handle !== 'to') return { ...a, rect: resizeRect(a.rect, handle, dx, dy, frame) };
  if (a.type === 'arrow' && (handle === 'from' || handle === 'to')) {
    const p = a[handle];
    return { ...a, [handle]: [clamp01(p[0] + dx), clamp01(p[1] + dy)] as Point };
  }
  return a;
}

/** Where each handle of an annotation sits, in normalised coordinates. Empty for annotations that only move. */
export function handlePositions(a: Annotation): Array<{ handle: Handle; at: Point }> {
  if (a.type === 'arrow') return [{ handle: 'from', at: a.from }, { handle: 'to', at: a.to }];
  if (!hasRect(a)) return [];
  const [x, y, w, h] = a.rect;
  const at: Record<RectHandle, Point> = {
    nw: [x, y],
    n: [x + w / 2, y],
    ne: [x + w, y],
    e: [x + w, y + h / 2],
    se: [x + w, y + h],
    s: [x + w / 2, y + h],
    sw: [x, y + h],
    w: [x, y + h / 2],
  };
  return RECT_HANDLES.map(handle => ({ handle, at: at[handle] }));
}

export const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  from: 'grab',
  to: 'grab',
};
