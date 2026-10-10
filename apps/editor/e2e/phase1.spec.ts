import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { FIXTURE, clickFrame, dragOnFrame, frameBox, openRecording, playheadSeconds, seekTo, stepCards, stepRail, waitForFrame, watchErrors } from './helpers';

/** The Phase 1 acceptance test (docs/04-roadmap.md): drop in a recording, pin 5 steps, annotate them, reload without losing
    anything, and export a PDF and PNGs that match the canvas. */

const STEP_TIMES = [0.5, 1.5, 3, 4.5, 5.5];

async function pinAt(page: Page, seconds: number, at: [number, number]): Promise<void> {
  await seekTo(page, seconds);
  await page.keyboard.press('p');
  await clickFrame(page, at[0], at[1]);
  await page.keyboard.press('v');
}

test.describe('Phase 1: pin, annotate, export stills', () => {
  test('drop in a recording, pin 5 steps, annotate, reload, export a PDF and PNGs that match the canvas', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page);

    await test.step('the recording is open: timeline, canvas and name', async () => {
      await expect(page.getByLabel('Playhead position and length')).toHaveText('0:00.000 / 0:06.000');
      await expect(page.getByRole('textbox', { name: 'Guide name' })).toHaveValue('demo');
      await expect(page.getByLabel('Video lane')).toContainText('Clip 1');
      const size = await page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
      expect(size).toEqual([640, 400]);
    });

    await test.step('pin five steps with the Pin tool', async () => {
      const spots: Array<[number, number]> = [[0.2, 0.3], [0.5, 0.25], [0.75, 0.4], [0.3, 0.7], [0.6, 0.8]];
      for (const [i, t] of STEP_TIMES.entries()) await pinAt(page, t, spots[i]!);
      await expect(stepCards(page)).toHaveCount(5);
      await expect(page.getByLabel(/^Step 3, at/)).toBeVisible();
      await expect(stepRail(page).getByRole('heading', { name: /Steps/ })).toContainText('5');
    });

    await test.step('title the steps in the Inspector', async () => {
      for (const [i, title] of ['Open the menu', 'Pick a colour', 'Resize the window', 'Save it', 'All done'].entries()) {
        await stepCards(page).nth(i).getByRole('button').click();
        await page.getByRole('textbox', { name: 'Title' }).fill(title);
      }
      await expect(stepCards(page).nth(2)).toContainText('Resize the window');
    });

    await test.step('annotate step 1 with a callout, an arrow, a box and a spotlight', async () => {
      await stepCards(page).nth(0).getByRole('button').click();
      await page.keyboard.press('c');
      await clickFrame(page, 0.35, 0.55);
      await page.getByRole('textbox', { name: 'Text' }).fill('Start here');
      await page.keyboard.press('Escape'); /* leaves the text field... */
      await page.getByTestId('annotation-overlay').click({ position: { x: 2, y: 2 } }); /* ...and a click on empty frame selects the step */
      await page.keyboard.press('a');
      await dragOnFrame(page, [0.5, 0.2], [0.25, 0.32]);
      await page.keyboard.press('b');
      await dragOnFrame(page, [0.55, 0.45], [0.8, 0.7]);
      await page.keyboard.press('s');
      await dragOnFrame(page, [0.05, 0.75], [0.3, 0.95]);
      await expect(page.getByRole('heading', { name: 'Spotlight' })).toBeVisible();
    });

    await test.step('annotation changes show on the canvas and in the step card', async () => {
      await stepCards(page).nth(0).getByRole('button').click();
      await expect(page.getByRole('button', { name: /Delete Callout “Start here”/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete Spotlight' })).toBeVisible();
      await page.getByTestId('annotation-overlay').click({ position: { x: 630, y: 5 } }); /* deselect, so no handles are in the way */
      await expect(page.getByTestId('frame-canvas')).toHaveScreenshot('step-1-annotated.png', { maxDiffPixelRatio: 0.002 });
    });

    await test.step('reload: nothing is lost', async () => {
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
      await waitForFrame(page);
      await expect(stepCards(page)).toHaveCount(5);
      await expect(stepCards(page).nth(0)).toContainText('Open the menu');
      await expect(page.getByRole('textbox', { name: 'Guide name' })).toHaveValue('demo');
      await stepCards(page).nth(0).getByRole('button').click();
      await expect(page.getByRole('heading', { name: 'Step 1' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Delete Callout “Start here”/ })).toBeVisible();
      await waitForFrame(page);
      await expect(page.getByTestId('frame-canvas')).toHaveScreenshot('step-1-annotated.png', { maxDiffPixelRatio: 0.002 });
    });

    await test.step('PNG export matches the canvas pixel for pixel', async () => {
      await stepCards(page).nth(0).getByRole('button').click();
      await expect.poll(() => playheadSeconds(page)).toBeCloseTo(0.5, 2);
      await waitForFrame(page);
      await page.getByRole('button', { name: 'Export' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG images (zip)' }).click()]);
      expect(download.suggestedFilename()).toBe('demo screenshots.zip');
      const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
      expect(Object.keys(files).sort()).toEqual([
        '01-open-the-menu.png',
        '02-pick-a-colour.png',
        '03-resize-the-window.png',
        '04-save-it.png',
        '05-all-done.png',
      ]);
      const png = Buffer.from(files['01-open-the-menu.png']!).toString('base64');
      const differing = await page.evaluate(async b64 => {
        const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const copy = new OffscreenCanvas(bitmap.width, bitmap.height);
        const cctx = copy.getContext('2d')!;
        cctx.drawImage(bitmap, 0, 0);
        const exported = cctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid=frame-canvas]')!;
        const shown = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) return -1;
        let n = 0;
        for (let i = 0; i < exported.length; i += 4) {
          if (Math.abs(exported[i]! - shown[i]!) + Math.abs(exported[i + 1]! - shown[i + 1]!) + Math.abs(exported[i + 2]! - shown[i + 2]!) > 6) n++;
        }
        return n;
      }, png);
      expect(differing).toBe(0);
    });

    await test.step('WebP export zips the same steps', async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'WebP images (zip)' }).click()]);
      const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
      expect(Object.keys(files)).toHaveLength(5);
      expect(Object.keys(files).every(name => name.endsWith('.webp'))).toBe(true);
    });

    await test.step('PDF export has a page per step at the chosen size', async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PDF · A4' }).click()]);
      expect(download.suggestedFilename()).toBe('demo (A4).pdf');
      const pdf = await PDFDocument.load(await readFile((await download.path())!));
      expect(pdf.getPageCount()).toBe(5);
      expect(pdf.getTitle()).toBe('demo');
      const { width, height } = pdf.getPage(0).getSize();
      expect(Math.round(width)).toBe(595);
      expect(Math.round(height)).toBe(842);
      /* the frame is embedded as an image on every page */
      for (const page of pdf.getPages()) {
        const xobjects = page.node.Resources()?.lookup(await import('pdf-lib').then(m => m.PDFName.of('XObject')));
        expect(xobjects).toBeDefined();
      }
    });

    const slide = await test.step('PDF export in 16:9 and Letter', async () => {
      for (const [item, w, h] of [['PDF · Letter', 612, 792], ['PDF · 16:9 slides', 960, 540]] as const) {
        await page.getByRole('button', { name: 'Export' }).click();
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
        const pdf = await PDFDocument.load(await readFile((await download.path())!));
        expect(pdf.getPageCount()).toBe(5);
        expect([Math.round(pdf.getPage(0).getWidth()), Math.round(pdf.getPage(0).getHeight())]).toEqual([w, h]);
      }
    });
    void slide;

    expect(errors).toEqual([]);
  });

  test('the export menu says what to do when nothing is pinned', async ({ page }) => {
    await openRecording(page);
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'PNG images (zip)' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pin at least one step' })).toBeVisible();
  });
});

