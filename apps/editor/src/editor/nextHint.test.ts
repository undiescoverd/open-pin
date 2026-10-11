import type { Project } from '@waypost/core';
import { describe, expect, it } from 'vitest';
import { nextHint } from './nextHint';

const project = (titles: string[]) => ({ steps: titles.map((title, i) => ({ id: `s${i}`, title })) }) as unknown as Project;

describe('the next-step hint', () => {
  it('asks for a step, then a title for the first step without one, then a preview', () => {
    expect(nextHint(project([]), false)).toBe('Press Add step where the viewer should click');
    expect(nextHint(project(['Open the menu', ' ', '']), false)).toBe('Give step 2 a title');
    expect(nextHint(project(['Open the menu', 'Save it']), false)).toBe('Preview it, then Export');
  });

  it('says nothing once the guide is ready and has been previewed or exported', () => {
    expect(nextHint(project(['Open the menu']), true)).toBe('');
    /* until then it keeps asking for what's missing */
    expect(nextHint(project(['']), true)).toBe('Give step 1 a title');
  });
});
