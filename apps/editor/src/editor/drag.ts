import type { PointerEvent as ReactPointerEvent } from 'react';
import { releaseFocus } from './keyboard';

const DRAG_PIXELS = 3;

let dragCounter = 0;
/** A coalesce key for one drag, so the whole drag is a single undo step. */
export const nextDragKey = (prefix = 'trim') => `${prefix}-${++dragCounter}`;

/**
 * Follows a pointer from a press on a bar until it is released. `move` gets the horizontal distance in pixels once the pointer
 * has moved at least 3 px (or 6 px up or down); `end` says whether it ever did. Window listeners, so a bar that re-renders
 * elsewhere (another layer) keeps the drag.
 */
export function follow(e: ReactPointerEvent, handlers: { move: (dx: number, ev: PointerEvent) => void; end: (moved: boolean) => void }): void {
  releaseFocus();
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientX - x0) < DRAG_PIXELS && Math.abs(ev.clientY - y0) < 6) return;
    moved = true;
    handlers.move(ev.clientX - x0, ev);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    handlers.end(moved);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
