import { describe, expect, it } from 'vitest';
import { commands, createProject, stepAtTime } from './commands';
import { apply, canRedo, canUndo, createHistory, redo, redoLabel, undo, undoLabel } from './history';
import { parseProject, ProjectParseError, type Project, type Source } from './schema';
import { isOnTimeline, orderedSteps, snapToFrame, srcToTl, timelineDuration, tlToSrc } from './time';

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 10, size: [1280, 800], fps: 30 };
const fresh = (): Project => createProject({ id: 'p1', name: 'Demo', source, now: 1 });
let n = 0;
const pin = (time: number, at?: [number, number]) =>
  commands.pinStep({ stepId: `s${++n}`, annotationId: `a${n}`, source: 'src1', time, at, now: 2 });

describe('createProject and parseProject', () => {
  it('makes one clip covering the whole recording and round-trips through the schema', () => {
    const p = fresh();
    expect(p.timeline).toEqual([{ id: 'c_src1', source: 'src1', in: 0, out: 10, speed: 1, gap: 0, volume: 1, muted: false }]);
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('refuses a project from a newer version and anything malformed, with a readable message', () => {
    expect(() => parseProject({ ...fresh(), schema: 'waypost.project/4' })).toThrow(/newer version/);
    expect(() => parseProject({ nope: true })).toThrow(ProjectParseError);
    const bad = { ...fresh(), steps: [{ id: 's', anchor: { source: 'src1', time: 1 }, title: '', body: '', annotations: [{ type: 'click', id: 'a', at: [2, 0], color: 'red' }] }] };
    expect(() => parseProject(bad)).toThrow(/valid Waypost project/);
  });

  it('fills in defaults for fields older files omit', () => {
    const p = fresh();
    const loose = { ...p, timeline: [{ id: 'c', source: 'src1', in: 0, out: 5 }], steps: [{ id: 's', anchor: { source: 'src1', time: 1 }, title: 'x', body: '', annotations: [] }] };
    const parsed = parseProject(loose);
    expect(parsed.timeline[0]).toMatchObject({ speed: 1, gap: 0 });
    expect(parsed.steps[0]!.minHold).toBe(2.5);
  });
});

describe('time mapping', () => {
  const clips = [
    { id: 'c1', source: 'a', in: 0, out: 9, speed: 1, gap: 0 },
    { id: 'c2', source: 'a', in: 12, out: 16, speed: 2, gap: 1 },
  ];
  it('adds gaps and divides by speed', () => {
    expect(timelineDuration(clips)).toBe(9 + 1 + 2);
    expect(srcToTl(clips, 'a', 4)).toBe(4);
    expect(srcToTl(clips, 'a', 14)).toBe(9 + 1 + 1);
  });
  it('maps a time between clips to the start of the next, and past the end to the end', () => {
    expect(srcToTl(clips, 'a', 10)).toBe(10);
    expect(srcToTl(clips, 'a', 99)).toBe(12);
  });
  it('inverts srcToTl, holding the previous clip’s last frame inside a gap', () => {
    expect(tlToSrc(clips, 4)).toEqual({ source: 'a', time: 4 });
    expect(tlToSrc(clips, 9.5)).toEqual({ source: 'a', time: 9 });
    expect(tlToSrc(clips, 11)).toEqual({ source: 'a', time: 14 });
    expect(tlToSrc(clips, 50)).toEqual({ source: 'a', time: 16 });
    expect(tlToSrc([], 1)).toBeNull();
  });
  it('knows which source times a clip plays', () => {
    expect(isOnTimeline(clips, 'a', 5)).toBe(true);
    expect(isOnTimeline(clips, 'a', 10)).toBe(false);
  });
  it('snaps to whole frames', () => {
    expect(snapToFrame(1.017, 30)).toBeCloseTo(1.0333, 3);
  });
});

describe('commands and undo', () => {
  it('pins a step with a click marker, keeping steps in time order', () => {
    let h = createHistory(fresh());
    h = apply(h, pin(5, [0.5, 0.5]));
    h = apply(h, pin(2, [0.1, 0.2]));
    expect(h.present.steps.map(s => s.anchor.time)).toEqual([2, 5]);
    expect(h.present.steps[0]!.annotations[0]).toMatchObject({ type: 'click', at: [0.1, 0.2] });
    expect(orderedSteps(h.present).map(s => s.anchor.time)).toEqual([2, 5]);
  });

  it('pinning an already pinned frame moves its click marker instead of adding a step', () => {
    let h = createHistory(fresh());
    h = apply(h, pin(3, [0.1, 0.1]));
    h = apply(h, pin(3 + 0.01, [0.8, 0.9]));
    expect(h.present.steps).toHaveLength(1);
    expect(h.present.steps[0]!.annotations).toHaveLength(1);
    expect(h.present.steps[0]!.annotations[0]).toMatchObject({ at: [0.8, 0.9] });
    expect(stepAtTime(h.present, 'src1', 3)).toBeDefined();
  });

  it('clamps click positions into the frame and the time into the recording', () => {
    const h = apply(createHistory(fresh()), pin(99, [1.4, -0.2]));
    expect(h.present.steps[0]!.anchor.time).toBe(10);
    expect(h.present.steps[0]!.annotations[0]).toMatchObject({ at: [1, 0] });
  });

  it('undoes and redoes exactly, with labels', () => {
    let h = createHistory(fresh());
    const start = h.present;
    h = apply(h, pin(4, [0.5, 0.5]));
    const stepId = h.present.steps[0]!.id;
    h = apply(h, commands.setStepText(stepId, { title: 'Open Settings' }, 3));
    expect(undoLabel(h)).toBe('Edit title');
    h = undo(h);
    expect(h.present.steps[0]!.title).toBe('');
    expect(redoLabel(h)).toBe('Edit title');
    h = undo(h);
    expect(h.present).toEqual(start);
    expect(canUndo(h)).toBe(false);
    h = redo(redo(h));
    expect(h.present.steps[0]!.title).toBe('Open Settings');
    expect(canRedo(h)).toBe(false);
  });

  it('a new edit clears redo, and an edit that changes nothing adds no undo step', () => {
    let h = createHistory(fresh());
    h = apply(h, pin(1, [0.5, 0.5]));
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = apply(h, pin(2, [0.5, 0.5]));
    expect(canRedo(h)).toBe(false);
    const before = h;
    expect(apply(h, commands.setStepText(h.present.steps[0]!.id, { title: '' }, 3))).toBe(before);
  });

  it('merges edits that share a coalesce key into one undo step, but not across keys', () => {
    let h = apply(createHistory(fresh()), pin(1, [0.5, 0.5]));
    const id = h.present.steps[0]!.id;
    for (const title of ['O', 'Op', 'Ope', 'Open']) h = apply(h, commands.setStepText(id, { title }, 3, 'session-1'));
    expect(h.past).toHaveLength(2);
    h = apply(h, commands.setStepText(id, { title: 'Open it' }, 4, 'session-2'));
    expect(h.past).toHaveLength(3);
    h = undo(h);
    expect(h.present.steps[0]!.title).toBe('Open');
    h = undo(h);
    expect(h.present.steps[0]!.title).toBe('');
    h = redo(h);
    expect(h.present.steps[0]!.title).toBe('Open');
  });

  it('keeps 80 steps of history', () => {
    let h = createHistory(fresh());
    for (let i = 0; i < 90; i++) h = apply(h, commands.renameProject(`Name ${i}`, i));
    expect(h.past).toHaveLength(80);
  });

  it('moves a step, re-sorts, and refuses to land on another pin', () => {
    let h = apply(createHistory(fresh()), pin(2));
    h = apply(h, pin(6));
    const [a, b] = h.present.steps.map(s => s.id) as [string, string];
    h = apply(h, commands.moveStep(a, 8, 5));
    expect(h.present.steps.map(s => s.id)).toEqual([b, a]);
    const unchanged = apply(h, commands.moveStep(a, 6, 6));
    expect(unchanged).toBe(h);
  });

  it('adds, updates and removes annotations, and removes steps', () => {
    let h = apply(createHistory(fresh()), pin(2, [0.2, 0.2]));
    const id = h.present.steps[0]!.id;
    h = apply(h, commands.addAnnotation(id, { id: 'co', type: 'callout', anchor: [0.3, 0.3], text: 'Hi', placement: 'right', color: '#FF5A4E', reveal: 0 }, 3));
    h = apply(h, commands.updateAnnotation(id, 'co', { text: 'Hello' }, 4));
    expect(h.present.steps[0]!.annotations[1]).toMatchObject({ text: 'Hello' });
    h = apply(h, commands.removeAnnotation(id, 'co', 5));
    expect(h.present.steps[0]!.annotations).toHaveLength(1);
    h = apply(h, commands.removeStep(id, 6));
    expect(h.present.steps).toHaveLength(0);
  });
});

describe('replaceAnnotation', () => {
  it('swaps a spotlight for an outline in the same place, keeping its id, and undoes', () => {
    let h = createHistory(fresh());
    h = apply(h, commands.pinStep({ stepId: 'a', annotationId: 'a_click', source: 'src1', time: 1, at: [0.4, 0.4], now: 2 }));
    h = apply(h, commands.addAnnotation('a', { id: 'h', type: 'spotlight', rect: [0.1, 0.1, 0.2, 0.2], reveal: 1 }, 3));
    h = apply(h, commands.addAnnotation('a', { id: 'c', type: 'callout', anchor: [0.5, 0.5], text: 'Hi', placement: 'bottom', color: '#FF5A4E', reveal: 0 }, 4));
    const after = apply(h, commands.replaceAnnotation('a', 'h', { id: 'other', type: 'box', rect: [0.1, 0.1, 0.2, 0.2], color: '#FF5A4E', reveal: 1 }, 5));
    expect(after.present.steps[0]!.annotations.map(a => `${a.id}:${a.type}`)).toEqual(['a_click:click', 'h:box', 'c:callout']);
    expect(undo(after).present.steps[0]!.annotations[1]!.type).toBe('spotlight');
  });
});

describe('duplicateStep', () => {
  const setup = () => {
    let h = createHistory(fresh());
    h = apply(h, commands.pinStep({ stepId: 'a', annotationId: 'a_click', source: 'src1', time: 1, at: [0.4, 0.4], now: 2 }));
    h = apply(h, commands.setStepText('a', { title: 'Click Invite', body: 'Top right.' }, 3));
    h = apply(h, commands.setStepZoom('a', [0.2, 0.2, 0.5, 0.5], 4));
    return h;
  };

  it('copies words, pause, zoom and annotations onto the new frame, with new ids, in time order', () => {
    const h = apply(setup(), commands.duplicateStep({ sourceStepId: 'a', stepId: 'b', annotationIds: ['b_click'], time: 0.5, now: 5 }));
    const steps = h.present.steps;
    expect(steps.map(s => s.id)).toEqual(['b', 'a']);
    const copy = steps[0]!;
    expect(copy).toMatchObject({ title: 'Click Invite', body: 'Top right.', anchor: { source: 'src1', time: 0.5 } });
    expect(copy.annotations.map(a => a.id)).toEqual(['b_click']);
    expect(copy.zoom).toEqual(steps[1]!.zoom);
    expect(copy.zoom).not.toBeNull();
  });

  it('does nothing when a step already sits on that frame', () => {
    const before = setup();
    const after = apply(before, commands.duplicateStep({ sourceStepId: 'a', stepId: 'b', annotationIds: ['b_click'], time: 1, now: 5 }));
    expect(after.present.steps).toHaveLength(1);
  });
});
