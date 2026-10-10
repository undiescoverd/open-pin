import { describe, expect, it } from 'vitest';
import { stepNumber, transition, type Event, type Shape, type State } from './machine';

/* The player's state machine: start → segment → step → leaving → … → end (docs/02-architecture.md, "Player internals"). */

const next: Event = { type: 'next' };
const prev: Event = { type: 'prev' };
const ended: Event = { type: 'segmentEnded' };
const left: Event = { type: 'leaveDone' };

/** Plays events from the start and lists the states visited. */
function walk(shape: Shape, events: Event[]): State[] {
  let s: State = { kind: 'start' };
  return events.map(e => (s = transition(s, e, shape)));
}

describe('the player state machine', () => {
  /* three steps: motion before the first two, the third on the same frame as the second; then an outro */
  const shape: Shape = { segments: [true, true, false], outro: true };

  it('plays motion into each step, leaves each step, then plays the outro and ends', () => {
    expect(walk(shape, [next, ended, next, left, ended, next, left, next, left, ended])).toEqual([
      { kind: 'segment', index: 0 },
      { kind: 'step', index: 0 },
      { kind: 'leaving', index: 0 },
      { kind: 'segment', index: 1 },
      { kind: 'step', index: 1 },
      { kind: 'leaving', index: 1 },
      { kind: 'step', index: 2 },
      { kind: 'leaving', index: 2 },
      { kind: 'segment', index: 3 },
      { kind: 'end' },
    ]);
  });

  it('ends straight after the last step when there is no outro, and starts on a step with no motion before it', () => {
    const still: Shape = { segments: [false], outro: false };
    expect(walk(still, [next, next, left])).toEqual([{ kind: 'step', index: 0 }, { kind: 'leaving', index: 0 }, { kind: 'end' }]);
  });

  it('Next during motion skips to the step; Next while leaving goes straight on', () => {
    expect(transition({ kind: 'segment', index: 1 }, next, shape)).toEqual({ kind: 'step', index: 1 });
    expect(transition({ kind: 'segment', index: 3 }, next, shape)).toEqual({ kind: 'end' });
    expect(transition({ kind: 'leaving', index: 0 }, next, shape)).toEqual({ kind: 'segment', index: 1 });
  });

  it('Back goes to the previous still without motion, and never before the first step', () => {
    expect(transition({ kind: 'step', index: 2 }, prev, shape)).toEqual({ kind: 'step', index: 1 });
    expect(transition({ kind: 'segment', index: 1 }, prev, shape)).toEqual({ kind: 'step', index: 0 });
    expect(transition({ kind: 'segment', index: 0 }, prev, shape)).toEqual({ kind: 'start' });
    expect(transition({ kind: 'leaving', index: 1 }, prev, shape)).toEqual({ kind: 'step', index: 1 });
    expect(transition({ kind: 'end' }, prev, shape)).toEqual({ kind: 'step', index: 2 });
    const first: State = { kind: 'step', index: 0 };
    expect(transition(first, prev, shape)).toBe(first);
  });

  it('jumps to any step from anywhere, clamped, and Replay starts the motion again', () => {
    expect(transition({ kind: 'start' }, { type: 'goto', index: 1 }, shape)).toEqual({ kind: 'step', index: 1 });
    expect(transition({ kind: 'end' }, { type: 'goto', index: 9 }, shape)).toEqual({ kind: 'step', index: 2 });
    expect(transition({ kind: 'end' }, { type: 'restart' }, shape)).toEqual({ kind: 'segment', index: 0 });
  });

  it('ignores events that mean nothing in a state', () => {
    const start: State = { kind: 'start' };
    expect(transition(start, ended, shape)).toBe(start);
    const end: State = { kind: 'end' };
    expect(transition(end, next, shape)).toBe(end);
    const step: State = { kind: 'step', index: 1 };
    expect(transition(step, ended, shape)).toBe(step);
  });

  it('numbers the motion into a step as that step, and the outro as the last', () => {
    expect(stepNumber({ kind: 'start' }, 3)).toBe(-1);
    expect(stepNumber({ kind: 'segment', index: 1 }, 3)).toBe(1);
    expect(stepNumber({ kind: 'segment', index: 3 }, 3)).toBe(2);
    expect(stepNumber({ kind: 'leaving', index: 2 }, 3)).toBe(2);
    expect(stepNumber({ kind: 'end' }, 3)).toBe(3);
  });
});
