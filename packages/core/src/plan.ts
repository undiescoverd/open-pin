import { clamp } from './geometry';
import { REVEAL_GROUPS } from './constants';
import type { Project, Step } from './schema';
import { isOnTimeline, orderedSteps, srcToTl, timelineDuration } from './time';

/* How a guide plays out in time once every step gets its pause (F13 "holds"; F5 zoom; F6 reveal order). The MP4 export walks
   this plan frame by frame; the editor's Viewer view and (later) the player use the same timings for a step's entrance. */

/** Seconds between reveal groups, and how long each takes to fade in. */
export const REVEAL_INTERVAL = 0.6;
export const REVEAL_FADE = 0.3;
/** Seconds to ease into a step's zoom, and back out at the end of its pause. */
export const ZOOM_IN = 0.6;
export const ZOOM_OUT = 0.5;
/** Seconds over which annotations fade before the recording moves on. */
export const OUTRO_FADE = 0.25;

export interface StepLook {
  /** progress into the step's zoom, 0 to 1 (eased by `viewRect`) */
  zoom: number;
  /** opacity of each reveal group, by group index */
  reveal: number[];
}

/** The reveal groups a step actually uses, in order. Empty groups take no time. */
export function usedGroups(step: Pick<Step, 'annotations'>): number[] {
  return [...new Set(step.annotations.map(a => a.reveal))].sort((a, b) => a - b);
}

function groupAlphas(step: Pick<Step, 'annotations' | 'zoom'>, t: number, interval: number): number[] {
  const reveal = new Array<number>(REVEAL_GROUPS).fill(0);
  const first = step.zoom ? ZOOM_IN * 0.6 : 0;
  for (const [rank, group] of usedGroups(step).entries()) {
    const start = first + rank * interval;
    reveal[group] = rank === 0 && first === 0 && t >= 0 ? 1 : clamp((t - start) / REVEAL_FADE, 0, 1);
  }
  return reveal;
}

/** How a step looks `t` seconds after the guide reaches it: easing into its zoom, then its groups appearing one after another. */
export function stepIntro(step: Pick<Step, 'annotations' | 'zoom'>, t: number): StepLook {
  return { zoom: step.zoom ? clamp(t / ZOOM_IN, 0, 1) : 0, reveal: groupAlphas(step, t, REVEAL_INTERVAL) };
}

/** A step fully shown: zoomed in, every group visible. What stills and the PDF show. */
export function stepShown(step: Pick<Step, 'zoom'>): StepLook {
  return { zoom: step.zoom ? 1 : 0, reveal: new Array<number>(REVEAL_GROUPS).fill(1) };
}

/**
 * How a step looks `t` seconds into a pause of `duration` in a video: the entrance, then the annotations fade and the zoom eases
 * out at the end so the motion that follows starts from the whole frame. Groups come closer together when the pause is short.
 */
export function holdLook(step: Pick<Step, 'annotations' | 'zoom'>, t: number, duration: number): StepLook {
  const zoomOut = step.zoom ? Math.min(ZOOM_OUT, duration * 0.2) : 0;
  const outro = Math.max(zoomOut, OUTRO_FADE);
  const groups = usedGroups(step).length;
  const first = step.zoom ? ZOOM_IN * 0.6 : 0;
  /* leave every group at least 0.4 s on screen before the outro */
  const room = duration - outro - first - REVEAL_FADE - 0.4;
  const interval = groups > 1 ? clamp(room / (groups - 1), 0.15, REVEAL_INTERVAL) : REVEAL_INTERVAL;
  const zoomIn = step.zoom ? Math.min(ZOOM_IN, duration * 0.3) : 0;
  const left = duration - t;
  const zoom = !step.zoom ? 0 : Math.min(clamp(t / zoomIn, 0, 1), zoomOut > 0 ? clamp(left / zoomOut, 0, 1) : 1);
  const fade = clamp(left / OUTRO_FADE, 0, 1);
  return { zoom, reveal: groupAlphas(step, t, interval).map(a => a * fade) };
}

/** How long a step's entrance takes: easing into its zoom and revealing every group. */
export function introLength(step: Pick<Step, 'annotations' | 'zoom'>): number {
  const groups = usedGroups(step).length;
  return (step.zoom ? ZOOM_IN : 0) + Math.max(0, groups - 1) * REVEAL_INTERVAL + REVEAL_FADE + 0.05;
}

/** How long the player stays on a step before moving on by itself (auto and video modes): its pause, and never less than the
    entrance plus a moment to take in the last group. */
export function guideHold(step: Pick<Step, 'annotations' | 'zoom' | 'minHold'>): number {
  return Math.max(step.minHold, introLength(step) + 0.6);
}

/** How long a step takes to leave in the player: the annotations fade and the zoom eases back out to the whole frame, so the motion
    that follows starts where the step's still left off. */
