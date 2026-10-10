import { describe, expect, it } from 'vitest';
import { canDeleteClip, canSplit, clipCommands, trimLimits } from './clips';
import { commands, createProject } from './commands';
import {
  annotationInView,
  blurAlphaAt,
  blurRectAt,
  frameLayout,
  nativeOutputSize,
  outputSizeForHeight,
  outputToRecording,
  viewRect,
  zoomAmount,
  zoomBox,
} from './geometry';
import { apply, createHistory, undo } from './history';
import { audioPlan, exportPlan, holdLook, planAt, stepIntro, stepShown } from './plan';
import { newEffect } from './effects';
import { parseProject, SCHEMA_VERSION, type Blur, type Project, type Source } from './schema';
import { clipStarts, cutTimes, spotAt, srcToTl, timelineDuration } from './time';

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 20, size: [1280, 800], fps: 30 };
const fresh = (): Project => createProject({ id: 'p1', name: 'Demo', source, now: 1 });
const pin = (id: string, time: number) => commands.pinStep({ stepId: id, annotationId: `a_${id}`, source: 'src1', time, now: 2 });
const run = (p: Project, ...cmds: Array<ReturnType<typeof pin>>): Project => cmds.reduce((h, c) => apply(h, c), createHistory(p)).present;

/** Two clips: 0–10 and 10–20, from one split. */
const twoClips = (): Project => run(fresh(), clipCommands.splitClip('c_src1', 10, 'c2', 3));

describe('schema version 2', () => {
  it('opens a version 1 project, filling in blur, framing and logo', () => {
    const v1 = { ...fresh(), schema: 'waypost.project/1', blurs: undefined, assets: undefined, frame: undefined, logo: undefined };
    v1.timeline = [{ id: 'c', source: 'src1', in: 0, out: 5 } as never];
    const p = parseProject(JSON.parse(JSON.stringify(v1)));
    expect(p.schema).toBe(SCHEMA_VERSION);
    expect(p.blurs).toEqual([]);
    expect(p.frame).toMatchObject({ aspect: 'source', padding: 0, background: { type: 'none' } });
    expect(p.logo).toBeNull();
    expect(p.timeline[0]).toMatchObject({ volume: 1, muted: false });
  });

  it('keeps blur keyframes in time order on load', () => {
    const blur: Blur = { ...newBlur(), keyframes: [{ time: 5, rect: [0.5, 0.5, 0.1, 0.1] }, { time: 1, rect: [0, 0, 0.1, 0.1] }] };
    const p = parseProject(JSON.parse(JSON.stringify({ ...fresh(), blurs: [blur] })));
    expect(p.blurs[0]!.keyframes.map(k => k.time)).toEqual([1, 5]);
  });
});

describe('timeline lookups', () => {
  const clips = [
    { source: 'a', in: 0, out: 4, speed: 1, gap: 1 },
    { source: 'a', in: 6, out: 10, speed: 2, gap: 0.5 },
  ];
  it('finds clips and gaps at a timeline time', () => {
    expect(clipStarts(clips)).toEqual([1, 5.5]);
    expect(spotAt(clips, 0.5)).toEqual({ kind: 'gap', index: 0 });
    expect(spotAt(clips, 2)).toEqual({ kind: 'clip', index: 0, time: 1 });
    expect(spotAt(clips, 5.2)).toEqual({ kind: 'gap', index: 1 });
    expect(spotAt(clips, 6.5)).toEqual({ kind: 'clip', index: 1, time: 8 });
    expect(spotAt(clips, 99)).toEqual({ kind: 'clip', index: 1, time: 10 });
  });
  it('lists cuts and gap edges, not the ends', () => {
    expect(cutTimes(clips)).toEqual([1, 5, 5.5]);
    expect(cutTimes([{ source: 'a', in: 0, out: 4, speed: 1, gap: 0 }])).toEqual([]);
  });
});

describe('split', () => {
  it('splits a clip in two that play back to back, and undo joins them', () => {
    const h1 = apply(createHistory(fresh()), clipCommands.splitClip('c_src1', 7.5, 'c2', 3));
    expect(h1.present.timeline.map(c => [c.in, c.out])).toEqual([[0, 7.5], [7.5, 20]]);
    expect(timelineDuration(h1.present.timeline)).toBe(20);
    expect(undo(h1).present.timeline).toHaveLength(1);
  });
  it('refuses a split at the very edge of a clip', () => {
    expect(canSplit(fresh(), 'c_src1', 0.05)).toMatch(/too close/);
    expect(canSplit(fresh(), 'c_src1', 3)).toBe(true);
  });
});