test.describe('opening files', () => {
  test('a file that is not a video is refused with a message', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText(/doesn't look like a video/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drop a screen recording' })).toBeVisible();
  });

  test('a broken video is refused with a message and nothing is saved', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video at all') });
    await expect(page.getByRole('status').filter({ hasText: /./ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drop a screen recording' })).toBeVisible();
    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(page.getByText('No projects yet')).toBeVisible();
  });

  for (const name of ['demo.mp4', 'demo.mkv']) {
    test(`opens a recording in a ${name.split('.')[1]!.toUpperCase()} container`, async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('file-input').setInputFiles(`e2e/fixtures/${name}`);
      await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
      await waitForFrame(page);
      await expect(page.getByLabel('Playhead position and length')).toHaveText('0:00.000 / 0:06.000');
      await expect(page.getByRole('textbox', { name: 'Guide name' })).toHaveValue('demo');
    });
  }

  test('the fixture matches what the tests assume', async () => {
    expect((await readFile(FIXTURE)).length).toBeGreaterThan(1000);
  });
});

test.describe('copying and saving a frame', () => {
  test('Save frame downloads the frame with its annotations, and Copy frame puts a PNG on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('p');
    await clickFrame(page, 0.5, 0.5);

    await page.getByRole('button', { name: 'Export' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Save frame as PNG' }).click()]);
    expect(download.suggestedFilename()).toBe('demo 0-02.00.png');
    const header = (await readFile((await download.path())!)).subarray(0, 8);
    expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Copy frame' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied the frame' })).toBeVisible();
    const type = await page.evaluate(async () => (await navigator.clipboard.read())[0]!.types.join(','));
    expect(type).toContain('image/png');
  });
});

