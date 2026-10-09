import type { Annotation } from '@waypost/core';
import { drawAnnotations, type DrawOptions } from './draw';
import { FONT_FAMILY, type Ctx } from './geometry';

/* Phase 1 composition: the recording frame, then annotations. Framing (background, padding, corners), blur, zoom and the logo
   join the pipeline in Phase 2 (docs/02-architecture.md, "Rendering pipeline"). */

export interface ComposeOptions extends DrawOptions {
  /** draw the annotations; the paused editor canvas draws its own overlay for the selected one, so it may leave this on */
  annotations?: readonly Annotation[];
}

/** Draws `frame` stretched over the whole canvas, then the step's annotations. */
export function composeFrame(ctx: Ctx, frame: CanvasImageSource, width: number, height: number, options: ComposeOptions = {}): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame, 0, 0, width, height);
  if (options.annotations?.length) drawAnnotations(ctx, options.annotations, { width, height }, options);
  ctx.restore();
}

/** Makes sure the annotation font is loaded before drawing text, so a callout never renders in a fallback face. */
export async function loadRenderFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([document.fonts.load(`600 20px ${FONT_FAMILY}`), document.fonts.load(`400 14px ${FONT_FAMILY}`)]);
}