describe('trim (acceptance checks 5 to 7)', () => {
  it('trimming the end of the last clip stops at the last pinned step; dragging back out restores the footage', () => {
    let p = run(fresh(), pin('s1', 3), pin('s2', 14));
    const limits = trimLimits(p, 'c_src1', 'out', true)!;
    expect(limits).toMatchObject({ min: 14, pinAtMin: true, max: 20 });
    p = run(p, clipCommands.trimClip('c_src1', 'out', 5, true, 3));
    expect(p.timeline[0]!.out).toBe(14);
    p = run(p, clipCommands.trimClip('c_src1', 'out', 99, true, 4));
    expect(p.timeline[0]!.out).toBe(20);
  });

  it('with ripple on, trimming clip 1 shortens the guide and moves later pins', () => {
    let p = run(twoClips(), pin('s1', 15));
    expect(srcToTl(p.timeline, 'src1', 15)).toBe(15);
    p = run(p, clipCommands.trimClip('c_src1', 'out', 8, true, 4));
    expect(timelineDuration(p.timeline)).toBe(18);
    expect(srcToTl(p.timeline, 'src1', 15)).toBe(13);
    expect(p.timeline[1]!.gap).toBe(0);
  });

  it('with ripple off, the guide length and every pin stay put and a gap appears', () => {
    let p = run(twoClips(), pin('s1', 15));
    p = run(p, clipCommands.trimClip('c_src1', 'out', 8, false, 4));
    expect(timelineDuration(p.timeline)).toBe(20);
    expect(srcToTl(p.timeline, 'src1', 15)).toBe(15);
    expect(p.timeline[1]!.gap).toBe(2);
  });

  it('with ripple off, an edge only grows back into the gap it opened, and closing the gap shortens the guide', () => {
    let p = run(twoClips(), clipCommands.trimClip('c_src1', 'out', 8, false, 4));
    expect(trimLimits(p, 'c_src1', 'out', false)!.max).toBe(10);
    p = run(p, clipCommands.trimClip('c2', 'in', 11, false, 5));
    expect(p.timeline[1]!.gap).toBe(3);
    /* clip 1 can grow into the gap (to 10) but not into clip 2's footage, which now starts at 11 */
    p = run(p, clipCommands.trimClip('c_src1', 'out', 13, false, 6));
    expect(p.timeline[0]!.out).toBe(11);
    expect(p.timeline[1]!.gap).toBe(0);
    p = run(p, clipCommands.trimClip('c_src1', 'out', 9, false, 7), clipCommands.setGap('c2', 0, 8));
    expect(timelineDuration(p.timeline)).toBe(18);
  });

  it('a left edge stops at a pin, keeps 0.2 s of source, and with ripple off leaves a leading gap', () => {
    let p = run(fresh(), pin('s1', 4));
    expect(trimLimits(p, 'c_src1', 'in', true)).toMatchObject({ max: 4, pinAtMax: true });
    p = run(p, clipCommands.trimClip('c_src1', 'in', 2, false, 3));
    expect(p.timeline[0]).toMatchObject({ in: 2, gap: 2 });
    expect(srcToTl(p.timeline, 'src1', 4)).toBe(4);
    const empty = run(fresh(), clipCommands.trimClip('c_src1', 'in', 50, true, 3));
    expect(empty.timeline[0]!.in).toBeCloseTo(19.8, 9);
  });

  it('trims at 2× count timeline time at half the source time', () => {
    let p = run(twoClips(), clipCommands.setClipSpeed('c2', 2, 3));
    expect(timelineDuration(p.timeline)).toBe(15);
    p = run(p, clipCommands.trimClip('c_src1', 'out', 6, false, 4));
    expect(p.timeline[1]!.gap).toBe(4);
  });
});

