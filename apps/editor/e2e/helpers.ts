import { expect, type Locator, type Page } from '@playwright/test';

export const FIXTURE = 'e2e/fixtures/demo.webm';

/** Fails the test on any console error or uncaught exception. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Opens the editor and drops in the 6 second test recording (640×400, 30 fps, VP9). */
export async function openRecording(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(FIXTURE);
  await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pin step' })).toBeEnabled();
  await waitForFrame(page);
}

/** Waits until the canvas has pixels, which is when the first frame has been decoded and drawn. */
export async function waitForFrame(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4 * 97) if (data[i]) return true;
        return false;
      }),
    )
    .toBe(true);
}

/** The playhead as seconds, read from the readout. */
export async function playheadSeconds(page: Page): Promise<number> {
  const text = (await page.getByLabel('Playhead position and length').innerText()).split('/')[0]!.trim();
  const [m, s] = text.split(':');
  return Number(m) * 60 + Number(s);
}

/** Moves the playhead to a time: a click on the ruler lands near, then single-frame keys land exactly. */
export async function seekTo(page: Page, seconds: number): Promise<void> {
  const ruler = (await page.getByLabel('Ruler').boundingBox())!;
  await page.mouse.click(ruler.x + (ruler.width * seconds) / 6, ruler.y + 8);
  for (let i = 0; i < 20; i++) {
    const delta = seconds - (await playheadSeconds(page));
    if (Math.abs(delta) < 0.0006) break;
    await page.keyboard.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(30);
  }
  expect(Math.abs((await playheadSeconds(page)) - seconds)).toBeLessThan(0.0006);
}

export async function frameBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return (await page.getByTestId('annotation-overlay').boundingBox())!;
}

/** Clicks a point on the frame given as fractions of its width and height. */
export async function clickFrame(page: Page, fx: number, fy: number): Promise<void> {
  const b = await frameBox(page);
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
}

export async function dragOnFrame(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const b = await frameBox(page);
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 6 });
  await page.mouse.up();
}

export const stepRail = (page: Page): Locator => page.getByRole('complementary', { name: /Steps/ });
export const stepCards = (page: Page): Locator => stepRail(page).getByRole('listitem');
