import type { CalloutAnnotation } from '@waypost/core';
import { describe, expect, it } from 'vitest';
import { layoutCallout, type Ctx } from './geometry';
import { colourFor } from './palette';

/* text measures 8 px a character, enough to lay a bubble out without a canvas */
const ctx = { font: '', measureText: (t: string) => ({ width: t.length * 8 }) } as unknown as Ctx;
const size = { width: 1280, height: 720 };
const callout = (anchor: [number, number], placement: CalloutAnnotation['placement']): CalloutAnnotation => ({
  id: 'c',
  type: 'callout',
  anchor,
  text: 'Click here to start',
  placement,
  color: '#0E1116',
  reveal: 0,
});

describe('callout layout', () => {
  it('keeps the side it was given when the bubble fits there', () => {
    const l = layoutCallout(ctx, callout([0.5, 0.5], 'right'), size);
    expect(l.side).toBe('right');
    expect(l.left).toBeGreaterThan(640);
  });

  it('flips to the other side near the frame edge, so the pointer still faces the anchor', () => {
    const right = layoutCallout(ctx, callout([0.95, 0.5], 'right'), size);
    expect(right.side).toBe('left');
    expect(right.left + right.width).toBeLessThan(0.95 * 1280);
    const top = layoutCallout(ctx, callout([0.5, 0.03], 'top'), size);
    expect(top.side).toBe('bottom');
    expect(top.top).toBeGreaterThan(0.03 * 720);
  });
});

describe('custom annotation colours', () => {
  it('pick text the way the player chrome does: ink on light colours, white on dark ones', () => {
    expect(colourFor('#F5F5F5').text).toBe('#0E1116');
    expect(colourFor('#202020').text).toBe('#FFFFFF');
  });
});
