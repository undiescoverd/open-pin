import { describe, expect, it } from 'vitest';
import { FrameIndex } from './frame-index';

const constant = new FrameIndex(Array.from({ length: 10 }, (_, i) => i / 30));
const variable = new FrameIndex([0, 0.5, 0.55, 2]);

describe('FrameIndex', () => {
  it('sorts what it is given, since packets arrive in decode order', () => {
    expect(Array.from(new FrameIndex([0.2, 0, 0.1]).times)).toEqual([0, 0.1, 0.2]);
  });

  it('finds the frame showing at a time', () => {
    expect(constant.indexAt(0)).toBe(0);
    expect(constant.indexAt(2 / 30)).toBe(2);
    expect(constant.indexAt(2.9 / 30)).toBe(2);
    expect(constant.indexAt(99)).toBe(9);
    expect(constant.indexAt(-1)).toBe(0);
  });

  it('snaps to the nearest frame start', () => {
    expect(constant.snap(2.4 / 30)).toBeCloseTo(2 / 30, 9);
    expect(constant.snap(2.6 / 30)).toBeCloseTo(3 / 30, 9);
    expect(variable.snap(1.4)).toBe(2);
    expect(variable.snap(0.52)).toBe(0.5);
  });

  it('steps by whole frames and stops at both ends', () => {
    expect(constant.step(2 / 30, 1)).toBeCloseTo(3 / 30, 9);
    expect(constant.step(2 / 30, -2)).toBe(0);
    expect(constant.step(0, -1)).toBe(0);
    expect(constant.step(9 / 30, 1)).toBeCloseTo(9 / 30, 9);
    expect(variable.step(0.5, 1)).toBe(0.55);
    expect(variable.step(0.55, 1)).toBe(2);
  });

  it('reports the median frame rate', () => {
    expect(constant.fps).toBeCloseTo(30, 6);
    expect(new FrameIndex([0, 1 / 60, 2 / 60, 3 / 60, 1]).fps).toBeCloseTo(60, 6);
    expect(new FrameIndex([0]).fps).toBe(30);
  });

  it('copes with an empty recording', () => {
    const empty = new FrameIndex([]);
    expect(empty.indexAt(1)).toBe(0);
    expect(empty.snap(1)).toBe(0);
  });
});
