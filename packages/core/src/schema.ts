import { z } from 'zod';

/* The project document (docs/02-architecture.md, "Data model"). Zod is the single source of truth: the types below are inferred
   from it, and `parseProject` validates anything read from disk. Geometry is normalised: 0 to 1 of the recording frame. */

export const SCHEMA_VERSION = 'waypost.project/1';

const unit = z.number().min(0).max(1);
/** A point on the recording frame, normalised. It may sit slightly outside while someone drags it. */
export const PointSchema = z.tuple([z.number(), z.number()]);
/** x, y, width, height, all normalised. */
export const RectSchema = z.tuple([unit, unit, unit, unit]);

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1);
/** Which reveal group an annotation appears in (F6 groups arrive in Phase 2; 0 means "with the step"). */
const reveal = z.number().int().min(0).default(0);

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
  speed: z.number().min(0.25).max(8).default(1),
  gap: z.number().min(0).default(0),
});

export const StepSchema = z.object({
  id,
  /** a step lives on a source frame, never on a timeline position, so edits to the clips can't move it */
  anchor: z.object({ source: id, time: z.number().min(0) }),
  title: z.string().max(120),
  body: z.string().max(2000),
  /** least time to stay on the step in exports and the player, seconds */
  minHold: z.number().min(1).max(8).default(2.5),
  annotations: z.array(AnnotationSchema),
});

export const ProjectSchema = z.object({
  schema: z.literal(SCHEMA_VERSION),
  id,
  name: z.string().max(90),
  createdAt: z.number(),
  updatedAt: z.number(),
  sources: z.array(SourceSchema),
  timeline: z.array(ClipSchema),
  steps: z.array(StepSchema),
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
export type Step = z.infer<typeof StepSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectParseError';
  }
}

/** Reads a `project.json` value. Unknown future schema versions are refused with a message the person can act on. */
export function parseProject(value: unknown): Project {
  const version = typeof value === 'object' && value !== null ? (value as { schema?: unknown }).schema : undefined;
  if (typeof version === 'string' && version !== SCHEMA_VERSION && version.startsWith('waypost.project/')) {
    throw new ProjectParseError('This project was made by a newer version of Waypost. Update the app to open it.');
  }
  const result = ProjectSchema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ProjectParseError(`This isn't a valid Waypost project${first ? ` (${first.path.join('.') || 'root'}: ${first.message})` : ''}.`);
  }
  return result.data;
}