describe('speed, gaps and deleting clips', () => {
  it('speed is clamped to ¼× to 8× and does not move pins in source time', () => {
    let p = run(fresh(), pin('s1', 10), clipCommands.setClipSpeed('c_src1', 99, 3));
    expect(p.timeline[0]!.speed).toBe(8);
    expect(p.steps[0]!.anchor.time).toBe(10);
    p = run(p, clipCommands.setClipSpeed('c_src1', 0.5, 4));
    expect(srcToTl(p.timeline, 'src1', 10)).toBe(20);
  });

  it('refuses to delete a clip with a pinned step, or the only clip', () => {
    expect(canDeleteClip(fresh(), 'c_src1')).toMatch(/at least one clip/);
    const p = run(twoClips(), pin('s1', 12));
    expect(canDeleteClip(p, 'c2')).toMatch(/pinned step/);
    expect(canDeleteClip(p, 'c_src1')).toBe(true);
  });

  it('deleting a clip ripples the rest up, or leaves a gap with ripple off', () => {
    expect(timelineDuration(run(twoClips(), clipCommands.deleteClip('c_src1', true, 3)).timeline)).toBe(10);
    const kept = run(twoClips(), clipCommands.deleteClip('c_src1', false, 3));
    expect(timelineDuration(kept.timeline)).toBe(20);
    expect(kept.timeline[0]).toMatchObject({ id: 'c2', gap: 10 });
  });

  it('clip audio: volume is clamped and mute is one undo step', () => {
    const h = apply(createHistory(fresh()), clipCommands.setClipAudio('c_src1', { muted: true }, 3));
    expect(h.present.timeline[0]!.muted).toBe(true);
    expect(h.past[0]!.label).toBe('Mute clip');
    expect(run(fresh(), clipCommands.setClipAudio('c_src1', { volume: 9 }, 3)).timeline[0]!.volume).toBe(1.5);
  });
});

function newBlur(): Blur {
  return {
    id: 'b1',
    name: 'Blur 1',
    source: 'src1',
    start: 1,
    end: 9,
    layer: 0,
    effects: [newEffect('pixelate', 'f1')],
    radius: 4,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    keyframes: [{ time: 1, rect: [0.1, 0.1, 0.2, 0.1] }],
  };
}

describe('blur regions', () => {
  it('moves in straight lines between keyframes and holds outside them', () => {
    const blur = { keyframes: [{ time: 2, rect: [0, 0, 0.2, 0.2] as [number, number, number, number] }, { time: 4, rect: [0.4, 0.2, 0.2, 0.4] as [number, number, number, number] }] };
    expect(blurRectAt(blur, 0)).toEqual([0, 0, 0.2, 0.2]);
    expect(blurRectAt(blur, 3)).toEqual([0.2, 0.1, 0.2, 0.30000000000000004]);
    expect(blurRectAt(blur, 9)).toEqual([0.4, 0.2, 0.2, 0.4]);
  });

  it('covers only its time range, ramped by fades and scaled by opacity', () => {
    const b = { ...newBlur(), fadeIn: 1, fadeOut: 2, opacity: 0.5 };
    expect(blurAlphaAt(b, 0.5)).toBe(0);
    expect(blurAlphaAt(b, 1.5)).toBe(0.25);
    expect(blurAlphaAt(b, 5)).toBe(0.5);
    expect(blurAlphaAt(b, 8)).toBe(0.25);
    expect(blurAlphaAt(b, 9.5)).toBe(0);
  });

  it('moving it at another time adds a keyframe; at a keyframe moves that keyframe; flattening keeps one', () => {
    let p = run(fresh(), commands.addBlur(newBlur(), 3));
    p = run(p, commands.setBlurRect('b1', 1.01, [0.2, 0.1, 0.2, 0.1], 1 / 60, 4));
    expect(p.blurs[0]!.keyframes).toHaveLength(1);
    p = run(p, commands.setBlurRect('b1', 5, [0.6, 0.1, 0.2, 0.1], 1 / 60, 5));
    expect(p.blurs[0]!.keyframes.map(k => k.time)).toEqual([1, 5]);
    p = run(p, commands.flattenBlur('b1', 3, 6));
    expect(p.blurs[0]!.keyframes).toEqual([{ time: 1, rect: [0.4, 0.1, 0.2, 0.1] }]);
  });

  it('settings change in one command, and the name is kept short', () => {
    const p = run(fresh(), commands.addBlur(newBlur(), 3), commands.updateBlur('b1', { opacity: 0.5, name: 'x'.repeat(80) }, 4));
    expect(p.blurs[0]).toMatchObject({ opacity: 0.5 });
    expect(p.blurs[0]!.name).toHaveLength(60);
  });
});

