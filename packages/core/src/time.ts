import type { Clip, Project } from './schema';

/** The parts of a clip that time mapping needs. */
export type TimeClip = Pick<Clip, 'source' | 'in' | 'out' | 'speed' | 'gap'>;

/* Time mapping between the recording (source time) and the edited result (timeline time), as in docs/05-editor-interactions.md
   section 1. Phase 1 has one clip per recording, but everything here already walks a list of clips with speeds and gaps. */

/** Timeline length: the sum of `gap + (out - in) / speed` over all clips. */
export function timelineDuration(clips: readonly TimeClip[]): number {
  let t = 0;
  for (const c of clips) t += c.gap + (c.out - c.in) / c.speed;
  return t;
}

/** Where a source time lands on the timeline. A time between clips maps to the start of the next one; past every clip, to the end. */
export function srcToTl(clips: readonly TimeClip[], source: string, time: number): number {
  let t = 0;
  for (const c of clips) {
    t += c.gap;
    if (c.source === source) {
      if (time < c.in) return t;
      if (time <= c.out) return t + (time - c.in) / c.speed;
    }
    t += (c.out - c.in) / c.speed;
  }
  return t;
}

/** Whether some clip plays this source time, so a step pinned there is still on the timeline. */
export function isOnTimeline(clips: readonly TimeClip[], source: string, time: number): boolean {
  return clips.some(c => c.source === source && time >= c.in && time <= c.out);
}

export interface SourcePosition {
  source: string;
  time: number;
}

/** The inverse of `srcToTl`. Inside a gap the previous clip's last frame holds; before the first clip it is the first clip's start. */
export function tlToSrc(clips: readonly TimeClip[], timeline: number): SourcePosition | null {
  const first = clips[0];
  if (!first) return null;
  let t = 0;
  let previous: TimeClip | undefined;
  for (const c of clips) {
    if (timeline < t + c.gap) return previous ? { source: previous.source, time: previous.out } : { source: c.source, time: c.in };
    t += c.gap;
    const length = (c.out - c.in) / c.speed;
    if (timeline < t + length) return { source: c.source, time: c.in + (timeline - t) * c.speed };
    t += length;
    previous = c;
  }
  const last = clips[clips.length - 1]!;
  return { source: last.source, time: last.out };
}

/** Rounds a time to a whole frame at `fps`. Variable-frame-rate recordings use the media frame index instead. */
export function snapToFrame(time: number, fps: number): number {
  return Math.round(time * fps) / fps;
}

/** A project's steps in the order a viewer meets them: by timeline time. The commands keep `steps` in this order already. */
export function orderedSteps(project: Project) {
  return [...project.steps].sort(
    (a, b) => srcToTl(project.timeline, a.anchor.source, a.anchor.time) - srcToTl(project.timeline, b.anchor.source, b.anchor.time),
  );
}

/** Where each clip's footage starts on the timeline (after its gap). */
export function clipStarts(clips: readonly TimeClip[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const c of clips) {
    t += c.gap;
    starts.push(t);
    t += (c.out - c.in) / c.speed;
  }
  return starts;
}

/** How long a clip plays on the timeline. */
export function clipLength(clip: TimeClip): number {
  return (clip.out - clip.in) / clip.speed;
}

/**
 * What is on the timeline at a time: a clip (and the source time it shows), or the gap before clip `index`. A time exactly on a
 * cut belongs to the clip that starts there; the very end belongs to the last clip.
 */
export type TimelineSpot = { kind: 'clip'; index: number; time: number } | { kind: 'gap'; index: number };

export function spotAt(clips: readonly TimeClip[], timeline: number): TimelineSpot | null {
  if (clips.length === 0) return null;
  let t = 0;
  for (const [index, c] of clips.entries()) {
    if (timeline < t + c.gap - 1e-9) return { kind: 'gap', index };
    t += c.gap;
    const length = clipLength(c);
    if (timeline < t + length - 1e-9) return { kind: 'clip', index, time: c.in + Math.max(0, timeline - t) * c.speed };
    t += length;
  }
  const last = clips.length - 1;
  return { kind: 'clip', index: last, time: clips[last]!.out };
}

/** The clip that plays a source time, if any. */
export function clipIndexAtSource(clips: readonly TimeClip[], source: string, time: number): number {
  return clips.findIndex(c => c.source === source && time >= c.in - 1e-9 && time <= c.out + 1e-9);
}

/** Every cut and gap edge on the timeline, ascending, without the two ends. Jump and snap targets. */
export function cutTimes(clips: readonly TimeClip[]): number[] {
  const times: number[] = [];
  let t = 0;
  for (const c of clips) {
    if (c.gap > 0 && t > 0) times.push(t);
    t += c.gap;
    if (t > 0) times.push(t);
    t += clipLength(c);
  }
  return [...new Set(times.map(x => Math.round(x * 1e6) / 1e6))].filter(x => x > 0 && x < t - 1e-9);
}
