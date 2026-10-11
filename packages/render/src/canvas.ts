export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** A canvas of at least 1 × 1 whole pixels: an OffscreenCanvas where there is one (workers), otherwise a DOM canvas. */
export function makeCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.ceil(width)), h = Math.max(1, Math.ceil(height));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
