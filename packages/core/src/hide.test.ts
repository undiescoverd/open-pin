import { describe, expect, it } from 'vitest';
import { commands, createProject } from './commands';
import { newEffect } from './effects';
import { apply, createHistory, undo, type Command } from './history';
import { HIDE_LOOKS, hideEffect, hideLook, hideSpanFor, hideSpanOf, stepSpanAt, stepSpans } from './hide';
import type { Blur, Project, Source } from './schema';

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 10, size: [1280, 800], fps: 25 };
const half = 0.5 / 25;

/** A project with steps pinned at 2 s, 5 s and 8 s. */
function withSteps(): Project {
  let h = createHistory(createProject({ id: 'p1', name: 'Demo', source, now: 1 }));
  for (const [i, t] of [2, 5, 8].entries()) h = apply(h, commands.pinStep({ stepId: `s${i + 1}`, annotationId: `a${i + 1}`, source: 'src1', time: t, now: 2 }));
  return h.present;
}
const run = (p: Project, ...cmds: Array<Command<Project>>): Project => cmds.reduce((h, c) => apply(h, c), createHistory(p)).present;

function region(id: string, start: number, end: number, layer = 0): Blur {
  return { id, name: id, source: 'src1', start, end, layer, effects: [hideEffect('cover', `f_${id}`)], radius: 4, opacity: 1, fadeIn: 0, fadeOut: 0, keyframes: [{ time: start, rect: [0.1, 0.1, 0.2, 0.1] }] };
}

describe('Hide looks', () => {
  it('cover is an opaque ink fill; pixelate and blur start strong', () => {
    expect(hideEffect('cover', 'f')).toEqual({ id: 'f', type: 'solid', on: true, amount: 100, color: '#0E1116' });
    expect(hideEffect('pixelate', 'f')).toMatchObject({ type: 'pixelate', amount: HIDE_LOOKS.pixelate.amount });
    expect(HIDE_LOOKS.blur.amount).toBeGreaterThan(newEffect('blur', 'x').amount);
  });

  it('a region has a simple look only with exactly one effect, switched on, of those three kinds', () => {
    expect(hideLook({ effects: [hideEffect('pixelate', 'f')] })).toBe('pixelate');
    expect(hideLook({ effects: [{ ...newEffect('solid', 'f'), color: '#FF5A4E' }] })).toBe('cover');
    expect(hideLook({ effects: [newEffect('darken', 'f')] })).toBeNull();
    expect(hideLook({ effects: [{ ...hideEffect('blur', 'f'), on: false }] })).toBeNull();
    expect(hideLook({ effects: [hideEffect('blur', 'f'), newEffect('darken', 'g')] })).toBeNull();
    expect(hideLook({ effects: [] })).toBeNull();
  });
});

describe('Hide timing', () => {
  it('each step owns the motion from the step before up to its own frame, meeting half a frame after each pinned frame', () => {
    const spans = stepSpans(withSteps(), 'src1').map(s => [s.step.id, s.start, s.end]);
    expect(spans).toEqual([
      ['s1', 0, 2 + half],
      ['s2', 2 + half, 5 + half],
      ['s3', 5 + half, 8 + half],
    ]);
    expect(stepSpanAt(withSteps(), 'src1', 5)?.step.id).toBe('s2');
    expect(stepSpanAt(withSteps(), 'src1', 9)).toBeUndefined();
  });

  it('reads a region as the whole video, one step, from a point to the end, or none of those', () => {
    const p = withSteps();
    expect(hideSpanOf(p, region('a', 0, 10))).toBe('all');
    expect(hideSpanOf(p, region('a', 2 + half, 5 + half))).toBe('step');
    expect(hideSpanOf(p, region('a', 3, 10))).toBe('rest');
    expect(hideSpanOf(p, region('a', 3, 4))).toBeNull();
  });

  it('places a choice from the time on screen: this step, from the start of this step, or past the last step from there', () => {
    const p = withSteps();
    expect(hideSpanFor(p, 'src1', 'step', 4)).toEqual({ start: 2 + half, end: 5 + half });
    expect(hideSpanFor(p, 'src1', 'rest', 4)).toEqual({ start: 2 + half, end: 10 });
    expect(hideSpanFor(p, 'src1', 'rest', 9)).toEqual({ start: 9, end: 10 });
    expect(hideSpanFor(p, 'src1', 'step', 9)).toBeNull();
    expect(hideSpanFor(p, 'src1', 'all', 9)).toEqual({ start: 0, end: 10 });
  });

  it('setBlurSpan covers the time asked for, moving to a free layer rather than stopping at a neighbour, and undoes', () => {
    const p: Project = { ...withSteps(), blurs: [region('a', 0, 3), region('b', 6, 10)] };
    const h = apply(createHistory(p), commands.setBlurSpan('b', 0, 10, 3));
    const b = h.present.blurs.find(x => x.id === 'b')!;
    expect([b.start, b.end, b.layer]).toEqual([0, 10, 1]);
    expect(undo(h).present.blurs.find(x => x.id === 'b')).toMatchObject({ start: 6, end: 10, layer: 0 });
    /* too short a span is stretched to the minimum, and an unchanged one leaves no undo step */
    expect(run(p, commands.setBlurSpan('a', 1, 1.01, 3)).blurs[0]).toMatchObject({ start: 1, end: 1.1 });
    expect(apply(createHistory(p), commands.setBlurSpan('a', 0, 3, 3)).past).toHaveLength(0);
  });

  it('setBlurEffects replaces the whole stack', () => {
    const p: Project = { ...withSteps(), blurs: [{ ...region('a', 0, 3), effects: [newEffect('pixelate', 'x'), newEffect('darken', 'y')] }] };
    expect(run(p, commands.setBlurEffects('a', [hideEffect('blur', 'z')], 3)).blurs[0]!.effects.map(e => e.type)).toEqual(['blur']);
  });
});