test.describe('the frame and the Pin tool', () => {
  test('the Pin tool pins the current frame and drops a click marker; pinning the same frame again moves the marker', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('p');
    await clickFrame(page, 0.25, 0.25);
    await expect(stepCards(page)).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Step 1' })).toBeVisible();
    await page.keyboard.press('p');
    await clickFrame(page, 0.75, 0.75);
    await expect(stepCards(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Click marker', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toHaveValue('480'); /* 0.75 of 640 px */
  });

  test('Pin step and Shift+P pin the frame with no marker, and pinning twice does not duplicate', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.getByRole('button', { name: 'Pin step' }).click();
    await page.keyboard.press('Shift+P');
    await expect(stepCards(page)).toHaveCount(1);
    await expect(page.getByText('None yet')).toBeVisible();
  });

  test('drawing tools need a pinned frame first', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('b');
    await dragOnFrame(page, [0.2, 0.2], [0.5, 0.5]);
    await expect(page.getByRole('status').filter({ hasText: 'Pin this frame first' })).toBeVisible();
    await expect(stepCards(page)).toHaveCount(0);
  });

  test('annotations can be moved and resized with the Select tool, and each drag is one undo step', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('Shift+P');
    await page.keyboard.press('b');
    await dragOnFrame(page, [0.2, 0.2], [0.4, 0.4]);
    const x = page.getByRole('spinbutton', { name: 'X' });
    const width = page.getByRole('spinbutton', { name: 'Width' });
    await expect(x).toHaveValue('128');
    await expect(width).toHaveValue('128');

    /* drag the box's body to the right */
    await dragOnFrame(page, [0.3, 0.3], [0.5, 0.3]);
    await expect(x).toHaveValue('256');
    /* drag its east handle: 0.6 is the right edge now */
    await dragOnFrame(page, [0.6, 0.3], [0.7, 0.3]);
    await expect(width).toHaveValue('192');

    await page.keyboard.press('ControlOrMeta+Z');
    await expect(width).toHaveValue('128');
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(x).toHaveValue('128');
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(x).toHaveValue('256');
  });

  test('a click on empty frame selects the step; Delete removes the selection; Esc steps back up', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('Shift+P');
    await page.keyboard.press('b');
    await dragOnFrame(page, [0.2, 0.2], [0.4, 0.4]);
    await expect(page.getByRole('heading', { name: 'Box' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Step 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Nothing selected' })).toBeVisible();
    await clickFrame(page, 0.3, 0.3); /* the box's outline is the only part of an unselected box that is hit... */
    await clickFrame(page, 0.9, 0.9); /* ...so empty space selects the step */
    await expect(page.getByRole('heading', { name: 'Step 1' })).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(stepCards(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(stepCards(page)).toHaveCount(1);
  });
});

test.describe('transport', () => {
  test('playing stops at every pinned step and Continue carries on', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 2.5);
    await page.keyboard.press('Shift+P');
    await page.keyboard.press('ControlOrMeta+Comma'); /* play from the very start */
    await expect(page.getByText('Stopped at step 1')).toBeVisible();
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Stopped at step 2')).toBeVisible();
    expect(await playheadSeconds(page)).toBeCloseTo(2.5, 2);
    await page.keyboard.press('Space');
    await expect.poll(() => playheadSeconds(page), { timeout: 10_000 }).toBeCloseTo(6, 0); /* runs on to the end and pauses */
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('J plays backward and stops at the previous step', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 3);
    await page.keyboard.press('j');
    await expect(page.getByText('Stopped at step 1')).toBeVisible();
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
  });

  test('frame keys step one frame; Shift+arrows one second; Alt+arrows jump between steps', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 4);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 2);
    await page.keyboard.press('ArrowRight');
    expect(await playheadSeconds(page)).toBeCloseTo(2.033, 2);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await playheadSeconds(page)).toBeCloseTo(3, 2);
    await page.keyboard.press('Alt+ArrowRight');
    expect(await playheadSeconds(page)).toBeCloseTo(4, 2);
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
    await page.keyboard.press('Shift+L'); /* next edit: the pin at 4 s... */
    await page.keyboard.press('Shift+L');
    expect(await playheadSeconds(page)).toBeCloseTo(6, 1);
    await page.keyboard.press('ControlOrMeta+Period');
    expect(await playheadSeconds(page)).toBeCloseTo(6, 1);
  });

  test('keys typed into a field change only the field', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    const title = page.getByRole('textbox', { name: 'Title' });
    await title.fill('');
    await title.pressSequentially('jkl=-pb ');
    await expect(title).toHaveValue('jkl=-pb ');
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
    await expect(page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('the timeline', () => {
  test('only the ruler moves the playhead, and dragging a step moves it as one undo step', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await seekTo(page, 3);
    const lane = page.getByLabel(/Steps lane/);
    const lb = (await lane.boundingBox())!;
    await page.mouse.click(lb.x + lb.width * 0.8, lb.y + lb.height / 2);
    expect(await playheadSeconds(page)).toBeCloseTo(3, 2); /* a click in a lane doesn't scrub */

    const marker = page.getByRole('button', { name: /^Step 1/ });
    const mb = (await marker.boundingBox())!;
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width * 0.75, mb.y + mb.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:0?[4-5]/);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:01\.00/);
  });

  test('a step marker snaps to the end of the guide with an amber line, unless Alt is held', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    const lane = page.getByLabel(/Steps lane/);
    const lb = (await lane.boundingBox())!;
    const marker = page.getByRole('button', { name: /^Step 1/ });
    const mb = (await marker.boundingBox())!;
    const y = mb.y + mb.height / 2;
    const nearEnd = lb.x + lb.width - 5; /* 5 px short of the end */

    await page.mouse.move(mb.x + mb.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(nearEnd, y, { steps: 8 });
    await expect(page.getByTestId('snap-line')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('snap-line')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:05\.9/);

    /* holding Alt flips snapping off for the drag */
    const m2 = (await page.getByRole('button', { name: /^Step 1/ }).boundingBox())!;
    await page.mouse.move(m2.x + m2.width / 2, y);
    await page.mouse.down();
    await page.keyboard.down('Alt');
    await page.mouse.move(lb.x + lb.width - 12, y, { steps: 8 });
    await expect(page.getByTestId('snap-line')).toBeHidden();
    await page.keyboard.up('Alt');
    await page.mouse.up();
  });

  test('zoom keys zoom the timeline by 1.5× between 1× and 8×', async ({ page }) => {
    await openRecording(page);
    const slider = page.getByRole('slider', { name: 'Timeline zoom' });
    await expect(slider).toHaveValue('1');
    await page.keyboard.press('=');
    await expect(slider).toHaveValue('1.5');
    await page.keyboard.press('=');
    await expect(slider).toHaveValue('2.25');
    for (let i = 0; i < 12; i++) await page.keyboard.press('=');
    await expect(slider).toHaveValue('8');
    for (let i = 0; i < 12; i++) await page.keyboard.press('-');
    await expect(slider).toHaveValue('1');
  });

  test('a step can be moved with the arrow keys when its marker has focus', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await page.getByRole('button', { name: /^Step 1/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:01\.03/);
  });
});

