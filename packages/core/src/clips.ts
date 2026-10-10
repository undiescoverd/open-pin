import type { Draft } from 'immer';
import type { Command } from './history';
import { MAX_SPEED, MIN_SPEED, type Clip, type Project } from './schema';
import { clipLength } from './time';

/* Timeline editing (F2; docs/05-editor-interactions.md, 4.3): split, trim with or without ripple, speed, gaps and deleting a
   clip. Times are source seconds unless a name says otherwise. Steps are anchored to source frames, so no edit here moves one;
   instead an edit may never cut away a pinned frame. The `*Limits` and `can*` helpers say what an edit may do, so the UI can
   stop a drag at the limit and explain why; the commands clamp to the same limits. */

/** A trim can't leave less than this much source in a clip. */
export const MIN_CLIP = 0.2;
/** A split can't make a piece shorter than this. */
export const MIN_SPLIT = 0.1;

export type ClipEdge = 'in' | 'out';

export interface TrimLimits {
  /** the edge's lowest and highest source time */
  min: number;
  max: number;
  /** set when a pinned step is what stops the edge at `min` or `max` */
  pinAtMin: boolean;
  pinAtMax: boolean;
}

/** Pinned source times inside a clip. */
function pinsIn(project: Project, clip: Clip): number[] {
  return project.steps.filter(s => s.anchor.source === clip.source && s.anchor.time >= clip.in - 1e-9 && s.anchor.time <= clip.out + 1e-9).map(s => s.anchor.time);
}

function neighbour(project: Project, index: number, offset: -1 | 1): Clip | undefined {
  const c = project.timeline[index + offset];
  return c && c.source === project.timeline[index]!.source ? c : undefined;
}

/**
 * How far a clip's edge can move. It can't cross the neighbouring clip's footage, the ends of the recording, or a pinned step,
 * and it leaves at least `MIN_CLIP` of source. With ripple off it can only grow back into time that is already free: the gap it
 * opened (its own gap for the left edge, the next clip's for the right).
 */
export function trimLimits(project: Project, clipId: string, edge: ClipEdge, ripple: boolean): TrimLimits | null {
  const index = project.timeline.findIndex(c => c.id === clipId);
  const clip = project.timeline[index];
  const source = clip && project.sources.find(s => s.id === clip.source);
  if (!clip || !source) return null;
  const pins = pinsIn(project, clip);
  if (edge === 'in') {
    let min = neighbour(project, index, -1)?.out ?? 0;
    if (!ripple) min = Math.max(min, clip.in - clip.gap * clip.speed);
    let max = clip.out - MIN_CLIP;
    const firstPin = pins.length ? Math.min(...pins) : Infinity;
    const pinAtMax = firstPin < max;
    max = Math.min(max, firstPin);
    /* the current position is always allowed, even for a clip already shorter than the minimum */
    return { min: Math.min(min, clip.in), max: Math.max(max, clip.in), pinAtMin: false, pinAtMax };
  }
  const next = project.timeline[index + 1];
  let max = neighbour(project, index, 1)?.in ?? source.duration;
  if (!ripple && next) max = Math.min(max, clip.out + next.gap * clip.speed);
  let min = clip.in + MIN_CLIP;
  const lastPin = pins.length ? Math.max(...pins) : -Infinity;
  const pinAtMin = lastPin > min;
  min = Math.max(min, lastPin);
  return { min: Math.min(min, clip.out), max: Math.max(max, clip.out), pinAtMin, pinAtMax: false };
}

/** Clamps an edge's new source time into its limits. */
export function clampTrim(limits: TrimLimits, value: number): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

function touch(draft: Draft<Project>, now: number): void {
  draft.updatedAt = now;
}

/** Whether `time` (source seconds) splits a clip into two usable pieces; a reason when it doesn't. */
export function canSplit(project: Project, clipId: string, time: number): true | string {
  const clip = project.timeline.find(c => c.id === clipId);
  if (!clip) return 'There is no clip there to split.';
  if (time - clip.in < MIN_SPLIT || clip.out - time < MIN_SPLIT) return 'That is too close to the end of the clip to split.';
  return true;
}

/** Whether a clip can be deleted; a reason when it can't. */
export function canDeleteClip(project: Project, clipId: string): true | string {
  const clip = project.timeline.find(c => c.id === clipId);
  if (!clip) return 'There is no clip there.';
  if (project.timeline.length === 1) return "The guide needs at least one clip. Trim it instead.";
  const pinned = pinsIn(project, clip).length;
  if (pinned) return `This clip has ${pinned === 1 ? 'a pinned step' : `${pinned} pinned steps`}. Move or delete ${pinned === 1 ? 'it' : 'them'} first.`;
  return true;
}

