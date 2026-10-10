import {
  FULL_VIEW,
  annotationInView,
  blurAlphaAt,
  blurRectAt,
  frameLayout,
  rectToView,
  viewRect,
  type Annotation,
  type Blur,
  type Frame,
  type GradientPreset,
  type Logo,
  type Project,
  type Rect,
  type Size2,
  type Step,
  type StepLook,
} from '@waypost/core';
import { drawAnnotations } from './draw';
import { FONT_FAMILY, REFERENCE_WIDTH, type Ctx } from './geometry';

/* The compositor (docs/02-architecture.md, "Rendering pipeline"). Every picture Waypost makes goes through `composeScene`: the
   editor canvas, step thumbnails, screenshots, the PDF and every MP4 frame. In order:
     1. background, padding, rounded corners and shadow (F18)
     2. the recording, through the zoom (F5), with blur regions burned into its pixels (F7)
     3. annotations at their reveal opacity (F5, F6)
     4. logo (F19)
     5. the step title caption (MP4 only, F13) */

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** The framing gradients (docs/03-design-system.md, "Framing presets"): top left to bottom right. */
export const GRADIENTS: Record<GradientPreset, { name: string; stops: [string, string] }> = {
  dusk: { name: 'Dusk', stops: ['#161A21', '#6E6BFF'] },
  reef: { name: 'Reef', stops: ['#0E8F81', '#1F242D'] },
  ember: { name: 'Ember', stops: ['#D13A30', '#FFB020'] },
  paper: { name: 'Paper', stops: ['#F6F7F9', '#D9DDE4'] },
};

/** Solid blur fills. */
export const BLUR_FILLS = { ink: '#0E1116', gray: '#8A93A3', white: '#FFFFFF' } as const;
/** What a video shows where the background is "none", since video has no transparency. */
export const OPAQUE_FALLBACK = '#0E1116';

/** One blur region as it is at the frame's time. */
export interface SceneBlur {
  blur: Pick<Blur, 'style' | 'amount' | 'radius' | 'fill'>;
  /** normalised to the recording */
  rect: Rect;
  /** 0 to 1 */
  alpha: number;
}

export interface Scene {
  /** the recording frame, at any size */
  frame: CanvasImageSource;
  /** the recording's own size in pixels, which fixes its shape */
  sourceSize: Size2;
  framing: Pick<Frame, 'aspect' | 'padding' | 'background' | 'cornerRadius' | 'shadow'>;
  /** decoded background image, when the background is an image */
  backgroundImage?: CanvasImageSource | null;
  blurs?: readonly SceneBlur[];
  /** the part of the recording on screen (the zoom); the whole frame when left out */
  view?: Rect;
  /** annotations in recording coordinates; they are moved through the view */
  annotations?: readonly Annotation[];
  /** opacity per reveal group */
  reveal?: readonly number[];
  logo?: { image: CanvasImageSource; settings: Pick<Logo, 'corner' | 'size' | 'margin' | 'opacity'> } | null;
  caption?: { text: string; alpha: number } | null;
  /** fill "no background" with a colour (MP4 has no transparency) */
  opaque?: boolean;
}

function imageSize(image: CanvasImageSource): Size2 {
  const i = image as { width?: number | { baseVal: { value: number } }; height?: number | { baseVal: { value: number } }; videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number };
  if (typeof i.videoWidth === 'number' && i.videoWidth > 0) return [i.videoWidth, i.videoHeight!];
  if (typeof i.displayWidth === 'number') return [i.displayWidth, i.displayHeight!];
  const w = typeof i.width === 'number' ? i.width : (i.width?.baseVal.value ?? 1);
  const h = typeof i.height === 'number' ? i.height : (i.height?.baseVal.value ?? 1);
  return [w, h];
}

