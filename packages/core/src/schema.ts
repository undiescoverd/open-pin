import { z } from 'zod';
import { MAX_SPEED, MIN_SPEED, REVEAL_GROUPS, ZOOM_MAX, ZOOM_MIN } from './constants';
import { separateLayers } from './effects';

export { MAX_SPEED, MIN_SPEED, REVEAL_GROUPS, ZOOM_MAX, ZOOM_MIN };

/* The project document (docs/02-architecture.md, "Data model"). Zod is the single source of truth: the types below are inferred
   from it, and `parseProject` validates anything read from disk. Geometry is normalised: 0 to 1 of the recording frame. */

export const SCHEMA_VERSION = 'waypost.project/3';

const unit = z.number().min(0).max(1);
/** A point on the recording frame, normalised. It may sit slightly outside while someone drags it. */
export const PointSchema = z.tuple([z.number(), z.number()]);
/** x, y, width, height, all normalised. */
export const RectSchema = z.tuple([unit, unit, unit, unit]);

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1);
const reveal = z.number().int().min(0).max(REVEAL_GROUPS - 1).default(0);

export const ClickAnnotationSchema = z.object({ id, type: z.literal('click'), at: PointSchema, color: colour, reveal });
export const CalloutPlacementSchema = z.enum(['top', 'right', 'bottom', 'left']);
export const CalloutAnnotationSchema = z.object({
  id,
  type: z.literal('callout'),
  anchor: PointSchema,
  text: z.string().max(300),
  placement: CalloutPlacementSchema,
  color: colour,
  reveal,
});
export const ArrowAnnotationSchema = z.object({ id, type: z.literal('arrow'), from: PointSchema, to: PointSchema, color: colour, reveal });
export const SpotlightAnnotationSchema = z.object({ id, type: z.literal('spotlight'), rect: RectSchema, reveal });
export const BoxAnnotationSchema = z.object({ id, type: z.literal('box'), rect: RectSchema, color: colour, reveal });

export const AnnotationSchema = z.discriminatedUnion('type', [
  ClickAnnotationSchema,
  CalloutAnnotationSchema,
  ArrowAnnotationSchema,
  SpotlightAnnotationSchema,
  BoxAnnotationSchema,
]);

export const SourceSchema = z.object({
  id,
  /** path inside the project folder, e.g. `sources/recording.mov` */
  file: z.string().min(1),
  /** the name the person's file had, for display */
  name: z.string(),
  /** seconds */
  duration: z.number().positive(),
  /** pixels */
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  /** average frames per second; pins snap to the source's real frame times, this is the fallback */
  fps: z.number().positive(),
});

/** A stretch of a source on the timeline. `gap` is empty timeline time before the clip. */
export const ClipSchema = z.object({
  id,
  source: id,
  in: z.number().min(0),
  out: z.number().positive(),
  speed: z.number().min(MIN_SPEED).max(MAX_SPEED).default(1),
  gap: z.number().min(0).default(0),
  /** the recording's own sound in this clip, 0 to 1.5 */
  volume: z.number().min(0).max(1.5).default(1),
  muted: z.boolean().default(false),
});

/** The part of the frame a step zooms into. Always the frame's own shape: width and height are the same share of the frame. */
export const ZoomSchema = z.object({ rect: RectSchema });

export const StepSchema = z.object({
  id,
  /** a step lives on a source frame, never on a timeline position, so edits to the clips can't move it */
  anchor: z.object({ source: id, time: z.number().min(0) }),
  title: z.string().max(120),
  body: z.string().max(2000),
  /** least time to stay on the step in exports and the player, seconds */
  minHold: z.number().min(1).max(8).default(2.5),
  /** F5: the view eases into this part of the frame when the step is reached */
  zoom: ZoomSchema.nullable().default(null),
  annotations: z.array(AnnotationSchema),
});

/** The effects a region can stack (docs/05-editor-interactions.md, section 4.1), applied from the top of its list down. */
export const EFFECT_TYPES = ['pixelate', 'blur', 'darken', 'desaturate', 'tint', 'solid'] as const;
export const EffectTypeSchema = z.enum(EFFECT_TYPES);

/** One effect in a region's stack. `amount` is 0 to 100: block size, blur radius, darkness, desaturation, tint strength or fill opacity. */
export const EffectSchema = z.object({
  id,
  type: EffectTypeSchema,
  on: z.boolean().default(true),
  amount: z.number().min(0).max(100),
  /** tint and solid fill only */
  color: colour.optional(),
});

