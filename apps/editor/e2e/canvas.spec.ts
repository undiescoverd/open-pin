import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { canvasBar, exportDialog, openExport, openRecording, openStyle, watchErrors } from './helpers';

/** The Canvas tab: shape and style are chosen beside the frame, never above it, a new project starts widescreen on a gradient, and
    Export has none of it. What the canvas shows is what every export draws. */

const shape = (page: Page, name: string) => canvasBar(page).getByRole('button', { name, exact: true });

test.describe('the Canvas tab', () => {
  test('a new project starts 16:9 on a gradient, with the shape first in the Canvas tab', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page, { defaultCanvas: true });
    await expect(canvasBar(page)).toBeVisible();
    await expect(canvasBar(page).getByRole('button')).toHaveText([/^Original/, /^16:9/, /^4:3/, /^1:1/, /^4:5/]);
    await expect(shape(page, '16:9')).toHaveAttribute('aria-pressed', 'true');
    /* the right panel opens on the Canvas, so the look can be chosen before the first step */
    await expect(page.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Canvas' }).getByRole('group', { name: 'Gradient' }).getByRole('button', { name: /Dusk/ })).toHaveAttribute('aria-pressed', 'true');
    const size = await page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    expect(size[0]! / size[1]!).toBeCloseTo(16 / 9, 2);

    /* the recording is 16:10, so the 16:9 canvas has gradient bars at the sides, never a see-through checkerboard */
    const pixel = (fx: number) =>
      page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement, f) => {
        const d = c.getContext('2d')!.getImageData(Math.round(f * c.width), Math.round(c.height / 2), 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]!];
      }, fx);
    const bar = await pixel(0.01);
    expect(bar[3]).toBe(255);
    expect(bar.slice(0, 3)).not.toEqual([0, 0, 0]);
    expect(errors).toEqual([]);
  });

  test('the shape buttons change the frame at once, and one click on Original goes back', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    const ratio = () => page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => c.width / c.height);
    for (const [name, r] of [['4:3', 4 / 3], ['1:1', 1], ['4:5', 4 / 5], ['Original', 640 / 400], ['16:9', 16 / 9]] as const) {
      await shape(page, name).click();
      await expect(shape(page, name)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(ratio).toBeCloseTo(r, 1);
    }
    /* the whole canvas is one undo step per choice */
    await page.keyboard.press('ControlOrMeta+z');
    await expect(shape(page, 'Original')).toHaveAttribute('aria-pressed', 'true');
  });

  test('nothing sits above the frame, and it keeps its size when the shape changes', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    await expect(page.getByRole('toolbar', { name: 'Canvas' })).toHaveCount(0);
    const stage = (await page.getByRole('main', { name: 'Canvas' }).boundingBox())!;
    for (const name of ['16:9', '1:1', 'Original']) {
      await shape(page, name).click();
      await expect(shape(page, name)).toHaveAttribute('aria-pressed', 'true');
      const frame = (await page.getByTestId('frame-canvas').boundingBox())!;
      expect(frame.y - stage.y).toBeLessThanOrEqual(2);
    }
  });

  test('the Canvas tab sits beside the frame, never over it; adding a step shows the Inspector and the Canvas tab brings the canvas back', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    const style = page.getByRole('tabpanel', { name: 'Canvas' });
    for (const group of ['Background', 'Frame', 'Annotations', 'Logo']) await expect(style.getByRole('region', { name: group })).toBeVisible();
    const frame = (await page.getByTestId('frame-canvas').boundingBox())!;
    const panel = (await style.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(frame.x + frame.width);
    await style.getByRole('group', { name: 'Gradient' }).getByRole('button', { name: /Ember/ }).click();
    await expect(style.getByRole('group', { name: 'Gradient' }).getByRole('button', { name: /Ember/ })).toHaveAttribute('aria-pressed', 'true');
    await style.getByRole('group', { name: 'Background colour' }).getByRole('button', { name: 'Paper' }).click();
    await expect(style.getByRole('group', { name: 'Background colour' }).getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(page.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: /^Add to/ })).toBeVisible();
    await openStyle(page);
    await expect(page.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    /* the step is still selected on its card */
    await expect(page.getByRole('complementary', { name: /Steps/ }).getByRole('textbox', { name: 'Title' })).toBeVisible();
  });

  test('padding sets the recording on the background, and a 16:9 recording fills the canvas with none', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    await shape(page, '16:9').click();
    const style = await openStyle(page);
    const slider = style.getByLabel('Padding', { exact: true });
    const edge = () =>
      page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => {
        /* the first column that is the recording, not the background: where the picture starts along the middle row */
        const row = c.getContext('2d')!.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
        const first = [row[0]!, row[1]!, row[2]!];
        for (let x = 1; x < c.width; x++) if (Math.abs(row[x * 4]! - first[0]!) + Math.abs(row[x * 4 + 1]! - first[1]!) + Math.abs(row[x * 4 + 2]! - first[2]!) > 60) return x / c.width;
        return 0;
      });
    const before = await edge();
    await slider.fill('12');
    await slider.press('Tab');
    await expect.poll(edge).toBeGreaterThan(before + 0.05);
  });

  test('Export has no canvas controls, whatever is being exported', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    await page.getByRole('button', { name: 'Add step' }).click();
    for (const kind of ['Interactive guide', 'Video', 'PDF', 'Images'] as const) {
      const dialog = await openExport(page, kind);
      await expect(dialog.getByLabel('Shape')).toHaveCount(0);
      await expect(dialog.getByRole('region', { name: /Background and framing|Logo|Annotations/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(exportDialog(page)).toBeHidden();
    }
  });

  test('a 16:9 canvas with side bars exports a picture identical to the frame, bars and all', async ({ page }) => {
    await openRecording(page, { defaultCanvas: true });
    await page.getByRole('button', { name: 'Add step' }).click();
    const dialog = await openExport(page, 'Images');
    await dialog.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'PNG' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export images' }).click()]);
    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    const png = Buffer.from(Object.values(files)[0]!).toString('base64');
    const result = await page.evaluate(async b64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], { type: 'image/png' }));
      const copy = new OffscreenCanvas(bitmap.width, bitmap.height);
      const cctx = copy.getContext('2d')!;
      cctx.drawImage(bitmap, 0, 0);
      const exported = cctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid=frame-canvas]')!;
      const shown = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) return { sameSize: false, differing: -1, see: 0, pixels: 1 };
      let differing = 0;
      let see = 0;
      for (let i = 0; i < exported.length; i += 4) {
        if (Math.abs(exported[i]! - shown[i]!) + Math.abs(exported[i + 1]! - shown[i + 1]!) + Math.abs(exported[i + 2]! - shown[i + 2]!) > 6) differing++;
        if (exported[i + 3]! < 255) see++;
      }
      return { sameSize: true, differing, see, pixels: exported.length / 4 };
    }, png);
    expect(result.sameSize).toBe(true);
    expect(result.see).toBe(0); /* no see-through pixels: the bars are drawn */
    /* the same picture, bars and all. The only differences allowed are the antialiased pixels along the four rounded corners,
       which the editor's canvas and the export's canvas round off a shade differently. */
    expect(result.differing / result.pixels).toBeLessThan(0.0005);
  });
});
