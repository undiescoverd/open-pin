import { expect, test, type Locator, type Page } from '@playwright/test';
import { exportDialog, openExport, openExportAdvanced, openRecording, seekTo, watchErrors } from './helpers';

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
    /* the player's look, saving, framing and logo wait under Advanced */
    await expect(summary(page)).toContainText('Player look, saving, PDF copy, framing and logo');
    await expect(dialog.getByRole('switch', { name: 'Step counter' })).toBeHidden();
    await openExportAdvanced(page);
    for (const group of ['Player', 'Saving', 'Background and framing', 'Logo']) await expect(dialog.getByRole('region', { name: group })).toBeVisible();
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
    await expect(summary(page)).toContainText('Framing, background and logo');

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

  test('the Guide tab no longer holds the player or framing, and points to Export', async ({ page }) => {
    await openRecording(page);
    await page.getByRole('tab', { name: 'Guide' }).click();
    await expect(page.getByText('How the guide plays, the button at the end')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Playback' })).toHaveCount(0);
    await expect(page.getByLabel('Shape')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open Export' }).click();
    await expect(exportDialog(page)).toBeVisible();
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
