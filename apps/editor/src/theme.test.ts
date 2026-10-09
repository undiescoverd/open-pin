import { describe, expect, it } from 'vitest';
import { nextPreference, parsePreference } from './theme';

describe('theme preference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });

  it('treats anything unknown as system', () => {
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference('sepia')).toBe('system');
  });
});
