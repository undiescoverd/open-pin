import { describe, expect, it } from 'vitest';
import { clipCommands } from './clips';
import { textOn } from './colour';
import { commands, createProject } from './commands';
import { GUIDE_SCHEMA } from './constants';
import { guideSize, parseGuide, planGuide, stepFileIds } from './guide';
import { apply, createHistory, type Command } from './history';
import { OUTRO_FADE, ZOOM_OUT, guideHold, introLength, outroLength, stepOutro } from './plan';
import { DEFAULT_GUIDE, parseProject, SCHEMA_VERSION, type Project, type Source } from './schema';

/* Phase 3 (docs/04-roadmap.md, "Phase 3 — Interactive guide"): player settings in the project, and the guide.json a project
   publishes as. */

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 20, size: [1280, 800], fps: 30 };
const fresh = (): Project => createProject({ id: 'p1', name: 'Demo', source, now: 1 });
const pin = (id: string, time: number) => commands.pinStep({ stepId: id, annotationId: `a_${id}`, source: 'src1', time, now: 2 });
const run = (p: Project, ...cmds: Command<Project>[]): Project => cmds.reduce((h, c) => apply(h, c), createHistory(p)).present;

describe('schema version 3: player settings', () => {
  it('opens version 1 and 2 projects with the default player settings', () => {
    for (const version of ['waypost.project/1', 'waypost.project/2']) {
      const old: Record<string, unknown> = { ...fresh(), schema: version };
      delete old.guide;
      const p = parseProject(JSON.parse(JSON.stringify(old)));
      expect(p.schema).toBe(SCHEMA_VERSION);
      expect(p.guide).toEqual(DEFAULT_GUIDE);
    }
  });

  it('new projects start guided, with every control, coral and no call to action', () => {
    expect(fresh().guide).toEqual({ mode: 'guided', controls: { counter: true, progress: true, fullscreen: true }, accent: '#D13A30', chrome: 'auto', cta: null, address: '' });
  });

  it('setGuide changes settings in one undo step and does nothing when nothing changes', () => {
    const history = apply(createHistory(fresh()), commands.setGuide({ mode: 'auto' }, 3));
    expect(history.present.guide.mode).toBe('auto');
    expect(history.past).toHaveLength(1);
    expect(apply(history, commands.setGuide({ mode: 'auto' }, 4)).past).toHaveLength(1);
  });

  it('a call to action shown from a deleted step moves to the end card', () => {
    const cta = { label: 'Try it', url: 'https://example.com', newTab: true, showAt: 's1' };
    const p = run(fresh(), pin('s1', 2), commands.setGuide({ cta }, 3), commands.removeStep('s1', 4));
    expect(p.guide.cta?.showAt).toBe('end');
  });
});

describe('step timing in the player', () => {
  const callout = (reveal: number) => ({ id: `c${reveal}`, type: 'callout' as const, anchor: [0.5, 0.5] as [number, number], text: 'x', placement: 'right' as const, color: '#FFFFFF', reveal });
  it('stays on a step for its pause, and never less than its entrance', () => {
    expect(guideHold({ minHold: 2.5, zoom: null, annotations: [] })).toBe(2.5);
    const busy = { minHold: 1, zoom: { rect: [0, 0, 0.5, 0.5] as [number, number, number, number] }, annotations: [callout(0), callout(1), callout(2), callout(3)] };
    expect(guideHold(busy)).toBeCloseTo(introLength(busy) + 0.6, 6);
  });

  it('leaves a step by fading its annotations and easing out of its zoom', () => {
    const zoomed = { zoom: { rect: [0, 0, 0.5, 0.5] as [number, number, number, number] } };
    expect(outroLength(zoomed)).toBe(ZOOM_OUT);
    expect(outroLength({ zoom: null })).toBe(OUTRO_FADE);
    expect(stepOutro(zoomed, 0)).toEqual({ zoom: 1, reveal: [1, 1, 1, 1] });
    expect(stepOutro(zoomed, ZOOM_OUT)).toEqual({ zoom: 0, reveal: [0, 0, 0, 0] });
    expect(stepOutro({ zoom: null }, OUTRO_FADE / 2).reveal[0]).toBeCloseTo(0.5, 6);
  });
});