test.describe('the Inspector', () => {
  test('typing a position moves the step; a time past the end is refused', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    const position = page.getByRole('textbox', { name: 'Position' });
    await position.fill('2.5');
    await position.press('Enter');
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:02\.50/);
    await position.fill('9');
    await position.press('Enter');
    await expect(page.getByText(/past the end/)).toBeVisible();
    await expect(position).toHaveValue('0:02.50');
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(page.getByRole('button', { name: /^Step 1/ })).toHaveAccessibleName(/at 0:01\.00/);
  });

  test('typing a title is one undo step', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    const title = page.getByRole('textbox', { name: 'Title' });
    await title.click();
    await title.pressSequentially('Open the menu');
    await page.getByRole('textbox', { name: 'Note' }).click(); /* focus leaves, so the session ends */
    await page.getByRole('heading', { name: 'Step 1' }).click();
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(title).toHaveValue('');
  });

  test('callout text, colour and position edit the annotation', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await page.keyboard.press('c');
    await clickFrame(page, 0.5, 0.5);
    await page.getByRole('textbox', { name: 'Text' }).fill('Hello there');
    await page.getByRole('button', { name: 'Marigold' }).click();
    await expect(page.getByRole('button', { name: 'Marigold' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('spinbutton', { name: 'Pointer X' }).fill('64');
    await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello there');
    await page.getByRole('heading', { name: 'Callout' }).click();
    await expect(page.getByTestId('frame-canvas')).toHaveScreenshot('callout-marigold.png', { maxDiffPixelRatio: 0.002 });
  });
});

