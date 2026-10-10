import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseGuide, parseProject, type Guide, type Project } from '@waypost/core';
import react from '@vitejs/plugin-react';
import { unzipSync } from 'fflate';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { clickFrame, openRecording, seekTo, stepCards, watchErrors } from './helpers';
import { serveStatic, type StaticHost } from './static-server';

/** The Phase 3 acceptance tests (docs/04-roadmap.md, "Phase 3 — Interactive guide"): the player settings, the in-editor preview,
    and an exported guide folder on a static host, played standalone, with the two-line embed in a plain page, and inside a React
    app. The fixture is 6 seconds long, 640 × 400, at 30 fps. Only Chromium runs here; see the roadmap for Safari and Firefox. */

const here = dirname(fileURLToPath(import.meta.url));

/** Pins a step with the Pin tool, which also drops a click marker where it clicks, and gives it a title. */
async function pin(page: Page, seconds: number, at: [number, number], title: string): Promise<void> {
  await seekTo(page, seconds);
  await page.keyboard.press('p');
  await clickFrame(page, at[0], at[1]);
  await page.keyboard.press('v');
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Three steps (1 s, 2.5 s and 4 s, so each has motion before it and the guide has an outro), a callout on the first and a zoom on
    the second. */
async function makeGuide(page: Page): Promise<void> {
  await openRecording(page);
  await pin(page, 1, [0.3, 0.3], 'Open the menu');
  await page.keyboard.press('c');
  await clickFrame(page, 0.6, 0.6);
  await page.getByRole('textbox', { name: 'Text' }).fill('Start here');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await pin(page, 2.5, [0.5, 0.5], 'Pick a colour');
  await page.getByRole('button', { name: 'Zoom in on this step' }).click();
  await pin(page, 4, [0.7, 0.4], 'Save it');
  await expect(stepCards(page)).toHaveCount(3);
}

async function openGuideTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Guide' }).click();
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

/** Playwright's locators reach into open shadow roots, so the player's parts are found from its host. */
const player = (root: Locator) => ({
  root: root.locator('.wp'),
  start: root.getByRole('button', { name: 'Start guide' }),
  next: root.locator('[data-act=next]'),
  prev: root.getByRole('button', { name: 'Previous step' }),
  caption: root.locator('.wp-caption'),
  counter: root.locator('.wp-counter'),
  live: root.locator('.wp-sr'),
  end: root.locator('[data-part=end]'),
  canvas: root.locator('canvas'),
});

/** Waits until the player shows a state: `start`, `end`, or `step-2`, `segment-1`… */
async function expectState(root: Locator, state: string, timeout = 15_000): Promise<void> {
  await expect(root.locator('.wp')).toHaveAttribute('data-state', state, { timeout });
}

/** The colour of a canvas pixel, at fractions of its size. */
async function pixel(canvas: Locator, fx: number, fy: number): Promise<[number, number, number]> {
  return canvas.evaluate((c: HTMLCanvasElement, [x, y]) => {
    const d = c.getContext('2d')!.getImageData(Math.round(x! * c.width), Math.round(y! * c.height), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!] as [number, number, number];
  }, [fx, fy]);
}

const isCoral = ([r, g, b]: [number, number, number]) => r > 200 && g < 140 && b < 130;

test.describe('Phase 3: player settings and preview', () => {
  test('the Guide tab sets the playback mode, accent, controls and call to action, each one undoable', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page);
    await openGuideTab(page);
    await page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Auto' }).click();
    await page.getByRole('button', { name: 'Marigold' }).click();
    await page.getByRole('switch', { name: 'Step counter' }).click();
    await page.getByRole('switch', { name: 'Show a button' }).click();
    await page.getByRole('textbox', { name: 'Button text' }).fill('Start free trial');
    await page.getByRole('textbox', { name: 'Link' }).fill('example.com/signup');
    await expect(page.getByText('Start the address with https://')).toBeVisible();
    await page.getByRole('textbox', { name: 'Link' }).fill('https://example.com/signup');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const saved = await savedProject(page);
    expect(saved.guide).toMatchObject({ mode: 'auto', accent: '#FFB020', controls: { counter: false, progress: true, fullscreen: true } });
    expect(saved.guide.cta).toEqual({ label: 'Start free trial', url: 'https://example.com/signup', newTab: true, showAt: 'end' });

    /* typing in a field is one undo step until the field loses focus */
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('textbox', { name: 'Link' })).toHaveValue('');
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('textbox', { name: 'Button text' })).toHaveValue('Try it yourself');
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('switch', { name: 'Show a button' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Step counter' })).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('switch', { name: 'Step counter' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('button', { name: 'Coral' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Guided' })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('Preview plays the guide in the real player: start card, motion, steps with annotations, keys, end card', async ({ page }) => {
    const errors = watchErrors(page);
    await makeGuide(page);
    await page.keyboard.press('Control+Enter');
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    await expect(dialog).toBeVisible();
    const p = player(dialog.getByTestId('preview-player'));

    await test.step('the start card names the guide and its length', async () => {
      await expect(p.start).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'demo' })).toBeVisible();
      await expect(dialog.getByText(/^3 steps · about \d+ seconds$/)).toBeVisible();
      await expect(p.counter).toHaveText('0 / 3');
    });

    await test.step('Start plays the motion into step 1, then shows the step with its click marker, and says so', async () => {
      await p.start.click();
      await expectState(dialog, 'step-1');
      await expect(p.caption).toHaveText('1. Open the menu');
      await expect(p.counter).toHaveText('1 / 3');
      await expect(p.live).toHaveText('Step 1 of 3: Open the menu. Start here');
      await expect.poll(() => pixel(p.canvas, 0.3, 0.3).then(isCoral)).toBe(true);
      await expect(dialog.getByText('Click anywhere to continue')).toBeVisible();
    });

    await test.step('→ leaves the step and plays on to step 2; ← goes back without motion', async () => {
      await p.root.press('ArrowRight');
      await expectState(dialog, 'step-2');
      await expect(dialog.getByText('Click anywhere to continue')).toBeHidden();
      await p.root.press('ArrowLeft');
      await expectState(dialog, 'step-1', 2000);
    });

    await test.step('a step marker on the progress bar jumps straight to its step; Finish ends on the end card', async () => {
      await dialog.getByRole('button', { name: 'Go to step 3 of 3: Save it' }).click();
      await expectState(dialog, 'step-3', 2000);
      await expect(p.next).toHaveText('Finish');
      await p.next.click();
      await expectState(dialog, 'end');
      await expect(p.end).toContainText("That's the whole guide");
      await expect(dialog.getByRole('button', { name: 'Replay' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Replay' }).click();
      await expectState(dialog, 'step-1');
    });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('Auto moves on by itself and can be paused; Video marks the steps on its progress bar in time', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await makeGuide(page);
    await openGuideTab(page);
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    const p = player(dialog.getByTestId('preview-player'));

    await test.step('Auto: each step stays for its pause, then the guide carries on; Pause holds it', async () => {
      await page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Auto' }).click();
      await page.keyboard.press('Control+Enter');
      await p.start.click();
      await expectState(dialog, 'step-1');
      await expectState(dialog, 'step-2', 10_000);
      await dialog.getByRole('button', { name: 'Pause' }).click();
      await page.waitForTimeout(3500);
      await expectState(dialog, 'step-2', 100);
      await dialog.getByRole('button', { name: 'Play' }).click();
      await expectState(dialog, 'step-3', 10_000);
      await page.keyboard.press('Escape');
    });

    await test.step('Video: the bar fills in time, with each step marked where it comes', async () => {
      await page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Video' }).click();
      await page.keyboard.press('Control+Enter');
      /* 1 s of motion, then 2.5 s on each step, 1.5 s between steps and a 2 s outro: step 1 is at 1 s of 13.5 */
      const first = await dialog.getByRole('button', { name: /^Go to step 1/ }).evaluate(el => parseFloat((el as HTMLElement).style.left));
      expect(first).toBeCloseTo((1 / 13.5) * 100, 0);
      await p.start.click();
      await expectState(dialog, 'step-1');
      const fill = () => dialog.locator('.wp-fill').evaluate(el => parseFloat((el as HTMLElement).style.width));
      const a = await fill();
      await page.waitForTimeout(800);
      expect(await fill()).toBeGreaterThan(a);
      await page.keyboard.press('Escape');
    });
    expect(errors).toEqual([]);
  });
});

