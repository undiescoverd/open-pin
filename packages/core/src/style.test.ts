import { describe, expect, it } from 'vitest';
import { commands, createProject } from './commands';
import { apply, createHistory, undo } from './history';
import { parseProject, type Project, type Source } from './schema';

/* One annotation colour per guide (docs/06-simplify-plan.md, "Other decisions"). */

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 10, size: [1280, 800], fps: 25 };
const LAGOON = '#13B8A6';
const IRIS = '#6E6BFF';

function project(): Project {
  let h = createHistory(createProject({ id: 'p1', name: 'Demo', source, now: 1 }));
  h = apply(h, commands.pinStep({ stepId: 's1', annotationId: 'c1', source: 'src1', time: 2, at: [0.5, 0.5], now: 2 }));
  return h.present;
}

describe('the guide annotation colour', () => {
  it('is coral by default, also for projects saved before it existed, and a new click marker takes it', () => {
    const p = project();
    expect(p.guide.annotationColor).toBe('#FF5A4E');
    expect(p.steps[0]!.annotations[0]).toMatchObject({ type: 'click', color: '#FF5A4E' });
    const oldGuide: Partial<Project['guide']> = { ...p.guide };
    delete oldGuide.annotationColor;
    expect(parseProject({ ...p, guide: oldGuide }).guide.annotationColor).toBe('#FF5A4E');

    const lagoon = apply(createHistory(p), commands.setAnnotationColor(LAGOON, 3)).present;
    const next = apply(createHistory(lagoon), commands.pinStep({ stepId: 's2', annotationId: 'c2', source: 'src1', time: 5, at: [0.2, 0.2], now: 4 })).present;
    expect(next.steps[1]!.annotations[0]).toMatchObject({ color: LAGOON });
  });

  it('recolours every annotation still in the old colour, leaves hand-picked ones alone, and undoes in one step', () => {
    let h = createHistory(project());
    h = apply(h, commands.addAnnotation('s1', { id: 'a1', type: 'arrow', from: [0.1, 0.1], to: [0.3, 0.3], color: '#ff5a4e', reveal: 0 }, 3));
    h = apply(h, commands.addAnnotation('s1', { id: 'a2', type: 'box', rect: [0.1, 0.1, 0.2, 0.2], color: IRIS, reveal: 0 }, 3));
    h = apply(h, commands.addAnnotation('s1', { id: 'a3', type: 'spotlight', rect: [0.1, 0.1, 0.2, 0.2], reveal: 0 }, 3));
    h = apply(h, commands.setAnnotationColor(LAGOON, 4));
    const colours = h.present.steps[0]!.annotations.map(a => ('color' in a ? a.color : null));
    expect(colours).toEqual([LAGOON, LAGOON, IRIS, null]);
    expect(h.present.guide.annotationColor).toBe(LAGOON);
    h = undo(h);
    expect(h.present.guide.annotationColor).toBe('#FF5A4E');
    expect(h.present.steps[0]!.annotations.map(a => ('color' in a ? a.color : null))).toEqual(['#FF5A4E', '#ff5a4e', IRIS, null]);
  });
});

describe('what a new project starts with', () => {
  it('is widescreen on a gradient, filling the canvas with no padding, so the look can be chosen first', () => {
    const p = createProject({ id: 'p1', name: 'Demo', source, now: 1 });
    expect(p.frame).toEqual({ aspect: '16:9', padding: 0, background: { type: 'gradient', preset: 'dusk' }, cornerRadius: 12, shadow: true });
  });

  it('leaves a project saved without a frame as it was: the recording on its own, no background', () => {
    const p = createProject({ id: 'p1', name: 'Demo', source, now: 1 });
    const old: Partial<Project> = { ...p };
    delete old.frame;
    expect(parseProject(old).frame).toEqual({ aspect: 'source', padding: 0, background: { type: 'none' }, cornerRadius: 12, shadow: true });
  });
});
