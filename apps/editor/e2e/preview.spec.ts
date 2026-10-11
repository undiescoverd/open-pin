import { expect, test, type Page } from '@playwright/test';
import { clickFrame, deselectAll, openRecording, seekTo, stepCards, stepRail, watchErrors } from './helpers';

/** Phase 4, item 7: Preview opens at the selected step, and Esc comes back to the step it was showing. */

async function pin(page: Page, seconds: number, title: string): Promise<void> {
  await seekTo(page, seconds);
  await page.keyboard.press('p');
  await clickFrame(page, 0.4, 0.4);
  await page.keyboard.press('v');
  await stepRail(page).getByRole('textbox', { name: 'Title' }).fill(title);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('preview at the selected step', () => {
  test('opens on the selected step, and Esc selects the step it was showing', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page);
    await pin(page, 1, 'Open the menu');
    await pin(page, 2.5, 'Pick a colour');
    await pin(page, 4, 'Save it');
    await expect(stepCards(page)).toHaveCount(3);

    await stepRail(page).getByRole('button', { name: /Pick a colour/ }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    const wp = dialog.getByTestId('preview-player').locator('.wp');
    await expect(wp).toHaveAttribute('data-state', 'step-2', { timeout: 15_000 });
    await expect(wp.locator('.wp-counter')).toHaveText('2 / 3');

    /* move on in the preview, then Esc: the editor is on the step the preview was showing */
    await wp.press('ArrowRight');
    await expect(wp).toHaveAttribute('data-state', 'step-3', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(stepRail(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Save it');

    /* with nothing selected it opens on the start card, and closing from there leaves the editor as it was */
    await deselectAll(page);
    await page.keyboard.press('Control+Enter');
    await expect(wp).toHaveAttribute('data-state', 'start', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(stepRail(page).getByRole('textbox', { name: 'Title' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('one Esc closes it, even with a tooltip due under it from the button the mouse is on', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.getByRole('button', { name: 'Add step' }).click(); /* the mouse stays on Add step, whose tooltip is on its way */
    await page.keyboard.press('Control+Enter');
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    await expect(dialog.getByTestId('preview-player').locator('.wp')).toHaveAttribute('data-state', 'step-1', { timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    /* and that Esc stopped at the dialog: the step is still selected */
    await expect(stepRail(page).getByRole('textbox', { name: 'Title' })).toBeVisible();
  });
});