test.describe('Phase 3: the published guide', () => {
  let dir = '';
  let host: StaticHost;
  let guide: Guide;
  let slug = '';

  test.beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waypost-guide-'));
  });
  test.afterAll(async () => {
    await host?.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('exported as a folder, the guide plays on a static host: standalone, embedded in a plain page, and in a React app', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await makeGuide(page);

    await test.step('a call to action, and the address the folder will live at', async () => {
      await openGuideTab(page);
      await page.getByRole('switch', { name: 'Show a button' }).click();
      await page.getByRole('textbox', { name: 'Button text' }).fill('Start free trial');
      await page.getByRole('textbox', { name: 'Link' }).fill('https://example.com/signup');
    });

    const zip = await test.step('Share › Export guide as a zip, with an A4 PDF copy', async () => {
      await page.getByRole('button', { name: 'Share' }).click();
      const share = page.getByRole('dialog', { name: 'Share guide' });
      await share.getByRole('textbox', { name: 'Guide address' }).fill('https://me.github.io/guides/demo');
      await expect(share.getByRole('textbox', { name: 'Embed code' })).toHaveValue(
        '<div data-waypost="https://me.github.io/guides/demo/guide.json"></div>\n<script src="https://me.github.io/guides/demo/player.js" async></script>',
      );
      await share.getByRole('button', { name: 'Zip file' }).click();
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), share.getByRole('button', { name: 'Export guide' }).click()]);
      expect(download.suggestedFilename()).toBe('demo.zip');
      await expect(page.getByRole('status').filter({ hasText: /Exported the guide \(3 steps\) as demo\.zip/ })).toBeVisible();
      return readFile((await download.path())!);
    });

    await test.step('the folder holds the page, the player, guide.json, the PDF, fonts and media for every step', async () => {
      const files = unzipSync(new Uint8Array(zip));
      for (const [name, data] of Object.entries(files)) {
        await mkdir(dirname(join(dir, name)), { recursive: true });
        await writeFile(join(dir, name), data);
      }
      slug = 'demo';
      guide = parseGuide(JSON.parse(new TextDecoder().decode(files[`${slug}/guide.json`])));
      const names = Object.keys(files).sort();
      const media = [...guide.steps.flatMap(s => [s.still, s.segment?.file]), guide.outro?.file, guide.poster].filter(Boolean).map(f => `${slug}/${f}`);
      expect(names).toEqual(
        [...media, ...['index.html', 'player.js', 'guide.json', 'guide.pdf', 'embed.txt', 'fonts/figtree-400.woff2', 'fonts/figtree-600.woff2'].map(f => `${slug}/${f}`)].sort(),
      );
      expect(guide.steps.map(s => s.title)).toEqual(['Open the menu', 'Pick a colour', 'Save it']);
      expect(guide.steps.every(s => s.segment)).toBe(true);
      expect(guide.outro?.duration).toBeCloseTo(2, 2);
      expect(guide.steps[1]!.zoom).not.toBeNull();
      expect(guide.cta).toEqual({ label: 'Start free trial', url: 'https://example.com/signup', newTab: true, showAt: 'end' });
      expect(new TextDecoder().decode(files[`${slug}/embed.txt`])).toContain('<script src="https://me.github.io/guides/demo/player.js" async></script>');
      /* the size budget (docs/02-architecture.md): under 60 KB gzipped, renderer included */
      expect(gzipSync(files[`${slug}/player.js`]!).length).toBeLessThan(60 * 1024);
    });

    host = await serveStatic(dir, {
      '/plain.html': `<!doctype html><html><head><meta charset="utf-8"><title>Help centre</title>
<style>button{display:none!important}canvas{display:none!important}*{font-family:serif!important}</style></head>
<body><h1>How to connect your calendar</h1><p>Follow along:</p>
<div data-waypost="/${slug}/guide.json"></div>
<script src="/${slug}/player.js" async></script></body></html>`,
    });

    await test.step('the standalone page plays the guide from start to end card, motion and all', async () => {
      await page.goto(`${host.url}/${slug}/`);
      const root = page.locator('[data-waypost]');
      const p = player(root);
      await expect(page).toHaveTitle('demo');
      await expect(p.start).toBeVisible();
      await expect(page.getByRole('link', { name: 'Download the guide as a PDF' })).toHaveAttribute('href', 'guide.pdf');
      await p.start.click();
      await expectState(root, 'step-1');
      /* the motion really played from its file: a video element has played for most of the second before step 1 */
      const played = await root.locator('video').evaluateAll(vs => Math.max(...vs.map(v => ((v as HTMLVideoElement).played.length ? (v as HTMLVideoElement).played.end(0) : 0))));
      expect(played).toBeGreaterThan(0.8);
      await expect.poll(() => pixel(p.canvas, 0.3, 0.3).then(isCoral)).toBe(true);
      await expect(p.live).toHaveText('Step 1 of 3: Open the menu. Start here');
      await p.root.focus();
      await page.keyboard.press('Space');
      await expectState(root, 'step-2');
      await page.keyboard.press('ArrowRight');
      await expectState(root, 'step-3');
      await p.next.click();
      await expectState(root, 'end');
      const cta = root.getByRole('link', { name: 'Start free trial' });
      await expect(cta).toHaveAttribute('href', 'https://example.com/signup');
      await expect(cta).toHaveAttribute('target', '_blank');
      for (const file of guide.steps.map(s => s.segment!.file).concat(guide.outro!.file)) expect(host.requests).toContain(`/${slug}/${file}`);
    });

    await test.step('with the two-line embed in a plain page, the page’s own CSS can’t touch it', async () => {
      await page.goto(`${host.url}/plain.html`);
      const root = page.locator('[data-waypost]');
      const p = player(root);
      await expect(p.start).toBeVisible();
      await expect(p.canvas).toBeVisible();
      const font = await p.caption.evaluate(el => getComputedStyle(el).fontFamily);
      expect(font).toContain('Figtree');
      await p.start.click();
      await expectState(root, 'step-1');
      await expect(p.caption).toHaveText('1. Open the menu');
    });

    await test.step('on a phone-sized screen with reduced motion, taps carry it through and nothing overflows', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const phone = await context.newPage();
      const phoneErrors = watchErrors(phone);
      await phone.goto(`${host.url}/${slug}/`);
      const root = phone.locator('[data-waypost]');
      const p = player(root);
      await expect(p.caption).toHaveText('Press Start to begin.');
      await p.start.tap();
      await expectState(root, 'step-1');
      await expect(root.getByText('Tap anywhere to continue')).toBeVisible();
      await root.locator('.wp-stage').tap();
      await expectState(root, 'step-2');
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      expect(phoneErrors).toEqual([]);
      await context.close();
    });

    await test.step('inside a React app: mounts when the guide’s page opens, survives re-renders, stops when it closes', async () => {
      const out = join(dir, 'react');
      await build({ root: join(here, 'fixtures/react-host'), configFile: false, logLevel: 'silent', base: '/react/', plugins: [react()], build: { outDir: out, emptyOutDir: true } });
      const app = await browser.newPage();
      const appErrors = watchErrors(app);
      await app.goto(`${host.url}/react/?guide=/${slug}/guide.json&player=/${slug}/player.js`);
      await app.getByRole('button', { name: 'Guide' }).click();
      const root = app.locator('[data-waypost]');
      const p = player(root);
      await expect(p.start).toBeVisible();
      await p.start.click();
      await expectState(root, 'step-1');
      await app.getByRole('button', { name: /Re-render/ }).click();
      await expect(app.getByRole('button', { name: 'Re-render 1' })).toBeVisible();
      await expectState(root, 'step-1', 1000);
      await app.getByRole('button', { name: 'Home' }).click();
      await expect(root).toHaveCount(0);
      await app.getByRole('button', { name: 'Guide' }).click();
      await expect(player(app.locator('[data-waypost]')).start).toBeVisible();
      expect(appErrors).toEqual([]);
      await app.close();
    });

    expect(errors).toEqual([]);
  });
});
