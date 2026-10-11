import { expect, test, type Locator, type Page } from '@playwright/test';
import { addButton, exportDialog, inspector, openExport, openExportAdvanced, openRecording, openStyle, seekTo, stepChip, waitForFrame, watchErrors } from './helpers';

/** Phase 4, item 6: one Export button and one dialog. Pick what to export, answer what matters for it, and find the rest under
    Advanced. The Phase 1 to 3 specs export through it; this spec covers the dialog itself. */

const kinds = (page: Page) => exportDialog(page).getByRole('group', { name: 'What to export' });
const summary = (page: Page) => exportDialog(page).locator('details > summary', { hasText: /^Advanced/ });

/** A group's buttons, by accessible name (each option carries an invisible bold copy of its text). */
async function expectOptions(group: Locator, names: string[]): Promise<void> {
  await expect(group.getByRole('button')).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(group.getByRole('button').nth(i)).toHaveAccessibleName(name);
}

async function oneStep(page: Page): Promise<void> {
  await openRecording(page);
  await seekTo(page, 1);
  await page.keyboard.press('Shift+P');
}

test.describe('Export', () => {
  test('one Export button opens one dialog; the guide is picked first, with how it plays and the end button', async ({ page }) => {
    const errors = watchErrors(page);
    await oneStep(page);
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = exportDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('demo · 1 step', { exact: true })).toBeVisible();
    await expect(kinds(page).getByRole('button')).toHaveText([/^Interactive guide/, /^Video/, /^PDF/, /^Images/]);
    await expect(kinds(page).getByRole('button', { name: /^Interactive guide/ })).toHaveAttribute('aria-pressed', 'true');
    await expectOptions(dialog.getByRole('group', { name: 'How it plays' }), ['Viewer clicks Next', 'Plays by itself', 'Plain video']);
    await expect(dialog.getByRole('checkbox', { name: 'Show a button' })).not.toBeChecked();
    await expect(dialog.getByRole('textbox', { name: 'Button text' })).toHaveCount(0);
    await expect(dialog.getByText("We'll give you the link and embed code next.")).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export guide' })).toBeEnabled();
    await expect(dialog.getByText('Coming later')).toBeVisible();
    /* the player's look and the saving options wait under Advanced; the canvas isn't in Export at all */
    await expect(summary(page)).toContainText('End button timing, player look, saving, PDF copy');
    await expect(dialog.getByRole('switch', { name: 'Step counter' })).toBeHidden();
    await openExportAdvanced(page);
    for (const group of ['Player', 'Saving']) await expect(dialog.getByRole('region', { name: group })).toBeVisible();
    for (const group of ['Background and framing', 'Logo', 'Annotations']) await expect(dialog.getByRole('region', { name: group })).toHaveCount(0);
    await expect(dialog.getByLabel('Shape')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('each kind asks only what matters for it', async ({ page }) => {
    await oneStep(page);
    const dialog = await openExport(page, 'Video');
    await expect(dialog.getByRole('group', { name: 'Size' }).getByRole('button', { name: '1080p' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('switch', { name: 'Step titles as captions' })).toBeVisible();
    await expect(dialog.getByText(/^\d+ × 1080 · 0:0\d\.\d\d long, with 1 step pause\.$/)).toBeVisible();
    await expect(dialog.getByRole('group', { name: 'How it plays' })).toHaveCount(0);
    /* a video, PDF or set of images has nothing to hide: the canvas is what the frame shows */
    await expect(summary(page)).toHaveCount(0);

    await kinds(page).getByRole('button', { name: /^PDF/ }).click();
    await expectOptions(dialog.getByRole('group', { name: 'Page size' }), ['A4', 'Letter', '16:9 slides']);
    await expect(dialog.getByText('Downloads a PDF with 1 page, one per step.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export PDF' })).toBeEnabled();

    await kinds(page).getByRole('button', { name: /^Images/ }).click();
    await expectOptions(dialog.getByRole('group', { name: 'Format' }), ['PNG', 'WebP']);
    await expect(dialog.getByRole('button', { name: 'Copy frame' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save frame as PNG' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export images' })).toBeEnabled();
  });

  test("a recording without sound has no sound to turn on in the video", async ({ page }) => {
    await openRecording(page); /* the test recording has no sound */
    const dialog = await openExport(page, 'Video');
    const sound = dialog.getByRole('switch', { name: "The recording's own sound" });
    await expect(sound).toBeDisabled();
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await expect(dialog.getByText('This recording has no sound of its own.')).toBeVisible();
  });

  test('with sound, the video says the sped-up or slowed clips will be silent', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles('e2e/fixtures/demo-sound.webm');
    await waitForFrame(page);
    let dialog = await openExport(page, 'Video');
    await expect(dialog.getByRole('switch', { name: "The recording's own sound" })).toBeEnabled();
    await expect(dialog.getByText('Muted clips, gaps and the pauses at steps are silent.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Trim & edit video' }).click();
    await page.locator('[data-clip]').first().click({ position: { x: 30, y: 8 } });
    await page.getByRole('group', { name: 'Speed presets' }).getByRole('button', { name: '2×' }).click();
    dialog = await openExport(page, 'Video');
    await expect(dialog.getByText(/^The sped-up or slowed clip is silent in the video \(\d\.\d s\): sound can't change speed yet\./)).toBeVisible();
  });

  test('one annotation colour for the guide: new annotations take it, and changing it recolours those still in the old one', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    const colour = (name: string) => inspector(page).getByRole('group', { name: 'Colour' }).getByRole('button', { name });
    await addButton(page, 'Highlight').click();
    await inspector(page).getByRole('group', { name: 'Look' }).getByRole('button', { name: 'Outline' }).click();
    await expect(colour('Coral')).toHaveAttribute('aria-pressed', 'true');
    await addButton(page, 'Arrow').click();
    await colour('Iris').click(); /* given its own colour by hand */

    const style = await openStyle(page);
    await style.getByRole('group', { name: 'Annotation colour' }).getByRole('button', { name: 'Lagoon' }).click();

    await stepChip(page, /Outline/).click();
    await expect(colour('Lagoon')).toHaveAttribute('aria-pressed', 'true');
    await stepChip(page, /Arrow/).click();
    await expect(colour('Iris')).toHaveAttribute('aria-pressed', 'true');
    await addButton(page, 'Arrow').click();
    await expect(colour('Lagoon')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+z'); /* the second arrow, then the colour change, in one step */
    await stepChip(page, /Outline/).click();
    await expect(colour('Coral')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the Canvas tab holds the look, the recording and saving; there is no Guide tab', async ({ page }) => {
    await openRecording(page);
    await expect(page.getByRole('tab', { name: 'Guide' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Project' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Canvas' }).click();
    await expect(page.getByText('What you see on the frame is what every export draws.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Playback' })).toHaveCount(0);
    await expect(inspector(page).getByLabel('Shape')).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Canvas' }).getByText('Recording', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save project file…' })).toBeVisible();
  });

  test('the link and embed code: a placeholder address until one is typed, and back to Export', async ({ page }) => {
    await oneStep(page);
    const dialog = await openExport(page);
    await dialog.getByRole('button', { name: 'Already online? Get the link and embed code' }).click();
    const saved = page.getByRole('dialog', { name: 'Link and embed code' });
    await expect(saved.getByRole('textbox', { name: 'Link' })).toHaveValue('https://you.github.io/guides/demo/');
    for (const host of ['Netlify', 'Cloudflare Pages', 'GitHub Pages']) await expect(saved.getByText(host, { exact: true })).toBeVisible();
    await saved.getByRole('textbox', { name: 'Guide address' }).fill('https://guides.example.com/demo/');
    await expect(saved.getByRole('textbox', { name: 'Link' })).toHaveValue('https://guides.example.com/demo/');
    await saved.getByRole('button', { name: 'Back to Export' }).click();
    await expect(dialog.getByRole('button', { name: 'Export guide' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
