import type { CapturedClick, ClickKind } from './protocol';
import { titleFor } from './title';

/* From the clicks logged during a recording to the steps the editor offers. The review list then lets the person keep, merge or
   drop each one, so this errs towards offering a little too much rather than too little. */

/** A step lands this long before its click, so the picture shows the screen being clicked rather than the one it led to. */
export const CLICK_LEAD = 0.15;
/** Clicks closer together than this are one gesture (a double click, a click that was repeated). */
export const MIN_GAP = 0.3;
/** A second click this soon on nearly the same spot is a double click. */
const DOUBLE_CLICK = 0.6;
const SAME_SPOT = 0.03;

export interface ProposedStep {
  /** seconds into the recording the step is pinned at */
  time: number;
  /** 0 to 1 across the frame */
  at: [number, number];
  title: string;
  /** what was clicked, as the page named it (may be empty) */
  label: string;
  kind: ClickKind;
}

export interface ProposeInput {
  clicks: readonly CapturedClick[];
  /** `Date.now()` when the recording started */
  startedAt: number;
  /** length of the recording, seconds */
  duration: number;
  /** the recorded tab's name as the browser reported it, if it did */
  trackLabel?: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The clicks made in the recorded tab. The browser doesn't say which tab was chosen to share, so: a tab whose title matches the
    shared track's name, otherwise the tab that was clicked in most. Clicks in other tabs aren't part of the picture. */
export function recordedTabClicks(clicks: readonly CapturedClick[], trackLabel?: string): CapturedClick[] {
  if (clicks.length === 0) return [];
  const label = trackLabel ? norm(trackLabel) : '';
  if (label) {
    const matching = new Set(clicks.filter(c => norm(c.title) && (label.includes(norm(c.title)) || norm(c.title).includes(label))).map(c => c.tab));
    if (matching.size === 1) return clicks.filter(c => matching.has(c.tab));
  }
  const counts = new Map<number, { n: number; first: number }>();
  for (const c of clicks) {
    const entry = counts.get(c.tab) ?? { n: 0, first: c.t };
    entry.n++;
    entry.first = Math.min(entry.first, c.t);
    counts.set(c.tab, entry);
  }
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)[0]![0];
  return clicks.filter(c => c.tab === best);
}

export function proposeSteps(input: ProposeInput): ProposedStep[] {
  const { startedAt, duration } = input;
  const made = recordedTabClicks(input.clicks, input.trackLabel)
    .map(c => ({ c, at: (c.t - startedAt) / 1000 }))
    /* a click from before the recording began, or after it ended, isn't in the video */
    .filter(({ at }) => at >= -0.05 && at <= duration + 0.5)
    .sort((a, b) => a.at - b.at);
  const steps: ProposedStep[] = [];
  let previous: { c: CapturedClick; at: number } | undefined;
  for (const entry of made) {
    const { c, at } = entry;
    if (previous) {
      const gap = at - previous.at;
      const near = Math.hypot(c.x - previous.c.x, c.y - previous.c.y) < SAME_SPOT;
      if (gap < MIN_GAP || (gap < DOUBLE_CLICK && near)) continue;
    }
    previous = entry;
    steps.push({
      time: Math.min(Math.max(0, at - CLICK_LEAD), Math.max(0, duration)),
      at: [c.x, c.y],
      title: titleFor(c.kind, c.label),
      label: c.label,
      kind: c.kind,
    });
  }
  return steps;
}