/** Where a region sits at one source time. Between keyframes the rectangle moves in a straight line. */
export const BlurKeyframeSchema = z.object({ time: z.number().min(0), rect: RectSchema });

/**
 * F7: an effect region (the Blur tool draws one). Each carries its own stack of effects, burned into the pixels of every output,
 * and sits on a layer of the Effects lane: higher layers draw on top, and two regions never overlap in time on one layer. Timing
 * and keyframes are in source time, so it keeps covering the same pixels when clips are trimmed or sped up.
 */
export const BlurSchema = z.object({
  id,
  name: z.string().max(60).default(''),
  source: id,
  /** source seconds */
  start: z.number().min(0),
  end: z.number().min(0),
  /** 0 is the bottom layer */
  layer: z.number().int().min(0).default(0),
  /** applied in order; may be empty, which leaves the recording as it is */
  effects: z.array(EffectSchema),
  /** corner radius in design pixels (a 1280 px wide frame) */
  radius: z.number().min(0).max(40).default(4),
  /** 0.1 to 1 */
  opacity: z.number().min(0.1).max(1).default(1),
  /** source seconds */
  fadeIn: z.number().min(0).max(3).default(0),
  fadeOut: z.number().min(0).max(3).default(0),
  /** ascending by time; at least one */
  keyframes: z.array(BlurKeyframeSchema).min(1),
});

/** A file the project carries besides its recordings: a logo or a background image. */
export const AssetSchema = z.object({
  id,
  /** path inside the project folder, e.g. `assets/a_1234.png` */
  file: z.string().min(1),
  name: z.string(),
  /** MIME type */
  type: z.string(),
  /** pixels */
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
});

export const GRADIENT_PRESETS = ['dusk', 'reef', 'ember', 'paper'] as const;
export const ASPECTS = ['source', '16:9', '4:3', '1:1', '4:5'] as const;

export const BackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('color'), color: colour }),
  z.object({ type: z.literal('gradient'), preset: z.enum(GRADIENT_PRESETS) }),
  z.object({ type: z.literal('image'), asset: id }),
]);

/** F18: the recording on a background, inset with rounded corners and a shadow. */
export const FrameSchema = z.object({
  aspect: z.enum(ASPECTS).default('source'),
  /** space around the recording, as a share of the output's width */
  padding: z.number().min(0).max(0.25).default(0),
  background: BackgroundSchema.default({ type: 'none' }),
  /** design pixels; applies when the recording is inset */
  cornerRadius: z.number().min(0).max(40).default(12),
  shadow: z.boolean().default(true),
});

export const LogoCornerSchema = z.enum(['tl', 'tr', 'bl', 'br']);

/** F19: a logo in a corner of every frame. */
export const LogoSchema = z.object({
  asset: id,
  corner: LogoCornerSchema.default('br'),
  /** width as a share of the output's width */
  size: z.number().min(0.03).max(0.3).default(0.1),
  /** distance from the edges, as a share of the output's width */
  margin: z.number().min(0).max(0.1).default(0.03),
  opacity: z.number().min(0.1).max(1).default(0.9),
});

export const DEFAULT_FRAME: z.infer<typeof FrameSchema> = { aspect: 'source', padding: 0, background: { type: 'none' }, cornerRadius: 12, shadow: true };

/** F9: how the interactive guide plays. Guided stops at every step until the viewer moves on; auto pauses on each step for its
    pause time; video plays straight through, with step markers on its progress bar. */
export const PLAYBACK_MODES = ['guided', 'auto', 'video'] as const;
/** The player's own colours: light, dark, or following the viewer's system setting. */
export const CHROMES = ['auto', 'light', 'dark'] as const;

export const ControlsSchema = z.object({
  counter: z.boolean().default(true),
  progress: z.boolean().default(true),
  fullscreen: z.boolean().default(true),
});

/** F10: a button to a signup, booking, documentation or other page. */
export const CtaSchema = z.object({
  label: z.string().max(40),
  /** may be empty or unfinished while someone types it; the export only uses an http(s) address */
  url: z.string().max(2000),
  newTab: z.boolean().default(true),
  /** on the end card, or on one step (by id) and every step after it */
  showAt: z.string().min(1).default('end'),
});

