import type { Step } from '@waypost/core';
import { describe, expect, it } from 'vitest';
import { safeFileName, stepSlug, stepTitle } from './names';

const step = (title: string): Step => ({ id: 's', anchor: { source: 'x', time: 1 }, title, body: '', minHold: 2.5, annotations: [] });

describe('names', () => {
  it('numbers steps in order and slugs the title', () => {
    expect(stepSlug(step('Open Settings'), 0, 5)).toBe('01-open-settings');
    expect(stepSlug(step('  Café — “Menu”!  '), 11, 12)).toBe('12-cafe-menu');
  });
  it('widens the number when there are many steps', () => {
    expect(stepSlug(step('x'), 0, 120)).toBe('001-x');
  });
  it('falls back for untitled steps and caps long titles', () => {
    expect(stepSlug(step(''), 2, 5)).toBe('03-step');
    expect(stepSlug(step('日本語'), 0, 5)).toBe('01-step');
    expect(stepSlug(step('a'.repeat(100)), 0, 5).length).toBeLessThanOrEqual(43);
    expect(stepTitle(step('  '), 3)).toBe('Step 4');
    expect(stepTitle(step('Go'), 3)).toBe('Go');
  });
  it('makes safe file names', () => {
    expect(safeFileName('a/b:c*d')).toBe('a b c d');
    expect(safeFileName('   ')).toBe('Waypost guide');
  });
});
