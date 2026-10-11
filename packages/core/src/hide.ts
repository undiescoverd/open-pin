import { EFFECT_COLORS, newEffect } from './effects';
import type { Blur, Effect, EffectType, Project, Step } from './schema';

/* Hide (docs/06-simplify-plan.md, "Hiding something"): the simple face of an effect region. It asks three things, a look, a
   strength and how long, and everything else (stacks, layers, fades, keyframes) stays under Advanced. These helpers read a region
   as one of the simple choices, or say it is its own mix. Times are source seconds. */

export type HideLook = 'cover' | 'pixelate' | 'blur';
export type HideSpan = 'step' | 'rest' | 'all';

/** Cover first: it can't leak. Pixelate and blur start strong, never subtle. */
export const HIDE_LOOKS: Readonly<Record<HideLook, { type: EffectType; amount: number }>> = {
  cover: { type: 'solid', amount: 100 },
  pixelate: { type: 'pixelate', amount: 75 },
  blur: { type: 'blur', amount: 75 },
};

/** The weakest pixelate or blur the simple Strength slider offers. */
export const HIDE_MIN_STRENGTH = 40;

/** The one effect a simple look is made of. */
export function hideEffect(look: HideLook, id: string): Effect {
  const { type, amount } = HIDE_LOOKS[look];
  const effect = newEffect(type, id);
  return { ...effect, amount, ...(type === 'solid' ? { color: EFFECT_COLORS.ink } : {}) };
}

/** The simple look a region has: exactly one effect, switched on, that is a cover, a pixelate or a blur. Otherwise null. */
export function hideLook(blur: Pick<Blur, 'effects'>): HideLook | null {
  if (blur.effects.length !== 1 || !blur.effects[0]!.on) return null;
  const type = blur.effects[0]!.type;
  return type === 'solid' ? 'cover' : type === 'pixelate' ? 'pixelate' : type === 'blur' ? 'blur' : null;
}

export interface StepSpan {
  step: Step;
  start: number;
  end: number;
}

/**
 * The stretch of the recording that belongs to each step, as the guide plays it: the motion from the step before (or the start)
 * up to and including this step's frame. Spans meet half a frame after each pinned frame, so each frame belongs to one step.
 */
export function stepSpans(project: Project, sourceId: string): StepSpan[] {
  const source = project.sources.find(s => s.id === sourceId);
  if (!source) return [];
  const half = 0.5 / source.fps;
  const steps = project.steps.filter(s => s.anchor.source === sourceId).sort((a, b) => a.anchor.time - b.anchor.time);
  return steps.map((step, i) => ({
    step,
    start: i === 0 ? 0 : Math.min(source.duration, steps[i - 1]!.anchor.time + half),
    end: Math.min(source.duration, step.anchor.time + half),
  }));
}

/** The step whose span holds a source time; none after the last step's frame. */
export function stepSpanAt(project: Project, sourceId: string, time: number): StepSpan | undefined {
  return stepSpans(project, sourceId).find(s => time >= s.start - 1e-9 && time <= s.end + 1e-9);
}

const tolerance = (project: Project, sourceId: string): number => Math.max(1e-3, 0.5 / (project.sources.find(s => s.id === sourceId)?.fps ?? 30));

/** Which simple choice a region's timing is: the whole video, one step, or from a point to the end. Null for anything else. */
export function hideSpanOf(project: Project, blur: Pick<Blur, 'source' | 'start' | 'end'>): HideSpan | null {
  const source = project.sources.find(s => s.id === blur.source);
  if (!source) return null;
  const tol = tolerance(project, blur.source);
  const toEnd = blur.end >= source.duration - tol;
  if (blur.start <= tol && toEnd) return 'all';
  if (stepSpans(project, blur.source).some(s => Math.abs(s.start - blur.start) <= tol && Math.abs(s.end - blur.end) <= tol)) return 'step';
  return toEnd ? 'rest' : null;
}

/**
 * Where a simple choice puts a region, judged from `here` (the source time on screen): this step's span, from the start of this
 * step (or from `here` past the last step) to the end, or the whole video. Null for "this step" when no step holds `here`.
 */
export function hideSpanFor(project: Project, sourceId: string, span: HideSpan, here: number): { start: number; end: number } | null {
  const source = project.sources.find(s => s.id === sourceId);
  if (!source) return null;
  const step = stepSpanAt(project, sourceId, here);
  if (span === 'all') return { start: 0, end: source.duration };
  if (span === 'rest') return { start: step?.start ?? Math.min(Math.max(0, here), source.duration), end: source.duration };
  return step ? { start: step.start, end: step.end } : null;
}