export const GuideSettingsSchema = z.object({
  mode: z.enum(PLAYBACK_MODES).default('guided'),
  controls: ControlsSchema.default({ counter: true, progress: true, fullscreen: true }),
  /** buttons and the progress bar; text on it is picked for contrast */
  accent: colour.default('#D13A30'),
  chrome: z.enum(CHROMES).default('auto'),
  cta: CtaSchema.nullable().default(null),
  /** where the guide's folder will be served from, for the embed snippets; empty until the person says */
  address: z.string().max(500).default(''),
});

export const DEFAULT_GUIDE: z.infer<typeof GuideSettingsSchema> = {
  mode: 'guided',
  controls: { counter: true, progress: true, fullscreen: true },
  accent: '#D13A30',
  chrome: 'auto',
  cta: null,
  address: '',
};

export const ProjectSchema = z.object({
  schema: z.literal(SCHEMA_VERSION),
  id,
  name: z.string().max(90),
  createdAt: z.number(),
  updatedAt: z.number(),
  sources: z.array(SourceSchema),
  timeline: z.array(ClipSchema),
  steps: z.array(StepSchema),
  blurs: z.array(BlurSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  frame: FrameSchema.default(DEFAULT_FRAME),
  logo: LogoSchema.nullable().default(null),
  guide: GuideSettingsSchema.default(DEFAULT_GUIDE),
});

export type Point = z.infer<typeof PointSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type ClickAnnotation = z.infer<typeof ClickAnnotationSchema>;
export type CalloutAnnotation = z.infer<typeof CalloutAnnotationSchema>;
export type CalloutPlacement = z.infer<typeof CalloutPlacementSchema>;
export type ArrowAnnotation = z.infer<typeof ArrowAnnotationSchema>;
export type SpotlightAnnotation = z.infer<typeof SpotlightAnnotationSchema>;
export type BoxAnnotation = z.infer<typeof BoxAnnotationSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationType = Annotation['type'];
export type Source = z.infer<typeof SourceSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Zoom = z.infer<typeof ZoomSchema>;
export type Step = z.infer<typeof StepSchema>;
export type EffectType = z.infer<typeof EffectTypeSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type BlurKeyframe = z.infer<typeof BlurKeyframeSchema>;
export type Blur = z.infer<typeof BlurSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type GradientPreset = (typeof GRADIENT_PRESETS)[number];
export type Aspect = (typeof ASPECTS)[number];
export type Background = z.infer<typeof BackgroundSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type LogoCorner = z.infer<typeof LogoCornerSchema>;
export type Logo = z.infer<typeof LogoSchema>;
export type PlaybackMode = (typeof PLAYBACK_MODES)[number];
export type Chrome = (typeof CHROMES)[number];
export type Controls = z.infer<typeof ControlsSchema>;
export type Cta = z.infer<typeof CtaSchema>;
export type GuideSettings = z.infer<typeof GuideSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectParseError';
  }
}

/** Versions this app can bring up to date. */
const OLDER_VERSIONS = ['waypost.project/1', 'waypost.project/2'];

/**
 * Brings an older document up to the current schema. Version 1 (Phase 1) had no blur, zoom, framing or logo, and version 2
 * (Phase 2) no player settings; the schema's defaults fill those in, so only the version string changes.
 */
function migrate(value: Record<string, unknown>): Record<string, unknown> {
  if (typeof value.schema === 'string' && OLDER_VERSIONS.includes(value.schema)) return { ...value, schema: SCHEMA_VERSION };
  return value;
}

/** Reads a `project.json` value. Unknown future schema versions are refused with a message the person can act on. */
export function parseProject(value: unknown): Project {
  const version = typeof value === 'object' && value !== null ? (value as { schema?: unknown }).schema : undefined;
  if (typeof version === 'string' && version.startsWith('waypost.project/') && version !== SCHEMA_VERSION && !OLDER_VERSIONS.includes(version)) {
    throw new ProjectParseError('This project was made by a newer version of Waypost. Update the app to open it.');
  }
  const result = ProjectSchema.safeParse(typeof value === 'object' && value !== null ? migrate(value as Record<string, unknown>) : value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ProjectParseError(`This isn't a valid Waypost project${first ? ` (${first.path.join('.') || 'root'}: ${first.message})` : ''}.`);
  }
  const project = result.data;
  for (const blur of project.blurs) blur.keyframes.sort((a, b) => a.time - b.time);
  separateLayers(project.blurs);
  return project;
}
