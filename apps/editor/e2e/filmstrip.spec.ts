import { expect, test, type Page } from '@playwright/test';
import { clickFrame, openRecording, playheadSeconds, seekTo, watchErrors } from './helpers';

/** Phase 4, item 2: the filmstrip under the frame, and Trim & edit video opening the full timeline. The fixture is 6 seconds long. */

const track = (page: Page) => page.getByTestId('filmstrip-track');
const trimAndEdit = (page: Page) => page.getByRole('button', { name: 'Trim & edit video' });

async function guideLength(page: Page): Promise<number> {
  const text = (await page.getByLabel('Playhead position and length').innerText()).split('/')[1]!.trim();
  const [m, s] = text.split(':');
  return Number(m) * 60 + Number(s);
}

test.describe('filmstrip', () => {
  test('is the default, and Trim & edit video and Done switch to the full timeline and back', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page, { fullTimeline: false });
    await expect(page.getByRole('region', { name: 'Filmstrip' })).toBeVisible();
    await expect(page.getByText('Playback stops at every step')).toBeVisible();
    await expect(page.getByLabel('Ruler')).toHaveCount(0);
    await expect(page.getByLabel(/ lane/)).toHaveCount(1); /* only the steps lane, as the pins' row */

    await trimAndEdit(page).click();
    await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
    await expect(page.getByLabel('Video lane')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('region', { name: 'Filmstrip' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('remembers the choice for the project', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await trimAndEdit(page).click();
    await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
    await page.waitForTimeout(1200); /* autosave */
    await page.reload();
    await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Filmstrip' })).toBeVisible();
  });

  test('clicking the strip moves the playhead', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    const box = (await track(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(Math.abs((await playheadSeconds(page)) - 3)).toBeLessThan(0.15);
  });

  test('shows a numbered pin for each step, and clicking one selects its step', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.keyboard.press('p');
    await clickFrame(page, 0.4, 0.4);
    const pin = page.getByRole('button', { name: /^Step 1/ });
    await expect(pin).toHaveText('1');
    await page.keyboard.press('v');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
  });

  test('dragging an end of the strip trims the video', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    expect(await guideLength(page)).toBeCloseTo(6, 1);
    const handle = (await page.getByRole('button', { name: 'Trim end of the video' }).boundingBox())!;
    const box = (await track(page).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, handle.y + handle.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await guideLength(page)).toBeCloseTo(3, 0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await guideLength(page)).toBeCloseTo(6, 1);
  });

  test('shows hidden areas as bars on the strip', async ({ page }) => {
    await openRecording(page);
    await page.getByRole('button', { name: 'Add an effect region at the playhead' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(track(page).locator('[data-hidden-area]')).toHaveCount(1);
    await expect(track(page).getByRole('button', { name: /^Hidden/ })).toBeVisible();
  });

  test('clicking a hidden area selects it without moving the playhead; a double-click goes into it', async ({ page }) => {
    await openRecording(page);
    await seekTo(page, 4);
    await page.getByRole('button', { name: 'Add an effect region at the playhead' }).click(); /* 0:04 to the end */
    await seekTo(page, 1);
    /* in the full timeline's Effects lane too */
    await page.getByTestId('effects-lane').locator('[data-blur]').click();
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
    await page.getByRole('button', { name: 'Done' }).click();
    const bar = track(page).getByRole('button', { name: /^Hidden/ });
    await bar.click();
    await expect(bar).toHaveAttribute('aria-pressed', 'true');
    expect(await playheadSeconds(page)).toBeCloseTo(1, 2);
    await bar.dblclick();
    await expect.poll(() => playheadSeconds(page)).toBeCloseTo(4, 2);
  });
});
