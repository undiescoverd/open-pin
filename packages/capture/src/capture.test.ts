import { describe, expect, it } from 'vitest';
import { CLICK_LEAD, parseEditorMessage, parseExtensionMessage, proposeSteps, recordedTabClicks, titleFor, type CapturedClick } from './index';

const click = (over: Partial<CapturedClick> & { t: number }): CapturedClick => ({ x: 0.5, y: 0.5, label: '', kind: 'button', tab: 1, title: 'App', ...over });
const START = 1_000_000;

describe('titles', () => {
  it('names a click after what was clicked', () => {
    expect(titleFor('button', 'Invite')).toBe('Click Invite');
    expect(titleFor('link', '  Sign   in \n now ')).toBe('Click Sign in now');
    expect(titleFor('field', 'Email')).toBe('Click the Email field');
  });
  it('gives no title when nothing readable was clicked, and cuts a long one', () => {
    expect(titleFor('other', '   ')).toBe('');
    const long = titleFor('button', 'x'.repeat(200));
    expect(long.length).toBeLessThanOrEqual('Click '.length + 60);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('proposing steps', () => {
  it('puts a step just before each click, in the right place, titled from its label', () => {
    const steps = proposeSteps({
      startedAt: START,
      duration: 20,
      clicks: [click({ t: START + 2000, x: 0.2, y: 0.3, label: 'Invite' }), click({ t: START + 5000, x: 0.8, y: 0.1, label: 'Email', kind: 'field' })],
    });
    expect(steps.map(s => s.title)).toEqual(['Click Invite', 'Click the Email field']);
    expect(steps[0]!.time).toBeCloseTo(2 - CLICK_LEAD, 5);
    expect(steps[0]!.at).toEqual([0.2, 0.3]);
    expect(steps[1]!.at).toEqual([0.8, 0.1]);
  });

  it('never goes before the start of the recording or past its end', () => {
    const steps = proposeSteps({ startedAt: START, duration: 3, clicks: [click({ t: START + 20 }), click({ t: START + 3200, x: 0.9 })] });
    expect(steps.map(s => s.time)).toEqual([0, 3]);
  });

  it('leaves out clicks from before the recording began and after it ended', () => {
    const steps = proposeSteps({ startedAt: START, duration: 10, clicks: [click({ t: START - 5000 }), click({ t: START + 4000 }), click({ t: START + 30000 })] });
    expect(steps).toHaveLength(1);
  });

  it('folds a double click and rapid repeats into one step', () => {
    const steps = proposeSteps({
      startedAt: START,
      duration: 20,
      clicks: [click({ t: START + 2000, label: 'Save' }), click({ t: START + 2250, label: 'Save' }), click({ t: START + 2500, label: 'Save' }), click({ t: START + 2900, x: 0.9, label: 'Other' })],
    });
    /* the 2.25 s click is under 0.3 s after the first; the 2.5 s click is a double click on the same spot (0.5 s later); 2.9 s is elsewhere */
    expect(steps.map(s => s.label)).toEqual(['Save', 'Other']);
  });

  it('keeps two clicks on the same spot that are far enough apart', () => {
    const steps = proposeSteps({ startedAt: START, duration: 20, clicks: [click({ t: START + 2000 }), click({ t: START + 4000 })] });
    expect(steps).toHaveLength(2);
  });

  it('is empty without clicks', () => {
    expect(proposeSteps({ startedAt: START, duration: 10, clicks: [] })).toEqual([]);
  });
});

describe('the recorded tab', () => {
  const app = (t: number, over: Partial<CapturedClick> = {}) => click({ t, tab: 7, title: 'Acme · Dashboard', ...over });
  const docs = (t: number) => click({ t, tab: 9, title: 'Help centre' });

  it('takes the tab whose title matches the shared tab', () => {
    const picked = recordedTabClicks([app(1), docs(2), docs(3), docs(4)], 'Acme · Dashboard');
    expect(new Set(picked.map(c => c.tab))).toEqual(new Set([7]));
  });

  it('otherwise takes the tab clicked in most', () => {
    const picked = recordedTabClicks([app(1), docs(2), docs(3)], undefined);
    expect(new Set(picked.map(c => c.tab))).toEqual(new Set([9]));
  });

  it('falls back to the busiest tab when the name matches more than one tab', () => {
    const picked = recordedTabClicks([app(1), app(2), click({ t: 3, tab: 8, title: 'Acme · Dashboard' })], 'Acme · Dashboard');
    expect(new Set(picked.map(c => c.tab))).toEqual(new Set([7]));
  });
});

describe('messages', () => {
  it('accepts what the editor and extension send, and nothing else', () => {
    expect(parseEditorMessage({ source: 'waypost-editor', type: 'start' })).toEqual({ source: 'waypost-editor', type: 'start' });
    expect(parseEditorMessage({ source: 'someone-else', type: 'start' })).toBeNull();
    expect(parseEditorMessage({ source: 'waypost-editor', type: 'format-disk' })).toBeNull();
    expect(parseEditorMessage('start')).toBeNull();
    expect(parseExtensionMessage({ source: 'waypost-extension', type: 'hello', version: 1 })).not.toBeNull();
    expect(parseExtensionMessage({ source: 'waypost-extension', type: 'stopped', clicks: [{ t: 1, x: 0.1, y: 0.1, label: 'a', kind: 'link', tab: 3 }] })).toBeNull();
  });

  it('tidies the clicks it is given: positions clamped, labels cut', () => {
    const message = parseExtensionMessage({
      source: 'waypost-extension',
      type: 'stopped',
      clicks: [{ t: 5, x: 1.7, y: -0.2, label: 'y'.repeat(500), kind: 'link', tab: 3, title: 'T' }],
    });
    expect(message?.type).toBe('stopped');
    if (message?.type !== 'stopped') return;
    expect(message.clicks[0]!.x).toBe(1);
    expect(message.clicks[0]!.y).toBe(0);
    expect(message.clicks[0]!.label).toHaveLength(80);
  });
});