describe('planGuide', () => {
  it('gives each step the motion leading into it, and the rest of the timeline as the outro', () => {
    const p = run(fresh(), pin('s1', 4), pin('s2', 9));
    const { guide, segments, stills } = planGuide(p);
    expect(guide.schema).toBe(GUIDE_SCHEMA);
    expect(guide.steps.map(s => s.id)).toEqual(['s1', 's2']);
    expect(guide.steps.map(s => s.segment)).toEqual([
      { file: 'seg/s1.mp4', duration: 4 },
      { file: 'seg/s2.mp4', duration: 5 },
    ]);
    expect(guide.outro).toEqual({ file: 'seg/outro.mp4', duration: 11 });
    expect(segments).toEqual([
      { file: 'seg/s1.mp4', from: 0, to: 4 },
      { file: 'seg/s2.mp4', from: 4, to: 9 },
      { file: 'seg/outro.mp4', from: 9, to: 20 },
    ]);
    expect(stills.map(s => [s.file, s.step.id])).toEqual([
      ['steps/s1.webp', 's1'],
      ['steps/s2.webp', 's2'],
    ]);
    expect(parseGuide(JSON.parse(JSON.stringify(guide)))).toEqual(guide);
  });

  it('a step on the first frame has no segment; one on the last frame leaves no outro', () => {
    const p = run(fresh(), pin('s1', 0), pin('s2', 20));
    const { guide, segments } = planGuide(p);
    expect(guide.steps[0]!.segment).toBeNull();
    expect(guide.steps[1]!.segment).toEqual({ file: 'seg/s2.mp4', duration: 20 });
    expect(guide.outro).toBeNull();
    expect(segments).toHaveLength(1);
  });

  it('follows the edit: segments are in timeline time, and steps cut off the timeline are left out', () => {
    /* 0–10 at 2× (5 s), then 10–20 at 1×; s2 at 15 s is 10 s into the timeline */
    let p = run(fresh(), pin('s1', 4), pin('s2', 15), clipCommands.splitClip('c_src1', 10, 'c2', 3), clipCommands.setClipSpeed('c_src1', 2, 4));
    let { guide } = planGuide(p);
    expect(guide.steps.map(s => s.segment?.duration)).toEqual([2, 8]);
    p = { ...p, steps: [...p.steps, { ...p.steps[0]!, id: 'gone', anchor: { source: 'src1', time: 25 } }] };
    ({ guide } = planGuide(p));
    expect(guide.steps.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('carries the player settings, framing and logo, and only a finished call to action', () => {
    let p = run(fresh(), pin('s1', 4));
    p = {
      ...p,
      assets: [{ id: 'img1', file: 'assets/img1.svg', name: 'logo.svg', type: 'image/svg+xml', size: [100, 40] }],
      logo: { asset: 'img1', corner: 'tl', size: 0.1, margin: 0.03, opacity: 0.9 },
      frame: { aspect: '16:9', padding: 0.05, background: { type: 'gradient', preset: 'reef' }, cornerRadius: 12, shadow: true },
      guide: { ...p.guide, mode: 'auto', accent: '#FFB020', cta: { label: 'Start', url: 'example.com', newTab: true, showAt: 'end' } },
    };
    let plan = planGuide(p, { pdf: true });
    expect(plan.guide.playback.mode).toBe('auto');
    expect(plan.guide.branding.accent).toBe('#FFB020');
    expect(plan.guide.logo).toEqual({ image: 'assets/logo.svg', corner: 'tl', size: 0.1, margin: 0.03, opacity: 0.9 });
    expect(plan.assets).toEqual([{ file: 'assets/logo.svg', asset: 'img1' }]);
    expect(plan.guide.size[0] / plan.guide.size[1]).toBeCloseTo(16 / 9, 2);
    expect(plan.guide.pdf).toBe('guide.pdf');
    expect(plan.guide.cta).toBeNull();

    p = { ...p, guide: { ...p.guide, cta: { label: ' Start ', url: 'https://example.com/go', newTab: false, showAt: 'nope' } } };
    plan = planGuide(p);
    expect(plan.guide.cta).toEqual({ label: 'Start', url: 'https://example.com/go', newTab: false, showAt: 'end' });
  });

  it('an image background whose file is gone falls back to none', () => {
    const p = { ...run(fresh(), pin('s1', 4)), frame: { aspect: 'source' as const, padding: 0.05, background: { type: 'image' as const, asset: 'missing' }, cornerRadius: 12, shadow: true } };
    const { guide } = planGuide(p);
    expect(guide.background).toBeNull();
    expect(guide.frame.background).toEqual({ type: 'none' });
  });
});

describe('guide helpers', () => {
  it('sizes the guide at most 1920 wide, in even pixels', () => {
    const big = { ...fresh(), sources: [{ ...source, size: [3841, 2161] as [number, number] }] };
    const [w, h] = guideSize(big);
    expect(w).toBe(1920);
    expect(h % 2).toBe(0);
    expect(guideSize(fresh())).toEqual([1280, 800]);
  });

  it('makes step ids safe and unique file names, never "outro"', () => {
    const ids = stepFileIds([{ id: 's_1' }, { id: 'outro' }, { id: '../x y' }, { id: '#x y' }]);
    expect([...ids.values()]).toEqual(['s_1', 'outro-2', '_x_y', '_x_y-2']);
  });

  it('refuses a guide.json that points outside its folder', () => {
    const { guide } = planGuide(run(fresh(), pin('s1', 4)));
    expect(() => parseGuide({ ...guide, poster: '../secret.webp' })).toThrow(/valid Waypost guide/);
    expect(() => parseGuide({ ...guide, poster: '/etc/x.webp' })).toThrow(/valid Waypost guide/);
  });

  it('picks text that reads on the accent', () => {
    expect(textOn('#D13A30')).toBe('#FFFFFF');
    expect(textOn('#FFB020')).toBe('#0E1116');
    expect(textOn('#FFFFFF')).toBe('#0E1116');
    expect(textOn('#0B7568')).toBe('#FFFFFF');
  });
});
