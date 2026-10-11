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
export async function openRecording(page: Page, options: { fullTimeline?: boolean; defaultCanvas?: boolean } = {}): Promise<void> {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(FIXTURE);
  await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add step' })).toBeEnabled();
  await waitForFrame(page);
  /* a new project is widescreen on a gradient and opens on the Canvas tab; most specs measure the recording itself and use the
     Add buttons, so they start on its own shape with the Inspector showing */
  if (!options.defaultCanvas) {
    await originalShape(page);
    await page.getByRole('tab', { name: 'Inspector' }).click();
  }
  /* the Phase 1 to 3 specs drive the lanes, which live in the full timeline behind Trim & edit video */
  if (options.fullTimeline ?? true) {
    await page.getByRole('button', { name: 'Trim & edit video' }).click();
    await expect(page.getByLabel('Ruler')).toBeVisible();
  }
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

/**
 * Watches the zoom on the canvas for `ms` milliseconds and returns one reading per animation frame. The fixture is vertical
 * colour bars, so where yellow starts along a row, as a fraction of the canvas width, says how far in the frame is zoomed: about
 * a third with the whole frame showing, and nearer the left edge the further in. The row is above the diagonal streak that
 * crosses the lower part of the picture, whose yellow-green end would otherwise be taken for the bar.
 */
export function watchYellowEdge(page: Page, ms: number): Promise<number[]> {
  return page.getByTestId('frame-canvas').evaluate(
    (canvas: HTMLCanvasElement, duration: number) =>
      new Promise<number[]>(resolve => {
        const ctx = canvas.getContext('2d')!;
        const readings: number[] = [];
        const start = performance.now();
        const read = () => {
          const row = ctx.getImageData(0, Math.floor(canvas.height * 0.3), canvas.width, 1).data;
          let edge = -1;
          for (let x = 0; x < canvas.width && edge < 0; x++) {
            if (row[x * 4]! > 200 && row[x * 4 + 1]! > 200 && row[x * 4 + 2]! < 90) edge = x;
          }
          readings.push(edge < 0 ? Number.NaN : edge / canvas.width);
          if (performance.now() - start < duration) requestAnimationFrame(read);
          else resolve(readings);
        };
        requestAnimationFrame(read);
      }),
    ms,
  );
}

export const stepRail = (page: Page): Locator => page.getByRole('complementary', { name: /Steps/ });
export const stepCards = (page: Page): Locator => stepRail(page).getByRole('listitem');

/** Opens the selected step's Advanced section (exact time, pause, appearing order) if it is closed. */
export async function openStepAdvanced(page: Page): Promise<void> {
  const position = stepRail(page).getByRole('textbox', { name: 'Position' });
  if (!(await position.isVisible())) await stepRail(page).getByText('Advanced', { exact: true }).click();
  await expect(position).toBeVisible();
}

export const inspector = (page: Page): Locator => page.getByRole('complementary', { name: 'Inspector' });

/** One of the Add buttons at the top of the right panel (Callout, Arrow, Highlight, Zoom, Hide, Click). */
export const addButton = (page: Page, name: string): Locator => page.getByRole('group', { name: /^Add to/ }).getByRole('button', { name, exact: true });

/** A chip in the selected step's "On this step" row. */
export const stepChip = (page: Page, name: string | RegExp): Locator => stepRail(page).getByRole('group', { name: 'On this step' }).getByRole('button', { name });

/** Opens the Advanced section at the end of the selected item's panel (exact position, when it appears) if it is closed. */
export async function openItemAdvanced(page: Page): Promise<void> {
  const details = inspector(page).locator('details', { has: page.locator(':scope > summary', { hasText: /^Advanced/ }) });
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator(':scope > summary').click();
  await expect(details).toHaveAttribute('open', '');
}

/** The Export dialog. */
export const exportDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Export' });

/** Opens Export from the top bar and picks what to export: Interactive guide, Video, PDF or Images. */
export async function openExport(page: Page, kind: 'Interactive guide' | 'Video' | 'PDF' | 'Images' = 'Interactive guide'): Promise<Locator> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = exportDialog(page);
  await dialog.getByRole('group', { name: 'What to export' }).getByRole('button', { name: new RegExp(`^${kind}`) }).click();
  return dialog;
}

/** Opens the Export dialog's Advanced section if it is closed. */
export async function openExportAdvanced(page: Page): Promise<void> {
  const details = exportDialog(page).locator('details', { has: page.locator(':scope > summary', { hasText: /^Advanced/ }) });
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator(':scope > summary').click();
  await expect(details).toHaveAttribute('open', '');
}

/** Presses Esc until nothing is selected, so no step card is open (and Preview opens on the start card). */
export async function deselectAll(page: Page): Promise<void> {
  const title = stepRail(page).getByRole('textbox', { name: 'Title' });
  for (let i = 0; i < 4 && (await title.count()) > 0; i++) await page.keyboard.press('Escape');
  await expect(title).toHaveCount(0);
}

/** The canvas bar above the frame: its shape buttons (Original, 16:9, 4:3, 1:1, 4:5) and the Style button. */
export const canvasBar = (page: Page): Locator => page.getByRole('toolbar', { name: 'Canvas' });

/** Picks the recording's own shape for the canvas, and waits for the frame to take it. */
export async function originalShape(page: Page): Promise<void> {
  await canvasBar(page).getByRole('button', { name: 'Original', exact: true }).click();
  await expect(canvasBar(page).getByRole('button', { name: 'Original', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByTestId('frame-canvas').evaluate((c: HTMLCanvasElement) => Math.abs(c.width / c.height - 640 / 400))).toBeLessThan(0.01);
  await waitForFrame(page);
}

/** Shows the Canvas tab (background, padding, corners, shadow, annotation colour, logo) with the bar's Style button. */
export async function openStyle(page: Page): Promise<Locator> {
  await canvasBar(page).getByRole('button', { name: /^Style/ }).click();
  const panel = page.getByRole('tabpanel', { name: 'Canvas' });
  await expect(panel).toBeVisible();
  return panel;
}
