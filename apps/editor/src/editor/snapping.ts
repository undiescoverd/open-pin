import { cutTimes, srcToTl, timelineDuration, type Project } from '@waypost/core';

/* The edges that snapping and the "next edit" keys know about (docs/05-editor-interactions.md, 4.4 and 6): the ends of the guide,
   pins, cuts and gap edges, and the start and end of every blur region. Everything here is timeline seconds. */

export interface EdgeOptions {
  /** leave out a dragged step, so a pin never snaps to itself */
  skipStep?: string;
  /** leave out a dragged blur's own edges */
  skipBlur?: string;
  /** the playhead, when it isn't the thing being dragged */
  playhead?: number;
  /** leave out the cuts (a clip trim snaps to other things) */
  skipCuts?: boolean;
}

export function timelineEdges(project: Project, options: EdgeOptions = {}): number[] {
  const t = project.timeline;
  const edges = [0, timelineDuration(t)];
  if (options.playhead !== undefined) edges.push(options.playhead);
  for (const s of project.steps) if (s.id !== options.skipStep) edges.push(srcToTl(t, s.anchor.source, s.anchor.time));
  if (!options.skipCuts) edges.push(...cutTimes(t));
  for (const b of project.blurs) if (b.id !== options.skipBlur) edges.push(srcToTl(t, b.source, b.start), srcToTl(t, b.source, b.end));
  return [...new Set(edges.map(x => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
}

/** The nearest target within `pixels` of `t`, given the timeline's pixels per second; null if none is that close. */
export function nearestEdge(t: number, targets: readonly number[], pixelsPerSecond: number, pixels: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    const d = Math.abs(target - t) * pixelsPerSecond;
    if (d <= pixels && (best === null || d < Math.abs(best - t) * pixelsPerSecond)) best = target;
  }
  return best;
}
