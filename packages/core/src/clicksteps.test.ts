import { describe, expect, it } from 'vitest';
import { commands, createProject } from './commands';
import { apply, createHistory, undo } from './history';
import { parseProject, type Project, type Source } from './schema';

const source: Source = { id: 'src1', file: 'sources/tab.webm', name: 'Tab recording.webm', duration: 12, size: [1280, 720], fps: 30 };
const fresh = (): Project => createProject({ id: 'p1', name: 'Tab', source, now: 1 });
const one = (n: number, time: number, at: [number, number], title = '', more?: [number, number][]) => ({
  stepId: `s${n}`,
  annotationIds: [`a${n}`, `a${n}b`, `a${n}c`],
  time,
  at,
  title,
  more,
});

describe('steps from captured clicks', () => {
  it('adds a step at each click, in time order, each with its click marker and title', () => {
    const history = apply(createHistory(fresh()), commands.addClickSteps({ source: 'src1', now: 2, steps: [one(2, 8, [0.8, 0.2], 'Click Save'), one(1, 2, [0.1, 0.3], 'Click Invite')] }));
    const steps = history.present.steps;
    expect(steps.map(s => s.title)).toEqual(['Click Invite', 'Click Save']);
    expect(steps.map(s => s.anchor.time)).toEqual([2, 8]);
    expect(steps[0]!.annotations).toEqual([{ id: 'a1', type: 'click', at: [0.1, 0.3], color: history.present.guide.annotationColor, reveal: 0 }]);
    expect(parseProject(JSON.parse(JSON.stringify(history.present)))).toEqual(history.present);
  });

  it('is one undo step for all of them', () => {
    const history = apply(createHistory(fresh()), commands.addClickSteps({ source: 'src1', now: 2, steps: [one(1, 2, [0.1, 0.1]), one(2, 5, [0.2, 0.2]), one(3, 9, [0.3, 0.3])] }));
    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.label).toBe('Add steps from clicks');
    expect(undo(history).present.steps).toEqual([]);
  });

  it('folds further clicks into one step, shown one after another', () => {
    const history = apply(createHistory(fresh()), commands.addClickSteps({ source: 'src1', now: 2, steps: [one(1, 3, [0.1, 0.1], 'Click Menu', [[0.2, 0.2], [0.3, 0.3]])] }));
    expect(history.present.steps[0]!.annotations.map(a => [a.id, a.reveal])).toEqual([['a1', 0], ['a1b', 1], ['a1c', 2]]);
  });

  it('leaves a frame that already has a step alone, and keeps times inside the recording', () => {
    const start = apply(createHistory(fresh()), commands.pinStep({ stepId: 'mine', annotationId: 'am', source: 'src1', time: 4, now: 2 }));
    const history = apply(start, commands.addClickSteps({ source: 'src1', now: 3, steps: [one(1, 4, [0.5, 0.5], 'Click again'), one(2, 99, [0.9, 0.9], 'Click Done'), one(3, -3, [0.1, 0.1], 'Click Start')] }));
    expect(history.present.steps.map(s => [s.id, s.anchor.time])).toEqual([['s3', 0], ['mine', 4], ['s2', 12]]);
  });
});