test.describe('projects and files', () => {
  test('the Projects dialog lists projects, reopens one, and deletes one', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 1);
    await page.keyboard.press('Shift+P');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Projects' }).click();
    const dialog = page.getByRole('dialog', { name: 'Projects' });
    await expect(dialog.getByRole('button', { name: /^demo/ })).toContainText('1 step');

    /* a second project from the same recording */
    await dialog.getByTestId('projects-file-input').setInputFiles(FIXTURE);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
    await expect(stepCards(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    await dialog.getByRole('button', { name: /^demo.*1 step/ }).click(); /* opens the one with the step */
    await expect(stepCards(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Projects' }).click();
    await dialog.getByRole('button', { name: 'Delete demo' }).first().click();
    await dialog.getByRole('button', { name: 'Delete for good' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
  });

  test('a project saved as a .waypost file opens again, as a copy', async ({ page }) => {
    /* headless Chromium offers the save picker but can't show it; without it the app downloads the file, as other browsers do */
    await page.addInitScript(() => {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await openRecording(page);
    await seekTo(page, 2);
    await page.keyboard.press('p');
    await clickFrame(page, 0.4, 0.4);
    await page.getByRole('textbox', { name: 'Title' }).fill('A saved step');
    await page.getByRole('textbox', { name: 'Guide name' }).fill('Round trip');

    await page.getByRole('button', { name: 'Export' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Save project file/ }).click()]);
    expect(download.suggestedFilename()).toBe('Round trip.waypost');
    const file = await download.path();
    const zipped = unzipSync(new Uint8Array(await readFile(file!)));
    const names = Object.keys(zipped).sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toBe('project.json');
    expect(names[1]).toMatch(/^sources\/.+\.webm$/);

    /* open it in a fresh browser context, as if on another machine */
    const other = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await other.newPage();
    await page2.goto('/');
    await page2.getByTestId('file-input').setInputFiles({ name: 'Round trip.waypost', mimeType: 'application/zip', buffer: await readFile(file!) });
    await expect(page2.getByRole('textbox', { name: 'Guide name' })).toHaveValue('Round trip');
    await expect(stepCards(page2)).toHaveCount(1);
    await expect(stepCards(page2).first()).toContainText('A saved step');
    await expect(page2.getByLabel('Playhead position and length')).toHaveText('0:00.000 / 0:06.000');
    await other.close();
  });
});

test.describe('layout', () => {
  test('the frame fits the canvas area at laptop size', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openRecording(page);
    const frame = (await page.getByTestId('frame-canvas').boundingBox())!;
    const stage = (await page.getByRole('main', { name: 'Canvas' }).boundingBox())!;
    expect(frame.width).toBeLessThanOrEqual(stage.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(stage.y + stage.height);
    expect(Math.abs(frame.width / frame.height - 1.6)).toBeLessThan(0.02);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    void frameBox;
  });

  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 720 }]) {
    test(`the frame starts level with the Steps and Inspector panels at ${size.width} px wide`, async ({ page }) => {
      await page.setViewportSize(size);
      await openRecording(page);
      const frame = (await page.getByTestId('frame-canvas').boundingBox())!;
      const steps = (await page.getByRole('complementary', { name: /Steps/ }).boundingBox())!;
      const inspector = (await page.getByRole('complementary', { name: 'Inspector' }).boundingBox())!;
      expect(Math.abs(frame.y - steps.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.y - inspector.y)).toBeLessThanOrEqual(1);
    });
  }

  test('the tools and the View switch sit just left of the transport controls, on the same row', async ({ page }) => {
    await openRecording(page);
    const box = async (loc: Locator) => (await loc.boundingBox())!;
    const tools = await box(page.getByRole('toolbar', { name: 'Tools' }));
    const view = await box(page.getByRole('group', { name: 'View' }));
    const transport = await box(page.getByRole('group', { name: 'Transport' }));
    const timeline = await box(page.getByRole('region', { name: 'Timeline' }));
    expect(tools.x + tools.width).toBeLessThanOrEqual(view.x);
    expect(view.x + view.width).toBeLessThanOrEqual(transport.x);
    expect(Math.abs(tools.y + tools.height / 2 - (transport.y + transport.height / 2))).toBeLessThan(4);
    /* they are part of the timeline's header, not above the canvas */
    expect(tools.y).toBeGreaterThanOrEqual(timeline.y);
    /* the selected option is bold; its label must still fit inside its button */
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Viewer' }).click();
    for (const name of ['Edit', 'Viewer']) {
      const fits = await page.getByRole('group', { name: 'View' }).getByRole('button', { name }).evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth);
      expect(fits, `${name} fits its button`).toBe(true);
    }
  });
});
