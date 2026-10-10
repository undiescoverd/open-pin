import { z } from 'zod';
import { GUIDE_SCHEMA } from './constants';
import { nativeOutputSize, type Size2 } from './geometry';
import { exportPlan, guideHold } from './plan';
import { AnnotationSchema, CHROMES, ControlsSchema, FrameSchema, LogoCornerSchema, PLAYBACK_MODES, ZoomSchema, type Project, type Step } from './schema';

/* The published guide (docs/02-architecture.md, "The published guide bundle"): a static folder with `guide.json`, the player, and
   media per step. `guide.json` holds everything the player needs and nothing it doesn't: no clips, no effect regions (those are
   burned into the media), no editing state.

   - `steps/<id>.webp` is the pinned recording frame on its own, effect regions burned in, without framing. The player composes it
     with the framing, logo, zoom and annotations through @waypost/render, the same code as the editor, so a zoom stays sharp and
     eases in as it does in the editor.
   - `seg/<id>.mp4` is the motion leading into a step, framed and with effect regions and logo burned in, the way the MP4 export
     draws it. `seg/outro.mp4` is whatever plays after the last step.
   - `poster.webp` is the first frame, framed, shown behind the start card. */

/** A path inside the guide folder: plain names only, so `guide.json` can't point the player anywhere else. */
const path = z
  .string()
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/)
  .refine(p => !p.split('/').includes('..'), 'no parent folders');
const size = z.tuple([z.number().int().positive(), z.number().int().positive()]);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const media = z.object({ file: path, duration: z.number().positive() });

export const GuideStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  /** seconds on the step before auto and video modes move on */
  hold: z.number().positive(),
  still: path,
  /** the motion leading into the step; null when the step is the very first frame or follows another on the same frame */
  segment: media.nullable(),
  zoom: ZoomSchema.nullable(),
  annotations: z.array(AnnotationSchema),
});

export const GuideSchema = z.object({
  schema: z.literal(GUIDE_SCHEMA),
  id: z.string().min(1),
  title: z.string(),
  /** the framed picture in pixels: segments and the poster are this size, and the player keeps this shape */
  size,
  /** the recording's own size, which fixes where it sits inside the frame */
  sourceSize: size,
  frame: FrameSchema,
  background: path.nullable(),
  logo: z.object({ image: path, corner: LogoCornerSchema, size: z.number(), margin: z.number(), opacity: z.number() }).nullable(),
  poster: path,
  playback: z.object({ mode: z.enum(PLAYBACK_MODES), controls: ControlsSchema }),
  branding: z.object({ accent: colour, chrome: z.enum(CHROMES) }),
  cta: z
    .object({ label: z.string().min(1), url: z.string().regex(/^https?:\/\//i), newTab: z.boolean(), showAt: z.string().min(1) })
    .nullable(),
  steps: z.array(GuideStepSchema).min(1),
  outro: media.nullable(),
  pdf: path.nullable(),
  fonts: z.object({ regular: path, semibold: path }).nullable(),
});

export type GuideStep = z.infer<typeof GuideStepSchema>;
export type Guide = z.infer<typeof GuideSchema>;

export class GuideParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuideParseError';
  }
}

/** Reads a `guide.json` value, for the editor and tests. (The player checks the essentials itself, to stay small.) */
export function parseGuide(value: unknown): Guide {
  const result = GuideSchema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new GuideParseError(`This isn't a valid Waypost guide${first ? ` (${first.path.join('.') || 'root'}: ${first.message})` : ''}.`);
  }
  return result.data;
}

/** Segments and the poster are at most this wide by default (docs/02-architecture.md). */
export const GUIDE_MAX_WIDTH = 1920;
/** Stills are the recording's own size, up to this width, so a zoom stays sharp. */
export const STILL_MAX_WIDTH = 2560;

export const GUIDE_FONTS = { regular: 'fonts/figtree-400.woff2', semibold: 'fonts/figtree-600.woff2' } as const;

/** The guide's picture size: the framed output at the recording's scale, at most `maxWidth` wide, in even pixels for H.264. */
export function guideSize(project: Project, maxWidth = GUIDE_MAX_WIDTH): Size2 {
  const source = project.sources[0]!;
  const [w, h] = nativeOutputSize(project.frame, source.size);
  const scale = Math.min(1, maxWidth / w);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return [even(w), even(h)];
}