describe('zoom', () => {
  it('a zoom box keeps the frame shape inside the frame, between 1.25× and 4×', () => {
    expect(zoomBox([0.95, 0.5], 0.5)).toEqual([0.5, 0.25, 0.5, 0.5]);
    expect(zoomBox([0.5, 0.5], 0.1)[2]).toBe(0.25);
    expect(zoomAmount([0, 0, 0.25, 0.25])).toBe(4);
  });

  it('the view eases from the whole frame into the box, and annotations follow it at their own size', () => {
    expect(viewRect([0.5, 0.5, 0.5, 0.5], 0)).toEqual([0, 0, 1, 1]);
    expect(viewRect([0.5, 0.5, 0.5, 0.5], 1)).toEqual([0.5, 0.5, 0.5, 0.5]);
    const view = viewRect([0.5, 0.5, 0.5, 0.5], 1);
    expect(annotationInView({ id: 'a', type: 'click', at: [0.75, 0.75], color: '#FF5A4E', reveal: 0 }, view).at).toEqual([0.5, 0.5]);
    expect(annotationInView({ id: 'b', type: 'box', rect: [0.5, 0.5, 0.25, 0.1], color: '#FF5A4E', reveal: 0 }, view).rect).toEqual([0, 0, 0.5, 0.2]);
  });

  it('setting and removing a zoom are undo steps', () => {
    let h = apply(createHistory(run(fresh(), pin('s1', 2))), commands.setStepZoom('s1', [0.1, 0.1, 0.5, 0.5], 3));
    expect(h.present.steps[0]!.zoom).toEqual({ rect: [0.1, 0.1, 0.5, 0.5] });
    h = apply(h, commands.setStepZoom('s1', null, 4));
    expect(h.past.map(e => e.label)).toEqual(['Change zoom', 'Remove zoom']);
  });
});

describe('framing', () => {
  it('without padding the output is the recording; padding grows it so the recording keeps its pixels', () => {
    expect(nativeOutputSize({ aspect: 'source', padding: 0 }, [1280, 800])).toEqual([1280, 800]);
    const [w, h] = nativeOutputSize({ aspect: 'source', padding: 0.1 }, [1280, 800]);
    const layout = frameLayout({ aspect: 'source', padding: 0.1 }, [1280, 800], [w, h]);
    expect(layout.inset).toBe(true);
    expect(layout.inner[2]).toBeGreaterThanOrEqual(1279);
    expect(layout.inner[3]).toBeGreaterThanOrEqual(799);
  });

  it('a 16:9 frame letterboxes a 16:10 recording, and presets keep the shape', () => {
    const [w, h] = nativeOutputSize({ aspect: '16:9', padding: 0 }, [1280, 800]);
    expect(w / h).toBeCloseTo(16 / 9, 2);
    expect(frameLayout({ aspect: '16:9', padding: 0 }, [1280, 800], [w, h]).inset).toBe(true);
    expect(outputSizeForHeight({ aspect: '16:9' }, [1280, 800], 2160)).toEqual([3840, 2160]);
  });

  it('maps a pointer on the output back onto the recording', () => {
    const layout = frameLayout({ aspect: 'source', padding: 0.1 }, [1000, 1000], [1000, 1000]);
    expect(outputToRecording([500, 500], layout)).toEqual([0.5, 0.5]);
    expect(outputToRecording([100, 100], layout)).toEqual([0, 0]);
  });
});

