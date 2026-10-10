import { expect, test, type Locator, type Page } from '@playwright/test';
import { blurAlphaAt, blurRectAt, exportPlan, frameLayout, parseProject, planAt, tlToSrc, type Project } from '@waypost/core';
import { readFile } from 'node:fs/promises';
import { dragOnFrame, frameBox, openRecording, playheadSeconds, seekTo, waitForFrame, watchErrors, watchYellowEdge } from './helpers';

/** The Phase 2 acceptance tests (docs/04-roadmap.md, "Phase 2 — Edit and polish"; the checks in docs/05-editor-interactions.md,
    section 10). The fixture is 6 seconds long, 640 × 400, at 30 fps. */

const readout = (page: Page) => page.getByLabel('Playhead position and length');
const effectsLane = (page: Page) => page.getByTestId('effects-lane');
const clips = (page: Page) => page.locator('[data-clip]');
const bars = (page: Page) => effectsLane(page).locator('[data-blur]');
const addRegion = (page: Page) => page.getByRole('button', { name: 'Add an effect region at the playhead' });
const addEffect = (page: Page) => page.getByLabel('Add an effect', { exact: true });

/** The guide's length in seconds, from the readout. */
async function guideLength(page: Page): Promise<number> {
  const text = (await readout(page).innerText()).split('/')[1]!.trim();
  const [m, s] = text.split(':');
  return Number(m) * 60 + Number(s);
}