function drawCover(ctx: Ctx, image: CanvasImageSource, width: number, height: number): void {
  const [iw, ih] = imageSize(image);
  const scale = Math.max(width / iw, height / ih);
  const w = iw * scale, h = ih * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function drawBackground(ctx: Ctx, scene: Scene, width: number, height: number): void {
  const bg = scene.framing.background;
  if (bg.type === 'color') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
  } else if (bg.type === 'gradient') {
    const [a, b] = GRADIENTS[bg.preset].stops;
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (bg.type === 'image' && scene.backgroundImage) {
    drawCover(ctx, scene.backgroundImage, width, height);
  } else if (scene.opaque) {
    ctx.fillStyle = OPAQUE_FALLBACK;
    ctx.fillRect(0, 0, width, height);
  }
}

let scratch: AnyCanvas | null = null;
let scratchSmall: AnyCanvas | null = null;
function scratchCanvas(which: 'big' | 'small', width: number, height: number): AnyCanvas {
  let c = which === 'big' ? scratch : scratchSmall;
  if (!c || c.width < width || c.height < height) {
    c = makeCanvas(Math.max(width, c?.width ?? 0), Math.max(height, c?.height ?? 0));
    if (which === 'big') scratch = c;
    else scratchSmall = c;
  }
  return c;
}

/**
 * Burns one blur region into the pixels already on the canvas. Pixelate averages blocks (the safest for text), gaussian blurs, and
 * solid paints over. `u` is output pixels per design pixel of the recording as shown, so the effect covers the same detail at any
 * output size or zoom.
 */
function burnBlur(ctx: Ctx, b: SceneBlur, px: Rect, u: number): void {
  const canvas = ctx.canvas as AnyCanvas;
  /* whole pixels, inside the canvas (a zoom can push part of a region off it) */
  const x = Math.max(0, Math.floor(px[0])), y = Math.max(0, Math.floor(px[1]));
  const w = Math.min(canvas.width, Math.ceil(px[0] + px[2])) - x, h = Math.min(canvas.height, Math.ceil(px[1] + px[3])) - y;
  if (w < 1 || h < 1 || b.alpha <= 0) return;
  const radius = Math.min(b.blur.radius * u, w / 2, h / 2);
  ctx.save();
  ctx.globalAlpha = b.alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  if (b.blur.style === 'solid') {
    ctx.fillStyle = BLUR_FILLS[b.blur.fill];
    ctx.fillRect(x, y, w, h);
  } else if (b.blur.style === 'pixelate') {
    const block = Math.max(2, (4 + b.blur.amount * 0.36) * u);
    const cols = Math.max(1, Math.ceil(w / block)), rows = Math.max(1, Math.ceil(h / block));
    const small = scratchCanvas('small', cols, rows);
    const sctx = small.getContext('2d') as Ctx;
    sctx.clearRect(0, 0, cols, rows);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    /* each block becomes the average of the pixels under it, then is drawn back as one flat square */
    sctx.drawImage(canvas, x, y, w, h, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cols, rows, x, y, w, h);
  } else {
    const r = Math.max(1, (2 + b.blur.amount * 0.3) * u);
    const m = Math.ceil(r * 2);
    const sx = Math.max(0, x - m), sy = Math.max(0, y - m);
    const sw = Math.min(canvas.width, x + w + m) - sx, sh = Math.min(canvas.height, y + h + m) - sy;
    const big = scratchCanvas('big', sw, sh);
    const bctx = big.getContext('2d') as Ctx;
    bctx.clearRect(0, 0, sw, sh);
    bctx.filter = `blur(${r}px)`;
    bctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    bctx.filter = 'none';
    ctx.drawImage(big, 0, 0, sw, sh, sx, sy, sw, sh);
  }
  ctx.restore();
}

function logoRect(logo: NonNullable<Scene['logo']>, width: number, height: number): Rect {
  const [iw, ih] = imageSize(logo.image);
  const w = logo.settings.size * width;
  const h = (w * ih) / Math.max(1, iw);
  const m = logo.settings.margin * width;
  const left = logo.settings.corner.endsWith('l');
  const top = logo.settings.corner.startsWith('t');
  return [left ? m : width - m - w, top ? m : height - m - h, w, h];
}

function drawCaption(ctx: Ctx, text: string, alpha: number, width: number, height: number): void {
  if (!text.trim() || alpha <= 0) return;
  const u = width / REFERENCE_WIDTH;
  const size = 26 * u;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${size}px ${FONT_FAMILY}`;
  const maxWidth = width * 0.8;
  let line = text.trim();
  while (line.length > 1 && ctx.measureText(line).width > maxWidth) line = `${line.slice(0, -2).trimEnd()}…`;
  const tw = ctx.measureText(line).width;
  const padX = 22 * u, padY = 13 * u;
  const bw = tw + padX * 2, bh = size + padY * 2;
  const bx = (width - bw) / 2, by = height - bh - 32 * u;
  ctx.fillStyle = 'rgba(14,17,22,0.86)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, bx + padX, by + bh / 2 + size * 0.04);
  ctx.restore();
}

/** Draws a scene onto a `width` × `height` canvas. */
export function composeScene(ctx: Ctx, width: number, height: number, scene: Scene): void {
  const layout = frameLayout(scene.framing, scene.sourceSize, [width, height]);
  const [ix, iy, iw, ih] = layout.inner;
  const view = scene.view ?? FULL_VIEW;
  const zoomed = view !== FULL_VIEW && (view[0] !== 0 || view[1] !== 0 || view[2] !== 1 || view[3] !== 1);
  const u = iw / REFERENCE_WIDTH;
  const [fw, fh] = imageSize(scene.frame);

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawBackground(ctx, scene, width, height);

  const radius = layout.inset ? Math.min(scene.framing.cornerRadius * u, iw / 2, ih / 2) : 0;
  if (layout.inset && scene.framing.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(14,17,22,0.35)';
    ctx.shadowBlur = 48 * u;
    ctx.shadowOffsetY = 18 * u;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (layout.inset || zoomed) {
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, radius);
    ctx.clip();
  }
  ctx.drawImage(scene.frame, view[0] * fw, view[1] * fh, view[2] * fw, view[3] * fh, ix, iy, iw, ih);

  /* blur goes into the recording's pixels, under the annotations */
  const zoom = 1 / view[2];
  for (const b of scene.blurs ?? []) {
    const r = rectToView(b.rect, view);
    burnBlur(ctx, b, [ix + r[0] * iw, iy + r[1] * ih, r[2] * iw, r[3] * ih], u * zoom);
  }

  if (scene.annotations?.length) {
    ctx.translate(ix, iy);
    const shown = zoomed ? scene.annotations.map(a => annotationInView(a, view)) : scene.annotations;
    drawAnnotations(ctx, shown, { width: iw, height: ih }, { reveal: scene.reveal });
  }
  ctx.restore();

  if (scene.logo) {
    const [lx, ly, lw, lh] = logoRect(scene.logo, width, height);
    ctx.save();
    ctx.globalAlpha = scene.logo.settings.opacity;
    ctx.drawImage(scene.logo.image, lx, ly, lw, lh);
    ctx.restore();
  }
  if (scene.caption) drawCaption(ctx, scene.caption.text, scene.caption.alpha, width, height);
  ctx.restore();
}

/** Decoded images a project's framing and logo need, keyed by asset id. */
export type AssetImages = ReadonlyMap<string, CanvasImageSource>;

export interface SceneOptions {
  /** the recording frame and the source time it shows */
  frame: CanvasImageSource;
  sourceTime: number;
  /** the step on this frame, if any: its annotations and zoom */
  step?: Pick<Step, 'annotations' | 'zoom'> | null;
  /** how far into the step's zoom and reveal; no zoom and every group shown when left out */
  look?: StepLook | null;
  /** leave annotations off (the paused editor draws its own while editing) */
  annotations?: boolean;
  /** replace the step's annotations, e.g. with one being dragged */
  annotationList?: readonly Annotation[];
  assets?: AssetImages;
  caption?: Scene['caption'];
  opaque?: boolean;
}

/** The scene for a project at a source time: its framing, logo, the blurs active then, and the step's zoom and annotations. */
export function sceneFor(project: Project, options: SceneOptions): Scene {
  const source = project.sources[0]!;
  const blurs: SceneBlur[] = [];
  for (const blur of project.blurs) {
    if (blur.source !== source.id) continue;
    const alpha = blurAlphaAt(blur, options.sourceTime);
    if (alpha > 0) blurs.push({ blur, rect: blurRectAt(blur, options.sourceTime), alpha });
  }
  const bg = project.frame.background;
  const logoImage = project.logo ? options.assets?.get(project.logo.asset) : undefined;
  const step = options.step;
  return {
    frame: options.frame,
    sourceSize: source.size,
    framing: project.frame,
    backgroundImage: bg.type === 'image' ? (options.assets?.get(bg.asset) ?? null) : null,
    blurs,
    view: step?.zoom && options.look ? viewRect(step.zoom.rect, options.look.zoom) : FULL_VIEW,
    annotations: options.annotations === false ? [] : (options.annotationList ?? step?.annotations ?? []),
    reveal: options.look?.reveal,
    logo: project.logo && logoImage ? { image: logoImage, settings: project.logo } : null,
    caption: options.caption ?? null,
    opaque: options.opaque,
  };
}

/** Makes sure the annotation font is loaded before drawing text, so a callout never renders in a fallback face. */
export async function loadRenderFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([document.fonts.load(`600 20px ${FONT_FAMILY}`), document.fonts.load(`400 14px ${FONT_FAMILY}`)]);
}

/** In a worker, where there is no stylesheet: registers Figtree from font file bytes. */
export async function registerWorkerFonts(fonts: { regular: ArrayBuffer; semibold: ArrayBuffer }): Promise<void> {
  const set = (globalThis as unknown as { fonts?: FontFaceSet }).fonts;
  if (!set || typeof FontFace === 'undefined') return;
  const faces = [new FontFace('Figtree', fonts.regular, { weight: '400' }), new FontFace('Figtree', fonts.semibold, { weight: '600' })];
  await Promise.all(faces.map(f => f.load()));
  for (const f of faces) set.add(f);
}
