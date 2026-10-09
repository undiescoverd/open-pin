import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode } from './timecode';

describe('formatTimecode', () => {
  it.each([
    [0, '0:00.00'],
    [5.8, '0:05.80'],
    [16.9, '0:16.90'],
    [75.25, '1:15.25'],
    [725.25, '12:05.25'],
  ])('formats %s as %s', (seconds, text) => {
    expect(formatTimecode(seconds)).toBe(text);
  });

  it('rounds before splitting minutes, so it never shows 0:60.00', () => {
    expect(formatTimecode(59.996)).toBe('1:00.00');
    expect(formatTimecode(119.999)).toBe('2:00.00');
  });

  it('clamps negative times to zero', () => {
    expect(formatTimecode(-3)).toBe('0:00.00');
  });
});

describe('parseTimecode', () => {
  it.each([
    ['3', 3],
    ['3.5', 3.5],
    ['.5', 0.5],
    ['3.', 3],
    [' 3.5s ', 3.5],
    ['0:03.50', 3.5],
    ['1:02', 62],
    ['12:05.25', 725.25],
  ])('reads %j as %s seconds', (text, seconds) => {
    expect(parseTimecode(text)).toBeCloseTo(seconds, 9);
  });

  it.each(['', 'abc', '-1', '1:2:3', '1:60', '1:75', '3,5', ':30'])('rejects %j', text => {
    expect(parseTimecode(text)).toBeNull();
  });

  it('round-trips everything it formats', () => {
    for (const s of [0, 0.01, 2.1, 59.99, 60, 61.5, 600.75]) expect(parseTimecode(formatTimecode(s))).toBeCloseTo(s, 9);
  });
});