export function outroLength(step: Pick<Step, 'zoom'>): number {
  return step.zoom ? ZOOM_OUT : OUTRO_FADE;
}

/** How a step looks `t` seconds after the player starts leaving it. */
export function stepOutro(step: Pick<Step, 'zoom'>, t: number): StepLook {
  const fade = clamp(1 - t / OUTRO_FADE, 0, 1);
  return { zoom: step.zoom ? clamp(1 - t / ZOOM_OUT, 0, 1) : 0, reveal: new Array<number>(REVEAL_GROUPS).fill(fade) };
}

export type PlanItem =
  /** the recording plays timeline time `from` to `to` */
  | { kind: 'play'; start: number; duration: number; from: number; to: number }
  /** the guide pauses on a step's frame */
  | { kind: 'hold'; start: number; duration: number; stepId: string; at: number };

export interface Plan {
  items: PlanItem[];
  /** seconds */
  duration: number;
}

/** The timeline with a pause at every step that is on it, in the order viewers meet them. */
export function exportPlan(project: Project): Plan {
  const items: PlanItem[] = [];
  let out = 0;
  let tl = 0;
  const end = timelineDuration(project.timeline);
  for (const step of orderedSteps(project)) {
    if (!isOnTimeline(project.timeline, step.anchor.source, step.anchor.time)) continue;
    const at = srcToTl(project.timeline, step.anchor.source, step.anchor.time);
    if (at > tl + 1e-9) {
      items.push({ kind: 'play', start: out, duration: at - tl, from: tl, to: at });
      out += at - tl;
    }
    items.push({ kind: 'hold', start: out, duration: step.minHold, stepId: step.id, at });
    out += step.minHold;
    tl = Math.max(tl, at);
  }
  if (end > tl + 1e-9) {
    items.push({ kind: 'play', start: out, duration: end - tl, from: tl, to: end });
    out += end - tl;
  }
  return { items, duration: out };
}

/** What the plan shows at output time `t`: a timeline time, and the step being held (with seconds into its pause), if any. */
export function planAt(plan: Plan, t: number): { timeline: number; hold: { stepId: string; t: number; duration: number } | null } {
  const item = plan.items.find(i => t < i.start + i.duration - 1e-9) ?? plan.items[plan.items.length - 1];
  if (!item) return { timeline: 0, hold: null };
  if (item.kind === 'hold') return { timeline: item.at, hold: { stepId: item.stepId, t: clamp(t - item.start, 0, item.duration), duration: item.duration } };
  return { timeline: clamp(item.from + (t - item.start), item.from, item.to), hold: null };
}

/** A stretch of the video's soundtrack: silence, or the recording's own sound from a source time, at a volume. */
export interface AudioSegment {
  /** output seconds */
  start: number;
  duration: number;
  /** where the sound comes from; silence when left out */
  source?: { time: number; volume: number };
}

/**
 * The recording's own sound laid out along a plan (F13): it plays under clips at normal speed, at each clip's volume, and is
 * silent in pauses, gaps, muted clips and sped-up or slowed clips (changing speed without changing pitch is left for later).
 */
export function audioPlan(project: Project, plan: Plan): AudioSegment[] {
  const segments: AudioSegment[] = [];
  const push = (start: number, duration: number, source?: AudioSegment['source']) => {
    if (duration <= 1e-9) return;
    const last = segments[segments.length - 1];
    /* join silences, and sound that carries straight on */
    if (last && !last.source && !source) last.duration += duration;
    else if (last?.source && source && Math.abs(last.source.time + last.duration - source.time) < 1e-6 && last.source.volume === source.volume) last.duration += duration;
    else segments.push({ start, duration, source });
  };
  const clips = project.timeline;
  let clipStart = 0;
  const spans = clips.map(c => {
    const gapStart = clipStart;
    clipStart += c.gap;
    const start = clipStart;
    clipStart += (c.out - c.in) / c.speed;
    return { clip: c, gapStart, start, end: clipStart };
  });
  for (const item of plan.items) {
    if (item.kind === 'hold') {
      push(item.start, item.duration);
      continue;
    }
    for (const s of spans) {
      /* the gap before the clip */
      const g0 = Math.max(item.from, s.gapStart), g1 = Math.min(item.to, s.start);
      if (g1 > g0) push(item.start + (g0 - item.from), g1 - g0);
      const a = Math.max(item.from, s.start), b = Math.min(item.to, s.end);
      if (b <= a) continue;
      const audible = !s.clip.muted && s.clip.volume > 0 && Math.abs(s.clip.speed - 1) < 1e-9;
      push(item.start + (a - item.from), b - a, audible ? { time: s.clip.in + (a - s.start), volume: s.clip.volume } : undefined);
    }
  }
  return segments;
}
