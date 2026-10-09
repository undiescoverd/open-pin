import type { Annotation, ArrowAnnotation, BoxAnnotation, CalloutAnnotation, ClickAnnotation, SpotlightAnnotation } from '@waypost/core';
import { arrowGeometry, calloutFont, layoutCallout, unit, type Ctx, type Size } from './geometry';
import { colourFor } from './palette';

/* Draws annotations onto a canvas context, in output pixels. The editor canvas, the stills and (later) the player and the MP4
   all call this, so what you see is what you export. The shapes match the mockup (design/mockup/editor.html). */

type LayerCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeLayer(width: number, height: number): LayerCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawBox(ctx: Ctx, a: BoxAnnotation, size: Size): void {
  const u = unit(size);
  const c = colourFor(a.color);
  const [x, y, w, h] = [a.rect[0] * size.width, a.rect[1] * size.height, a.rect[2] * size.width, a.rect[3] * size.height];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10 * u);
  ctx.strokeStyle = c.halo;
  ctx.lineWidth = 11 * u;
  ctx.stroke();
  ctx.fillStyle = c.stroke;
  ctx.globalAlpha = 0.08;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 5 * u;
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx: Ctx, a: ArrowAnnotation, size: Size): void {
  const u = unit(size);
  const c = colourFor(a.color);
  const g = arrowGeometry(a, size);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.quadraticCurveTo(g.cx, g.cy, g.bx, g.by);
  };
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(g.x2, g.y2);
    ctx.lineTo(g.bx + g.px, g.by + g.py);
    ctx.lineTo(g.bx - g.px, g.by - g.py);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.halo;
  ctx.fillStyle = c.halo;
  ctx.lineWidth = 13 * u;
  path();
  ctx.stroke();
  head();
  ctx.lineWidth = 6 * u;
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = c.stroke;
  ctx.fillStyle = c.stroke;
  ctx.lineWidth = 7 * u;
  path();
  ctx.stroke();
  head();
  ctx.fill();
  ctx.restore();
}

function drawClick(ctx: Ctx, a: ClickAnnotation, size: Size): void {
  const u = unit(size);
  const c = colourFor(a.color);
  const [x, y] = [a.at[0] * size.width, a.at[1] * size.height];
  ctx.save();
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 4 * u;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x, y, 16 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 21 * u, 0, Math.PI * 2);
  ctx.fillStyle = c.stroke;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3 * u;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 7.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = c.stroke;
  ctx.fill();
  ctx.strokeStyle = c.halo;
  ctx.lineWidth = 3 * u;
  ctx.stroke();
  ctx.restore();
}

function drawCallout(ctx: Ctx, a: CalloutAnnotation, size: Size): void {
  const u = unit(size);
  const c = colourFor(a.color);
  const l = layoutCallout(ctx, a, size);
  const half = 8 * u;
  ctx.save();
  ctx.shadowColor = c.id === 'snow' ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 28 * u;
  ctx.shadowOffsetY = 10 * u;
  ctx.fillStyle = c.fill;
  ctx.beginPath();
  ctx.roundRect(l.left, l.top, l.width, l.height, 14 * u);
  ctx.fill();
  ctx.restore();

  /* the pointer: a rounded diamond centred on the bubble's edge, nearest the anchor */
  ctx.save();
  const tipX = l.side === 'left' ? l.left + l.width + 7 * u - half : l.side === 'right' ? l.left - 7 * u + half : l.left + l.tip;
  const tipY = l.side === 'top' ? l.top + l.height + 7 * u - half : l.side === 'bottom' ? l.top - 7 * u + half : l.top + l.tip;
  ctx.translate(tipX, tipY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = c.fill;
  ctx.beginPath();
  ctx.roundRect(-half, -half, half * 2, half * 2, 3 * u);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = calloutFont(size);
  ctx.fillStyle = c.text;
  ctx.textBaseline = 'middle';
  l.lines.forEach((line, i) => ctx.fillText(line, l.left + l.padX, l.top + l.padY + l.lineHeight * (i + 0.5)));
  ctx.restore();
}

/** Dims the frame except where spotlights are, with a feathered edge (black at 55%, 12 px feather in the design system). */
function drawSpotlights(ctx: Ctx, spots: readonly SpotlightAnnotation[], size: Size): void {
  if (!spots.length) return;
  const u = unit(size);
  const layer = makeLayer(Math.ceil(size.width), Math.ceil(size.height));
  const lctx = layer.getContext('2d') as Ctx;
  lctx.fillStyle = 'rgba(14,17,22,0.55)';
  lctx.fillRect(0, 0, size.width, size.height);
  lctx.globalCompositeOperation = 'destination-out';
  /* a shadow carries the feather; the rectangle itself is drawn off screen so only its shadow and fill cut the hole */
  lctx.fillStyle = '#000';
  lctx.shadowColor = '#000';
  lctx.shadowBlur = 18 * u;
  for (const s of spots) {
    lctx.beginPath();
    lctx.roundRect(s.rect[0] * size.width, s.rect[1] * size.height, s.rect[2] * size.width, s.rect[3] * size.height, 12 * u);
    lctx.fill();
  }
  ctx.drawImage(layer, 0, 0, size.width, size.height);
}

export interface DrawOptions {
  /** show only annotations in reveal groups up to this one (the player reveals them in order); default all */
  revealUpTo?: number;
}

/** Draws one step's annotations: spotlights dim first, then boxes, arrows, click markers, and callouts on top. */
export function drawAnnotations(ctx: Ctx, annotations: readonly Annotation[], size: Size, options: DrawOptions = {}): void {
  const shown = annotations.filter(a => a.reveal <= (options.revealUpTo ?? Infinity));
  drawSpotlights(ctx, shown.filter((a): a is SpotlightAnnotation => a.type === 'spotlight'), size);
  for (const a of shown) {
    if (a.type === 'box') drawBox(ctx, a, size);
    else if (a.type === 'arrow') drawArrow(ctx, a, size);
    else if (a.type === 'click') drawClick(ctx, a, size);
  }
  for (const a of shown) if (a.type === 'callout') drawCallout(ctx, a, size);
}