/** File-name-safe, unique ids for each step, never `outro` (taken by the last segment). */
export function stepFileIds(steps: readonly Pick<Step, 'id'>[]): Map<string, string> {
  const used = new Set(['outro']);
  const ids = new Map<string, string>();
  for (const step of steps) {
    const base = step.id.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'step';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids.set(step.id, id);
  }
  return ids;
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/avif': 'avif' };

/** A stretch of the timeline to render as one segment file. */
export interface SegmentJob {
  file: string;
  /** timeline seconds */
  from: number;
  to: number;
}

export interface GuidePlan {
  guide: Guide;
  /** each step's frame to render as a still */
  stills: Array<{ file: string; step: Step }>;
  /** the segments to render, in order, the outro last */
  segments: SegmentJob[];
  /** project files to copy into the guide, by the path they get there */
  assets: Array<{ file: string; asset: string }>;
}

export interface GuideOptions {
  maxWidth?: number;
  /** include `guide.pdf` */
  pdf?: boolean;
  /** include the annotation font (the editor's preview has it already) */
  fonts?: boolean;
}

/**
 * What a project publishes as: `guide.json` and the list of media files to render for it. Steps follow the order viewers meet
 * them, and steps cut off the timeline are left out, as in the MP4 export.
 */
export function planGuide(project: Project, options: GuideOptions = {}): GuidePlan {
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording.');
  const plan = exportPlan(project);
  const steps = new Map(project.steps.map(s => [s.id, s]));
  const holds = plan.items.filter(i => i.kind === 'hold');
  const ids = stepFileIds(holds.map(h => ({ id: h.stepId })));
  const stills: GuidePlan['stills'] = [];
  const segments: SegmentJob[] = [];
  const guideSteps: GuideStep[] = [];
  let outro: Guide['outro'] = null;

  for (const [i, item] of plan.items.entries()) {
    if (item.kind === 'play') {
      /* motion with no step after it is the outro */
      if (!plan.items.slice(i + 1).some(n => n.kind === 'hold')) {
        segments.push({ file: 'seg/outro.mp4', from: item.from, to: item.to });
        outro = { file: 'seg/outro.mp4', duration: item.duration };
      }
      continue;
    }
    const step = steps.get(item.stepId)!;
    const id = ids.get(step.id)!;
    const before = plan.items[i - 1];
    let segment: GuideStep['segment'] = null;
    if (before?.kind === 'play') {
      segment = { file: `seg/${id}.mp4`, duration: before.duration };
      segments.push({ file: segment.file, from: before.from, to: before.to });
    }
    const still = `steps/${id}.webp`;
    stills.push({ file: still, step });
    guideSteps.push({ id: step.id, title: step.title, body: step.body, hold: guideHold(step), still, segment, zoom: step.zoom, annotations: step.annotations });
  }

  const assets: GuidePlan['assets'] = [];
  const assetFile = (id: string, name: string): string | null => {
    const asset = project.assets.find(a => a.id === id);
    if (!asset) return null;
    const file = `assets/${name}.${EXTENSIONS[asset.type] ?? 'png'}`;
    assets.push({ file, asset: id });
    return file;
  };
  const bg = project.frame.background;
  const background = bg.type === 'image' ? assetFile(bg.asset, 'background') : null;
  const logoImage = project.logo ? assetFile(project.logo.asset, 'logo') : null;
  const { logo } = project;

  const settings = project.guide;
  const cta = settings.cta;
  const ctaReady = !!cta && cta.label.trim() !== '' && /^https?:\/\/\S+$/i.test(cta.url.trim());

  const guide: Guide = {
    schema: GUIDE_SCHEMA,
    id: project.id,
    title: project.name,
    size: guideSize(project, options.maxWidth),
    sourceSize: source.size,
    /* an image background whose file is missing falls back to none, so the guide never waits for it */
    frame: bg.type === 'image' && !background ? { ...project.frame, background: { type: 'none' } } : project.frame,
    background,
    logo: logo && logoImage ? { image: logoImage, corner: logo.corner, size: logo.size, margin: logo.margin, opacity: logo.opacity } : null,
    poster: 'poster.webp',
    playback: { mode: settings.mode, controls: settings.controls },
    branding: { accent: settings.accent, chrome: settings.chrome },
    cta: ctaReady
      ? { label: cta.label.trim(), url: cta.url.trim(), newTab: cta.newTab, showAt: guideSteps.some(s => s.id === cta.showAt) ? cta.showAt : 'end' }
      : null,
    steps: guideSteps,
    outro,
    pdf: options.pdf ? 'guide.pdf' : null,
    fonts: options.fonts === false ? null : { ...GUIDE_FONTS },
  };
  return { guide, stills, segments, assets };
}