describe('the export plan', () => {
  it('pauses at every step on the timeline for its hold, in timeline order', () => {
    let p = run(twoClips(), pin('s1', 2), pin('s2', 15), clipCommands.setClipSpeed('c2', 2, 3));
    p = run(p, commands.setStepHold('s2', 3, 4));
    const plan = exportPlan(p);
    expect(plan.items.map(i => [i.kind, i.start, i.duration])).toEqual([
      ['play', 0, 2],
      ['hold', 2, 2.5],
      ['play', 4.5, 10.5],
      ['hold', 15, 3],
      ['play', 18, 2.5],
    ]);
    expect(plan.duration).toBe(20.5);
    expect(planAt(plan, 3)).toEqual({ timeline: 2, hold: { stepId: 's1', t: 1, duration: 2.5 } });
    expect(planAt(plan, 5.5)).toEqual({ timeline: 3, hold: null });
    expect(planAt(plan, 99).timeline).toBe(15);
  });

  it('a step at the very start holds first; a step cut from the timeline is left out', () => {
    let p = run(fresh(), pin('s1', 0), pin('s2', 5));
    p = { ...p, timeline: [{ ...p.timeline[0]!, in: 0, out: 4 }] };
    const plan = exportPlan(p);
    expect(plan.items.map(i => i.kind)).toEqual(['hold', 'play']);
  });

  it('a step eases into its zoom, reveals its groups in order, then fades and zooms out at the end of its pause', () => {
    const step = {
      zoom: { rect: [0.2, 0.2, 0.5, 0.5] as [number, number, number, number] },
      annotations: [
        { id: 'a', type: 'click' as const, at: [0.5, 0.5] as [number, number], color: '#FF5A4E', reveal: 0 },
        { id: 'b', type: 'click' as const, at: [0.5, 0.5] as [number, number], color: '#FF5A4E', reveal: 2 },
      ],
    };
    expect(stepIntro(step, 0)).toMatchObject({ zoom: 0 });
    expect(stepIntro(step, 0.6).zoom).toBe(1);
    const late = stepIntro(step, 3);
    expect([late.reveal[0], late.reveal[2]]).toEqual([1, 1]);
    const early = stepIntro(step, 0.5);
    expect(early.reveal[0]).toBeGreaterThan(0);
    expect(early.reveal[2]).toBe(0);
    const end = holdLook(step, 2.5, 2.5);
    expect(end.zoom).toBe(0);
    expect(end.reveal.every(a => a === 0)).toBe(true);
    expect(holdLook(step, 1.6, 2.5).reveal[2]).toBeGreaterThan(0.9);
    expect(stepShown(step)).toMatchObject({ zoom: 1 });
  });
});

describe('blur timing', () => {
  it('moving the bar moves its keyframes with it; trimming an edge does not', () => {
    const blur: Blur = { ...newBlur(), keyframes: [{ time: 1, rect: [0, 0, 0.1, 0.1] }, { time: 5, rect: [0.5, 0, 0.1, 0.1] }] };
    let p = run(fresh(), commands.addBlur(blur, 2), commands.placeBlur('b1', { start: 3, end: 11, shift: true }, 3));
    expect(p.blurs[0]).toMatchObject({ start: 3, end: 11 });
    expect(p.blurs[0]!.keyframes.map(k => k.time)).toEqual([3, 7]);
    p = run(p, commands.placeBlur('b1', { start: 4, end: 11, shift: false }, 4));
    expect(p.blurs[0]!.keyframes.map(k => k.time)).toEqual([3, 7]);
    p = run(p, commands.placeBlur('b1', { start: 4, end: 99, shift: false }, 5));
    expect(p.blurs[0]!.end).toBe(20);
    p = run(p, commands.placeBlur('b1', { start: 4, end: 2, shift: false }, 6));
    expect(p.blurs[0]).toMatchObject({ start: 4 });
    expect(p.blurs[0]!.end).toBeCloseTo(4.1, 9);
  });
});

describe('the soundtrack', () => {
  it('plays the recording under clips at 1×, silent in pauses, gaps, muted and sped-up clips', () => {
    let p = run(twoClips(), pin('s1', 4), clipCommands.trimClip('c_src1', 'out', 8, false, 3), clipCommands.setClipSpeed('c2', 2, 4));
    p = run(p, clipCommands.setClipAudio('c_src1', { volume: 0.5 }, 5));
    const segments = audioPlan(p, exportPlan(p));
    expect(segments).toEqual([
      { start: 0, duration: 4, source: { time: 0, volume: 0.5 } },
      { start: 4, duration: 2.5, source: undefined },
      { start: 6.5, duration: 4, source: { time: 4, volume: 0.5 } },
      { start: 10.5, duration: 7, source: undefined },
    ]);
    expect(segments.reduce((t, s) => t + s.duration, 0)).toBeCloseTo(exportPlan(p).duration, 9);
  });
});
