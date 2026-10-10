/* The player's state machine (docs/02-architecture.md, "Player internals"): start → segment(1) → step(1) → leaving(1) → segment(2)
   → … → end. Pure: it knows which steps have motion leading into them and whether there is an outro, and nothing about the DOM.

   - A segment is the motion leading into step `index`; `index === steps` is the outro after the last step.
   - Leaving is the short exit from a step (annotations fade, zoom eases out) before the motion that follows starts.
   - Moving back, or jumping to a step from the progress bar, goes straight to the step's still: motion only ever plays forwards. */

export type State =
  | { kind: 'start' }
  | { kind: 'segment'; index: number }
  | { kind: 'step'; index: number }
  | { kind: 'leaving'; index: number }
  | { kind: 'end' };

export type Event =
  /** Start, Next, a click on the waiting stage, → or Space; also an auto or video hold running out */
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'segmentEnded' }
  | { type: 'leaveDone' }
  /** Replay on the end card */
  | { type: 'restart' };

export interface Shape {
  /** whether each step has motion leading into it */
  segments: readonly boolean[];
  outro: boolean;
}

/** Arriving at step `index` from the motion before it: play that motion if there is any, else show the step. */
function enter(shape: Shape, index: number): State {
  const n = shape.segments.length;
  if (index >= n) return shape.outro ? { kind: 'segment', index: n } : { kind: 'end' };
  return shape.segments[index] ? { kind: 'segment', index } : { kind: 'step', index };
}

export function transition(state: State, event: Event, shape: Shape): State {
  const n = shape.segments.length;
  const last = n - 1;
  if (event.type === 'goto') return n === 0 ? state : { kind: 'step', index: Math.min(last, Math.max(0, event.index)) };
  if (event.type === 'restart') return enter(shape, 0);
  switch (state.kind) {
    case 'start':
      return event.type === 'next' ? enter(shape, 0) : state;
    case 'segment':
      /* Next while the motion plays skips to where it was going */
      if (event.type === 'segmentEnded' || event.type === 'next') return state.index >= n ? { kind: 'end' } : { kind: 'step', index: state.index };
      if (event.type === 'prev') return state.index > 0 ? { kind: 'step', index: state.index - 1 } : { kind: 'start' };
      return state;
    case 'step':
      if (event.type === 'next') return { kind: 'leaving', index: state.index };
      if (event.type === 'prev') return state.index > 0 ? { kind: 'step', index: state.index - 1 } : state;
      return state;
    case 'leaving':
      if (event.type === 'leaveDone' || event.type === 'next') return enter(shape, state.index + 1);
      if (event.type === 'prev') return { kind: 'step', index: state.index };
      return state;
    case 'end':
      return event.type === 'prev' && n > 0 ? { kind: 'step', index: last } : state;
  }
}

/** The step a state belongs to for the counter, the caption and the progress bar: -1 before the first, `steps` at the end. */
export function stepNumber(state: State, steps: number): number {
  switch (state.kind) {
    case 'start':
      return -1;
    case 'end':
      return steps;
    case 'segment':
      /* the motion into a step already counts as that step, the outro as the last */
      return Math.min(state.index, steps - 1);
    default:
      return state.index;
  }
}
