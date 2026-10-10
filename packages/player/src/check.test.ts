import { commands, createProject, planGuide, type Project, type Source } from '@waypost/core';
import { describe, expect, it } from 'vitest';
import { checkGuide, isGuidePath } from './check';

/* The player's own check of guide.json agrees with the full schema on what the editor writes, and refuses the rest. */

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 10, size: [1280, 800], fps: 30 };
function guide() {
  const p: Project = createProject({ id: 'p1', name: 'Demo', source, now: 1 });
  const pinned = commands.pinStep({ stepId: 's1', annotationId: 'a1', source: 'src1', time: 4, now: 2 });
  const draft = structuredClone(p);
  pinned.run(draft);
  return planGuide(draft).guide;
}

describe('checkGuide', () => {
  it('accepts what planGuide writes', () => {
    const g = guide();
    expect(checkGuide(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it('refuses other files, newer versions, empty guides and paths outside the folder', () => {
    expect(() => checkGuide({ hello: 1 })).toThrow(/isn't a Waypost guide/);
    expect(() => checkGuide({ ...guide(), schema: 'waypost.guide/2' })).toThrow(/newer version/);
    expect(() => checkGuide({ ...guide(), steps: [] })).toThrow(/no steps/);
    expect(() => checkGuide({ ...guide(), poster: 'https://elsewhere.example/x.webp' })).toThrow(/outside its folder/);
    const g = guide();
    expect(() => checkGuide({ ...g, steps: [{ ...g.steps[0]!, still: '../x.webp' }] })).toThrow(/outside its folder/);
    expect(() => checkGuide({ ...g, cta: { label: 'x', url: 'javascript:alert(1)', newTab: true, showAt: 'end' } })).toThrow(/web address/);
  });

  it('knows a guide path', () => {
    expect(isGuidePath('steps/s_1.webp')).toBe(true);
    expect(isGuidePath('/steps/s.webp')).toBe(false);
    expect(isGuidePath('a/../b')).toBe(false);
    expect(isGuidePath('//cdn.example/x')).toBe(false);
  });
});