/** The speed presets in the clip Inspector (docs/05-editor-interactions.md, section 2). */
export const SPEED_PRESETS = [1 / 3, 0.5, 1, 2, 5] as const;

export const clipCommands = {
  /** Splits a clip at a source time into two clips that play back to back. */
  splitClip(clipId: string, time: number, newId: string, now: number): Command<Project> {
    return {
      label: 'Split clip',
      run: d => {
        const i = d.timeline.findIndex(c => c.id === clipId);
        const clip = d.timeline[i];
        if (!clip || time - clip.in < MIN_SPLIT || clip.out - time < MIN_SPLIT) return;
        const second = { ...clip, id: newId, in: time, gap: 0 };
        clip.out = time;
        d.timeline.splice(i + 1, 0, second);
        touch(d, now);
      },
    };
  },

  /**
   * Moves one edge of a clip to a source time (clamped to `trimLimits`). With ripple on, everything after moves to close or open
   * the space. With ripple off nothing else moves: trimming the right edge adds the removed time to the next clip's gap, trimming
   * the left edge adds it to this clip's own gap.
   */
  trimClip(clipId: string, edge: ClipEdge, value: number, ripple: boolean, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: 'Trim clip',
      coalesceKey,
      run: d => {
        const limits = trimLimits(d as Project, clipId, edge, ripple);
        const i = d.timeline.findIndex(c => c.id === clipId);
        const clip = d.timeline[i];
        if (!limits || !clip) return;
        const v = clampTrim(limits, value);
        if (edge === 'in') {
          if (Math.abs(v - clip.in) < 1e-9) return;
          if (!ripple) clip.gap = Math.max(0, clip.gap + (v - clip.in) / clip.speed);
          clip.in = v;
        } else {
          if (Math.abs(v - clip.out) < 1e-9) return;
          const next = d.timeline[i + 1];
          if (!ripple && next) next.gap = Math.max(0, next.gap + (clip.out - v) / clip.speed);
          clip.out = v;
        }
        touch(d, now);
      },
    };
  },

  setClipSpeed(clipId: string, speed: number, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: 'Change speed',
      coalesceKey,
      run: d => {
        const clip = d.timeline.find(c => c.id === clipId);
        const s = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
        if (!clip || Math.abs(clip.speed - s) < 1e-9) return;
        clip.speed = s;
        touch(d, now);
      },
    };
  },

  setClipAudio(clipId: string, audio: { volume?: number; muted?: boolean }, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: audio.muted !== undefined ? (audio.muted ? 'Mute clip' : 'Unmute clip') : 'Change clip volume',
      coalesceKey,
      run: d => {
        const clip = d.timeline.find(c => c.id === clipId);
        if (!clip) return;
        const volume = audio.volume === undefined ? clip.volume : Math.min(1.5, Math.max(0, audio.volume));
        const muted = audio.muted ?? clip.muted;
        if (volume === clip.volume && muted === clip.muted) return;
        clip.volume = volume;
        clip.muted = muted;
        touch(d, now);
      },
    };
  },

  /** Sets the empty time before a clip. 0 closes the gap, rippling everything after it up. */
  setGap(clipId: string, seconds: number, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: seconds <= 0 ? 'Close gap' : 'Change gap',
      coalesceKey,
      run: d => {
        const clip = d.timeline.find(c => c.id === clipId);
        const gap = Math.max(0, seconds);
        if (!clip || Math.abs(clip.gap - gap) < 1e-9) return;
        clip.gap = gap;
        touch(d, now);
      },
    };
  },

  /** Removes a clip (refused while it holds a pinned step). Ripple closes the space; otherwise it becomes a gap. */
  deleteClip(clipId: string, ripple: boolean, now: number): Command<Project> {
    return {
      label: 'Delete clip',
      run: d => {
        if (canDeleteClip(d as Project, clipId) !== true) return;
        const i = d.timeline.findIndex(c => c.id === clipId);
        const [clip] = d.timeline.splice(i, 1);
        const next = d.timeline[i];
        if (clip && next && !ripple) next.gap += clip.gap + clipLength(clip);
        touch(d, now);
      },
    };
  },
};