/** Takes focus out of a text field, so single-key shortcuts work again. */
async function leaveField(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Types a time or number into an Inspector field and commits it with Enter. */
async function typeInto(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill(value);
  await field.press('Enter');
}

/** The lane x position of a timeline time, measured on the ruler. */
async function timeX(page: Page, seconds: number, length: number): Promise<number> {
  const ruler = (await page.getByLabel('Ruler').boundingBox())!;
  return ruler.x + (ruler.width * seconds) / length;
}

/** Drags with the mouse from one point to another in small steps, optionally holding Alt. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, alt = false): Promise<void> {
  await page.mouse.move(from.x, from.y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

/** The middle of an element's left or right trim handle. */
async function edgeOf(el: Locator, side: 'l' | 'r'): Promise<{ x: number; y: number }> {
  const box = (await el.locator(`[data-edge=${side}]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function middleOf(el: Locator): Promise<{ x: number; y: number }> {
  const box = (await el.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The project as autosaved in the browser's private file system. */
async function savedProject(page: Page): Promise<Project> {
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const json = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const projects = await (await root.getDirectoryHandle('waypost')).getDirectoryHandle('projects');
    for await (const [, handle] of (projects as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }).entries()) {
      return (await (await handle.getFileHandle('project.json')).getFile()).text();
    }
    return null;
  });
  return parseProject(JSON.parse(json!));
}

/** A hash of a part of the canvas, to tell whether it changed. */
async function canvasHash(page: Page, rect: [number, number, number, number]): Promise<number> {
  return page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement, r) => {
    const data = c.getContext('2d')!.getImageData(Math.round(r[0] * c.width), Math.round(r[1] * c.height), Math.round(r[2] * c.width), Math.round(r[3] * c.height)).data;
    let h = 0;
    for (let i = 0; i < data.length; i += 4) h = (h * 31 + data[i]! * 7 + data[i + 1]! * 3 + data[i + 2]!) | 0;
    return h;
  }, rect);
}

test.describe('Phase 2: timeline editing', () => {
  test('split, trim with and without ripple, gaps and speed (checks 5, 6, 7 and 18)', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page);
    await seekTo(page, 4.5);
    await page.keyboard.press('Shift+P');

    await test.step('R splits the clip at the playhead; ⌘B does nothing', async () => {
      await seekTo(page, 3);
      await page.keyboard.press('Control+b');
      await expect(clips(page)).toHaveCount(1);
      await page.keyboard.press('r');
      await expect(clips(page)).toHaveCount(2);
      await expect(page.getByRole('heading', { name: 'Clip 2' })).toBeVisible();
    });

    await test.step('trimming the end of the last clip stops at the last pinned step; dragging back out restores it (check 5)', async () => {
      await drag(page, await edgeOf(clips(page).nth(1), 'r'), { x: await timeX(page, 3.5, 6), y: (await edgeOf(clips(page).nth(1), 'r')).y });
      await expect(page.getByRole('status').filter({ hasText: 'Move or delete the step to trim past it' })).toBeVisible();
      expect(await guideLength(page)).toBeCloseTo(4.5, 2);
      await drag(page, await edgeOf(clips(page).nth(1), 'r'), { x: await timeX(page, 6.5, 4.5), y: (await edgeOf(clips(page).nth(1), 'r')).y });
      expect(await guideLength(page)).toBeCloseTo(6, 2);
    });

    await test.step('with ripple on, trimming the end of clip 1 shortens the guide and moves the pin (check 6)', async () => {
      const edge = await edgeOf(clips(page).nth(0), 'r');
      await drag(page, edge, { x: await timeX(page, 2, 6), y: edge.y });
      expect(await guideLength(page)).toBeCloseTo(5, 1);
      await expect(page.getByLabel(/^Step 1, at 0:03\.[45]/)).toBeVisible();
      await page.keyboard.press('Control+z');
      expect(await guideLength(page)).toBeCloseTo(6, 2);
      await expect(page.getByLabel(/^Step 1, at 0:04\.50/)).toBeVisible();
    });

    await test.step('with ripple off, the guide length and the pin stay put and a gap appears (check 6)', async () => {
      await page.keyboard.press('Shift+R');
      await expect(page.getByRole('button', { name: 'Ripple trim' })).toHaveAttribute('aria-pressed', 'false');
      const edge = await edgeOf(clips(page).nth(0), 'r');
      await drag(page, edge, { x: await timeX(page, 2, 6), y: edge.y });
      expect(await guideLength(page)).toBeCloseTo(6, 2);
      await expect(page.getByLabel(/^Step 1, at 0:04\.50/)).toBeVisible();
      await expect(page.locator('[data-gap]')).toHaveCount(1);
    });

    await test.step("an edge can't grow past the gap it opened; closing the gap shortens the guide (check 7)", async () => {
      const edge = await edgeOf(clips(page).nth(0), 'r');
      await drag(page, edge, { x: await timeX(page, 4, 6), y: edge.y });
      await expect(page.locator('[data-gap]')).toHaveCount(0);
      await expect(page.getByLabel('Out', { exact: true })).toHaveValue('0:03.00');
      await page.keyboard.press('Control+z');
      await page.locator('[data-gap]').click();
      await expect(page.getByRole('heading', { name: 'Gap' })).toBeVisible();
      await page.getByRole('button', { name: 'Close gap' }).click();
      expect(await guideLength(page)).toBeLessThan(5.5);
      await expect(page.locator('[data-gap]')).toHaveCount(0);
    });

    await test.step('typed In and Out obey the same limits, and are refused with a message when they do not fit', async () => {
      await clips(page).nth(1).click({ position: { x: 30, y: 8 } });
      await typeInto(page.getByLabel('Out', { exact: true }), '4');
      await expect(page.getByRole('status').filter({ hasText: 'pinned step is in the way' })).toBeVisible();
      await expect(page.getByLabel('Out', { exact: true })).toHaveValue('0:06.00');
    });

    await test.step('a 2× clip plays in half the time and keeps its pins on their frames', async () => {
      const before = await guideLength(page);
      await page.getByRole('group', { name: 'Speed presets' }).getByRole('button', { name: '2×' }).click();
      expect(await guideLength(page)).toBeCloseTo(before - 1.5, 1);
      await expect(clips(page).nth(1)).toContainText('2×');
      await page.getByRole('button', { name: /^Step 1/ }).click();
      await expect.poll(() => playheadSeconds(page)).toBeCloseTo(before - 1.5 - 0.75, 1);
    });
    expect(errors).toEqual([]);
  });

  test('⇧L and ⇧J visit cuts, effect edges, pins and the ends (check 12)', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 3);
    await page.keyboard.press('r');
    await seekTo(page, 4);
    await addRegion(page).click();
    await leaveField(page);
    await seekTo(page, 0);
    const visited: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+L');
      visited.push(await playheadSeconds(page));
    }
    /* the end of the guide is where its last frame starts */
    expect(visited).toEqual([2, 3, 4, 5.967, 5.967]);
    await page.keyboard.press('Shift+J');
    expect(await playheadSeconds(page)).toBe(4);
  });
});

test.describe('Phase 2: effect regions', () => {
  test('many regions, unique names, a lane that scrolls and a canvas that keeps its size (check 21)', async ({ page }) => {
    await openRecording(page);
    const size = await page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    for (let i = 0; i < 12; i++) await addRegion(page).click();
    await expect(bars(page)).toHaveCount(12);
    const names = await bars(page).evaluateAll(els => els.map(e => e.getAttribute('aria-label')!.split(',')[0]));
    expect(new Set(names).size).toBe(12);
    const lane = await effectsLane(page).evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(lane.client).toBeLessThanOrEqual(4 * 26 + 6);
    expect(lane.scroll).toBeGreaterThan(lane.client);
    await expect(page.getByLabel('12 effects, scroll for more layers')).toBeVisible();
    expect(await page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual(size);
    await bars(page).first().click();
    await leaveField(page);
    await page.keyboard.press('Delete');
    await addRegion(page).click();
    const after = await bars(page).evaluateAll(els => els.map(e => e.getAttribute('aria-label')!.split(',')[0]));
    expect(after).toHaveLength(12);
    expect(new Set(after).size).toBe(12);
  });

  test('a stack of effects applies in list order, and every change shows at once and undoes (check 22)', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    const area: [number, number, number, number] = [0.15, 0.15, 0.3, 0.2];
    const bare = await canvasHash(page, area);
    await page.keyboard.press('x');
    await dragOnFrame(page, [0.1, 0.1], [0.5, 0.4]);
    await expect.poll(() => canvasHash(page, area)).not.toBe(bare);
    const hashes = [await canvasHash(page, area)];
    for (const type of ['tint', 'desaturate', 'solid', 'blur']) {
      await addEffect(page).selectOption(type);
      await expect(page.locator(`[data-effect=${type}]`)).toBeVisible();
    }
    await expect(page.locator('[data-effect]')).toHaveCount(5);
    hashes.push(await canvasHash(page, area));
    expect(hashes[1]).not.toBe(hashes[0]);
    await expect(bars(page).first()).toContainText('5 effects');

    const changes: Array<[string, () => Promise<void>]> = [
      /* the solid fill covers everything under it, so it goes off first */
      ['switch Solid fill off', () => page.locator('[data-effect=solid]').getByRole('checkbox').uncheck()],
      ['move Blur to the top', async () => {
        for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Move Blur up' }).click();
      }],
      ['change the tint colour', () => page.getByRole('group', { name: 'Tint colour' }).getByRole('button', { name: 'Lagoon' }).click()],
      ['change the tint strength', () => typeInto(page.locator('[data-effect=tint]').getByLabel('Strength', { exact: true }), '80')],
    ];
    for (const [what, change] of changes) {
      const before = await canvasHash(page, area);
      await change();
      await leaveField(page);
      await expect.poll(() => canvasHash(page, area), { message: what }).not.toBe(before);
    }
    await expect(page.locator('[data-effect]').first()).toHaveAttribute('data-effect', 'blur');
    /* undo each change, one step at a time: strength and colour, the four moves, the switch, then the four effects added */
    for (let i = 0; i < 2; i++) await page.keyboard.press('Control+z');
    await expect(page.locator('[data-effect]').first()).toHaveAttribute('data-effect', 'blur');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
    await expect(page.locator('[data-effect]').first()).toHaveAttribute('data-effect', 'pixelate');
    await page.keyboard.press('Control+z');
    await expect.poll(() => canvasHash(page, area)).toBe(hashes[1]);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
    await expect(page.locator('[data-effect]')).toHaveCount(1);
    await expect.poll(() => canvasHash(page, area)).toBe(hashes[0]);
  });

  test('layers: back, front and one at a time; no empty layers; no overlaps on a layer (check 23)', async ({ page }) => {
    await openRecording(page);
    for (let i = 0; i < 5; i++) await addRegion(page).click();
    const layerOf = async (name: string) => Number(/layer (\d+)/.exec((await bars(page).filter({ hasText: name }).getAttribute('aria-label'))!)![1]);
    const layers = async () => (await bars(page).evaluateAll(els => els.map(e => Number(/layer (\d+)/.exec(e.getAttribute('aria-label')!)![1])))).sort((a, b) => a - b);
    await bars(page).filter({ hasText: 'Blur 3' }).click();
    await page.getByRole('button', { name: 'Send to back' }).click();
    expect(await layerOf('Blur 3')).toBe(1);
    expect(await layers()).toEqual([1, 2, 3, 4, 5]);
    await page.getByRole('button', { name: 'Bring to front' }).click();
    expect(await layerOf('Blur 3')).toBe(5);
    await page.getByRole('button', { name: 'Send backward' }).click();
    expect(await layerOf('Blur 3')).toBe(4);
    expect(await layers()).toEqual([1, 2, 3, 4, 5]);

    /* two regions on one layer: a bar dragged into its neighbour stops at it */
    await bars(page).filter({ hasText: 'Blur 1' }).click();
    await typeInto(page.getByLabel('End', { exact: true }), '2');
    await seekTo(page, 3);
    await addRegion(page).click();
    expect(await layerOf('Blur 6')).toBe(1);
    const bar = bars(page).filter({ hasText: 'Blur 6' });
    const from = await middleOf(bar);
    await drag(page, from, { x: from.x - (await timeX(page, 2.5, 6)) + (await timeX(page, 0, 6)), y: from.y });
    await expect(page.getByLabel('Start', { exact: true })).toHaveValue('0:02.00');
    expect(await layerOf('Blur 6')).toBe(1);
  });

  test('bars: an edge trims one end, the body moves both, and edges snap to pins unless Alt is held (checks 2 and 3)', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 3);
    await addRegion(page).click();
    const bar = bars(page).first();
    await drag(page, await edgeOf(bar, 'l'), { x: await timeX(page, 3.6, 6), y: (await edgeOf(bar, 'l')).y }, true);
    await expect(page.getByLabel('End', { exact: true })).toHaveValue('0:06.00');
    const start = await page.getByLabel('Start', { exact: true }).inputValue();
    expect(start).not.toBe('0:03.00');
    /* snapping: the left edge dropped within 8 px of the pin lands on it exactly, with the amber line */
    const pinX = await timeX(page, 2, 6);
    const edge = await edgeOf(bar, 'l');
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(pinX + 5, edge.y, { steps: 8 });
    await expect(page.getByTestId('snap-line')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByLabel('Start', { exact: true })).toHaveValue('0:02.00');
    /* the body moves both ends by the same amount */
    const body = await middleOf(bar);
    await drag(page, body, { x: body.x - (await timeX(page, 1, 6)) + (await timeX(page, 0, 6)), y: body.y }, true);
    const s = await page.getByLabel('Start', { exact: true }).inputValue();
    const e = await page.getByLabel('End', { exact: true }).inputValue();
    expect(s).not.toBe('0:02.00');
    expect(e).not.toBe('0:06.00');
    const secs = (v: string) => Number(v.split(':')[0]) * 60 + Number(v.split(':')[1]);
    expect(secs(e) - secs(s)).toBeCloseTo(4, 1);
  });

  test('the lanes read Steps, Video, Effects, Voice, Music, and ⇧K walks down them (check 24)', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('Shift+P');
    for (let i = 0; i < 9; i++) await addRegion(page).click();
    const lanes = await page.getByRole('region', { name: 'Timeline' }).getByLabel(/ lane/).evaluateAll(els => els.map(e => e.getAttribute('aria-label')!.split(' lane')[0]));
    expect(lanes).toEqual(['Steps', 'Video', 'Effects', 'Voice', 'Music']);
    await page.getByRole('button', { name: /^Step 1/ }).click();
    await page.keyboard.press('Shift+K');
    await expect(page.getByRole('heading', { name: 'Clip 1' })).toBeVisible();
    await page.keyboard.press('Shift+K');
    await expect(page.getByRole('heading', { name: /^Blur \d/ })).toBeVisible();
    await page.keyboard.press('Shift+I');
    await expect(page.getByRole('heading', { name: 'Clip 1' })).toBeVisible();
  });

  test('a region keeps covering what it hides: moving it on another frame adds a keyframe', async ({ page }) => {
    await openRecording(page);
    await page.keyboard.press('x');
    await dragOnFrame(page, [0.1, 0.1], [0.3, 0.3]);
    await seekTo(page, 4);
    await dragOnFrame(page, [0.2, 0.2], [0.6, 0.6]);
    await expect(page.getByRole('status').filter({ hasText: 'Added a keyframe at 0:04.00' })).toBeVisible();
    await expect(page.getByText(/moves between 2 keyframes/)).toBeVisible();
    await page.getByRole('button', { name: 'Stop it moving' }).click();
    await expect(page.getByText(/moves between 2 keyframes/)).toBeHidden();
  });
});

test.describe('Phase 2: zoom, framing and logo', () => {
  test('a zoom box keeps the frame shape, owns its area, and the Viewer view eases into it (checks 8 and 9)', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('p');
    const frame = await frameBox(page);
    await page.mouse.click(frame.x + frame.width * 0.5, frame.y + frame.height * 0.5);
    await page.keyboard.press('z');
    await dragOnFrame(page, [0.3, 0.3], [0.75, 0.75]);
    await expect(page.getByRole('heading', { name: 'Zoom' })).toBeVisible();
    const box = page.getByTestId('zoom-box').locator('rect').first();
    const before = (await box.boundingBox())!;
    expect(before.width / before.height).toBeCloseTo(1.6, 1);

    /* check 9: dragging the right edge in shrinks it, keeps its left edge and its shape, and raises the amount */
    const amount = Number(await page.getByLabel('Amount', { exact: true }).inputValue());
    await drag(page, { x: before.x + before.width - 2, y: before.y + before.height / 2 }, { x: before.x + before.width * 0.75, y: before.y + before.height / 2 });
    const after = (await box.boundingBox())!;
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.width).toBeLessThan(before.width);
    expect(after.width / after.height).toBeCloseTo(1.6, 1);
    expect(Number(await page.getByLabel('Amount', { exact: true }).inputValue())).toBeGreaterThan(amount);

    /* check 8: dragging inside the selected box, over the click marker, moves the box and leaves the marker */
    await drag(page, { x: after.x + after.width / 2, y: after.y + after.height / 2 }, { x: after.x + after.width / 2 - 40, y: after.y + after.height / 2 - 20 });
    const moved = (await box.boundingBox())!;
    expect(moved.x).toBeLessThan(after.x - 20);
    await expect(page.getByRole('heading', { name: 'Zoom' })).toBeVisible();
    await page.getByRole('button', { name: /^Step 1/ }).click();
    await expect(page.getByRole('button', { name: 'Delete Click marker' })).toBeVisible();

    /* the Viewer view shows the step zoomed */
    const edit = await canvasHash(page, [0, 0, 1, 1]);
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Viewer' }).click();
    await expect.poll(() => canvasHash(page, [0, 0, 1, 1])).not.toBe(edit);
  });

  /** A zoomed step shown the Viewer's way, paused on its frame, with the zoom fully in. */
  async function zoomedViewerStep(page: Page): Promise<void> {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('p');
    const frame = await frameBox(page);
    await page.mouse.click(frame.x + frame.width * 0.5, frame.y + frame.height * 0.5);
    await page.keyboard.press('z');
    await dragOnFrame(page, [0.3, 0.3], [0.75, 0.75]);
    await expect(page.getByRole('heading', { name: 'Zoom' })).toBeVisible();
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Viewer' }).click();
    /* the entrance has finished once the yellow bar sits near the left edge (it is a third of the way across when not zoomed) */
    await expect.poll(async () => (await watchYellowEdge(page, 60)).at(-1)!, { timeout: 5000 }).toBeLessThan(0.12);
  }

  /** Readings during an exit must start zoomed in, end with the whole frame, pass through values in between, and never go back. */
  function expectEasedOut(edges: number[]): void {
    expect(edges.every(e => !Number.isNaN(e))).toBe(true);
    expect(edges[0]!).toBeLessThan(0.12);
    expect(edges.at(-1)!).toBeGreaterThan(0.31);
    expect(edges.filter(e => e > 0.14 && e < 0.29).length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < edges.length; i++) expect(edges[i]!).toBeGreaterThanOrEqual(edges[i - 1]! - 0.01);
  }

  test('switching from the Viewer back to Edit eases out of the zoom instead of cutting', async ({ page }) => {
    await zoomedViewerStep(page);
    const watching = watchYellowEdge(page, 900);
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Edit' }).click();
    expectEasedOut(await watching);
  });

  test('Play from a zoomed step eases out of the zoom as the recording carries on', async ({ page }) => {
    await zoomedViewerStep(page);
    /* the exit takes half a second; much longer and the fixture's moving streak reaches the row being read */
    const watching = watchYellowEdge(page, 800);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    expectEasedOut(await watching);
    expect(await playheadSeconds(page)).toBeGreaterThan(2.3);
  });

  test('moving the playhead somewhere else cuts at once: only leaving in place eases', async ({ page }) => {
    await zoomedViewerStep(page);
    const watching = watchYellowEdge(page, 400);
    await page.keyboard.press('ArrowRight');
    const edges = await watching;
    /* a step further along is not a zoomed step, so the very next readings are already the whole frame */
    expect(edges.slice(-5).every(e => e > 0.31)).toBe(true);
    expect(edges.filter(e => e > 0.14 && e < 0.29).length).toBeLessThanOrEqual(1);
  });

  test('framing changes the output; a logo is stored with the project and comes back after a reload', async ({ page }) => {
    await openRecording(page);
    await page.getByRole('tab', { name: 'Guide' }).click();
    await page.getByLabel('Shape').selectOption('16:9');
    await typeInto(page.getByLabel('Padding', { exact: true }), '10');
    await page.getByRole('group', { name: 'Background' }).getByRole('button', { name: 'Gradient' }).click();
    await page.getByRole('group', { name: 'Gradient' }).getByRole('button', { name: /Ember/ }).click();
    const size = await page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    expect(size[0]! / size[1]!).toBeCloseTo(16 / 9, 2);
    expect(size[0]).toBeGreaterThan(640);

    const corner: [number, number, number, number] = [0.82, 0.8, 0.1, 0.1];
    const plain = await canvasHash(page, corner);
    const logo = await page.evaluate(async () => {
      const c = new OffscreenCanvas(120, 60);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#00FF80';
      ctx.fillRect(0, 0, 120, 60);
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    });
    await page.locator('input[type=file][aria-label="Add a logo…"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo, 'base64') });
    await expect(page.getByText('logo.png in a corner of every frame')).toBeVisible();
    await expect.poll(() => canvasHash(page, corner)).not.toBe(plain);
    const withLogo = await canvasHash(page, corner);

    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.reload();
    await waitForFrame(page);
    await expect.poll(() => page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual(size);
    await expect.poll(() => canvasHash(page, corner)).toBe(withLogo);
  });
});

test.describe('Phase 2: MP4 export', () => {
  /** Where each region sits (normalised to the recording), and what its stack must leave there in every frame it covers. */
  const SPOTS = [
    { rect: [0.05, 0.05, 0.2, 0.15], effects: ['solid'], check: 'coral' },
    { rect: [0.55, 0.1, 0.2, 0.15], effects: ['desaturate'], check: 'grey' },
    { rect: [0.1, 0.55, 0.2, 0.15], effects: ['tint'], check: 'lagoon' },
    { rect: [0.3, 0.3, 0.15, 0.12], effects: ['desaturate', 'darken'], check: 'dark' },
  ] as const;

  test('cuts, a 2× section, 8 regions on 4 layers, a gradient and 10 steps export to an MP4 with the effects in every frame', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await openRecording(page);

    await test.step('8 effect regions: 4 at once on 4 layers, then 4 more on the same layers later', async () => {
      for (const [from, to] of [[0, 2.5], [3, 6]] as const) {
        await seekTo(page, from);
        for (const spot of SPOTS) {
          await page.keyboard.press('x');
          await dragOnFrame(page, [spot.rect[0], spot.rect[1]], [spot.rect[0] + spot.rect[2], spot.rect[1] + spot.rect[3]]);
          for (const type of spot.effects) await addEffect(page).selectOption(type);
          if (spot.check === 'coral') await page.getByRole('group', { name: 'Solid fill colour' }).getByRole('button', { name: 'Coral' }).click();
          if (spot.check === 'lagoon') {
            await page.getByRole('group', { name: 'Tint colour' }).getByRole('button', { name: 'Lagoon' }).click();
            await typeInto(page.locator('[data-effect=tint]').getByLabel('Strength', { exact: true }), '100');
          }
          if (spot.check === 'dark') await typeInto(page.locator('[data-effect=darken]').getByLabel('Amount', { exact: true }), '100');
          if (to < 6) await typeInto(page.getByLabel('End', { exact: true }), String(to));
          await leaveField(page);
        }
      }
      await expect(bars(page)).toHaveCount(8);
      await expect(effectsLane(page)).toHaveAttribute('aria-label', 'Effects lane, 4 layers');
      await expect(bars(page).filter({ hasText: '3 effects' })).toHaveCount(2);
    });

    await test.step('10 steps with a 1 s pause each', async () => {
      for (const t of [0.3, 0.8, 1.3, 2.2, 2.7, 3.2, 3.9, 4.6, 5.2, 5.7]) {
        await seekTo(page, t);
        await page.keyboard.press('Shift+P');
        await typeInto(page.getByLabel('Pause', { exact: true }), '1');
        await page.getByLabel('Title').fill(`Step at ${t}`);
        await leaveField(page);
      }
    });

    await test.step('cuts and a 2× section', async () => {
      await seekTo(page, 1.6);
      await page.keyboard.press('r');
      await seekTo(page, 4.2);
      await page.keyboard.press('r');
      await clips(page).nth(0).click({ position: { x: 20, y: 8 } });
      await typeInto(page.getByLabel('Out', { exact: true }), '1.5');
      await clips(page).nth(1).click({ position: { x: 20, y: 8 } });
      await page.getByRole('group', { name: 'Speed presets' }).getByRole('button', { name: '2×' }).click();
      await expect(clips(page)).toHaveCount(3);
    });

    await test.step('a gradient background', async () => {
      await page.getByRole('tab', { name: 'Guide' }).click();
      await typeInto(page.getByLabel('Padding', { exact: true }), '6');
      await page.getByRole('group', { name: 'Background' }).getByRole('button', { name: 'Gradient' }).click();
      await leaveField(page);
    });

    const project = await savedProject(page);
    expect(project.blurs).toHaveLength(8);
    expect(project.steps).toHaveLength(10);

    const file = await test.step('export the MP4', async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: 'MP4 video…' }).click();
      await page.getByRole('group', { name: 'Size' }).getByRole('button', { name: '720p' }).click();
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 200_000 }), page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click()]);
      expect(download.suggestedFilename()).toBe('demo.mp4');
      await expect(page.getByRole('status').filter({ hasText: /Exported a \d+ × 720 MP4/ })).toBeVisible();
      return readFile((await download.path())!);
    });

    await test.step('every frame has each region’s effects where and when the region is', async () => {
      const fps = 30;
      const plan = exportPlan(project);
      const total = Math.round(plan.duration * fps);
      const sample = await page.evaluate(
        async ({ b64, frames }) => {
          const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
          const video = document.createElement('video');
          video.muted = true;
          video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
          await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
          const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          const shots: Uint8ClampedArray[] = [];
          for (let i = 0; i < frames; i++) {
            const seeked = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
            video.currentTime = (i + 0.5) / 30;
            await seeked;
            ctx.drawImage(video, 0, 0);
            shots.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
          }
          (window as unknown as { __shots: Uint8ClampedArray[] }).__shots = shots;
          return { width: canvas.width, height: canvas.height, count: shots.length };
        },
        { b64: file.toString('base64'), frames: total },
      );
      expect(sample.height).toBe(720);
      const layout = frameLayout(project.frame, project.sources[0]!.size, [sample.width, sample.height]);

      /* for each frame and spot: the pixel average at the region's centre, and whether a region is there then */
      const checks: Array<{ frame: number; spot: number; x: number; y: number; covered: boolean }> = [];
      for (let i = 0; i < total; i++) {
        const now = planAt(plan, i / fps);
        const time = tlToSrc(project.timeline, now.timeline)!.time;
        for (const [s] of SPOTS.entries()) {
          const regions = project.blurs.filter(b => Math.abs(blurRectAt(b, time)[0] - SPOTS[s]!.rect[0]) < 0.02 && Math.abs(blurRectAt(b, time)[1] - SPOTS[s]!.rect[1]) < 0.02);
          /* frames right at a region's start or end could go either way */
          if (regions.some(b => Math.abs(time - b.start) < 0.05 || Math.abs(time - b.end) < 0.05)) continue;
          const covered = regions.some(b => blurAlphaAt(b, time) > 0);
          const r = SPOTS[s]!.rect;
          const [ix, iy, iw, ih] = layout.inner;
          checks.push({ frame: i, spot: s, x: Math.round(ix + (r[0] + r[2] / 2) * iw), y: Math.round(iy + (r[1] + r[3] / 2) * ih), covered });
        }
      }
      const colours = await page.evaluate(
        ({ checks, width }) => {
          const shots = (window as unknown as { __shots: Uint8ClampedArray[] }).__shots;
          return checks.map(c => {
            const d = shots[c.frame]!;
            let r = 0, g = 0, b = 0;
            for (let dy = -2; dy <= 2; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                const k = ((c.y + dy) * width + c.x + dx) * 4;
                r += d[k]!;
                g += d[k + 1]!;
                b += d[k + 2]!;
              }
            return [r / 25, g / 25, b / 25];
          });
        },
        { checks, width: sample.width },
      );
      const looks = {
        coral: ([r, g, b]: number[]) => r! > 200 && g! > 55 && g! < 130 && b! > 45 && b! < 120,
        grey: ([r, g, b]: number[]) => Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 30,
        lagoon: ([r, g, b]: number[]) => r! < 80 && g! > 140 && b! > 120,
        dark: ([r, g, b]: number[]) => Math.max(r!, g!, b!) < 60,
      };
      const wrong = checks
        .map((c, k) => ({ ...c, colour: colours[k]!.map(Math.round), shows: looks[SPOTS[c.spot]!.check](colours[k]!) }))
        .filter(c => c.shows !== c.covered);
      const summary = (list: typeof wrong) => [...new Set(list.map(c => `spot ${c.spot} ${c.covered ? 'missing' : 'unexpected'}`))].map(k => `${k}: ${list.filter(c => `spot ${c.spot} ${c.covered ? 'missing' : 'unexpected'}` === k).length} frames, e.g. ${JSON.stringify(list.find(c => `spot ${c.spot} ${c.covered ? 'missing' : 'unexpected'}` === k))}`);
      expect(summary(wrong)).toEqual([]);
      /* the check would have noticed: some frames show the recording there, untouched */
      expect(checks.filter(c => c.covered).length).toBeGreaterThan(total * 2);
      expect(checks.filter(c => !c.covered).length).toBeGreaterThan(20);
    });
    expect(errors).toEqual([]);
  });

  test("the recording's sound goes into the MP4, and can be left out", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles('e2e/fixtures/demo-sound.webm');
    await waitForFrame(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    const exportOnce = async (sound: boolean) => {
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: 'MP4 video…' }).click();
      await page.getByRole('group', { name: 'Size' }).getByRole('button', { name: '720p' }).click();
      const toggle = page.getByRole('switch', { name: "The recording's own sound" });
      if ((await toggle.getAttribute('aria-checked')) !== String(sound)) await toggle.click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click()]);
      return readFile((await download.path())!);
    };
    /* an audio track's sample entry names its codec: mp4a for AAC, Opus for Opus */
    const hasAudio = (file: Buffer) => file.includes('mp4a') || file.includes('Opus');
    expect(hasAudio(await exportOnce(true))).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: /and (AAC|Opus)\)/ })).toBeVisible();
    expect(hasAudio(await exportOnce(false))).toBe(false);
  });

  test('Cancel stops an export and leaves no file', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'MP4 video…' }).click();
    await page.getByRole('group', { name: 'Size' }).getByRole('button', { name: '4K' }).click();
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Export progress' })).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Export cancelled' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeHidden();
    expect(downloaded).toBe(false);
  });
});
