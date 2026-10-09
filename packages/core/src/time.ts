import type { Clip, Project } from './schema';

/* Time mapping between the recording (source time) and the edited result (timeline time), as in docs/05-editor-interactions.md
   section 1. Phase 1 has one clip per recording, but everything here already walks a list of clips with speeds and gaps. */

/** Timeline length: the sum of `gap + (out - in) / speed` over all clips. */
export function timelineDuration(clips: readonly Clip[]): number {
  let t = 0;
  for (const c of clips) t += c.gap + (c.out - c.in) / c.speed;
  return t;
}

/** Where a source time lands on the timeline. A time between clips maps to the start of the next one; past every clip, to the end. */
export function srcToTl(clips: readonly Clip[], source: string, time: number): number {
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
export function isOnTimeline(clips: readonly Clip[], source: string, time: number): boolean {
  return clips.some(c => c.source === source && time >= c.in && time <= c.out);
}

export interface SourcePosition {
  source: string;
  time: number;
}

/** The inverse of `srcToTl`. Inside a gap the previous clip's last frame holds; before the first clip it is the first clip's start. */
export function tlToSrc(clips: readonly Clip[], timeline: number): SourcePosition | null {
  const first = clips[0];
  if (!first) return null;
  let t = 0;
  let previous: Clip | undefined;
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
