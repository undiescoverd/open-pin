import { expect, test } from '@playwright/test';
import { clickFrame, openRecording, watchErrors } from './helpers';

/** Phase 4, item 3: the step card in the Steps list. */

test.describe('step card', () => {
  test('the selected step opens as a card with words, chips, a plain-words footer and a closed Advanced', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page, { fullTimeline: false });
    const steps = page.getByRole('complementary', { name: /Steps/ });
    await expect(steps.getByRole('textbox', { name: 'Title' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(steps.getByText('Nothing added yet')).toBeVisible();
    await steps.getByRole('textbox', { name: 'Title' }).fill('Open the menu');
    await steps.getByRole('textbox', { name: 'Note' }).fill('Top left.');
    await expect(steps.getByText('Waits for a click, or 2.5 s in a video')).toBeVisible();
    await expect(steps.getByText('Advanced')).toBeVisible();
    await expect(steps.getByRole('textbox', { name: 'Position' })).toBeHidden();

    /* the row now reads as the title, and Advanced holds the exact controls */
    await steps.getByText('Advanced').click();
    await expect(steps.getByRole('textbox', { name: 'Position' })).toBeVisible();
    await steps.getByLabel('Pause', { exact: true }).fill('4');
    await steps.getByLabel('Pause', { exact: true }).press('Enter');
    await expect(steps.getByText('Waits for a click, or 4 s in a video')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Duplicate copies the step onto the frame the playhead is on, and refuses a frame that has a step', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    const steps = page.getByRole('complementary', { name: /Steps/ });
    await page.keyboard.press('p');
    await clickFrame(page, 0.4, 0.4); /* the Pin tool: a step with a click marker */
    await steps.getByRole('textbox', { name: 'Title' }).fill('Click Invite');
    await expect(steps.getByRole('button', { name: 'Click marker', exact: true })).toBeVisible();

    await steps.getByRole('button', { name: 'Duplicate' }).click(); /* same frame: refused */
    await expect(page.getByText(/already has a step/)).toBeVisible();
    await expect(steps.getByRole('listitem').filter({ hasText: 'Click Invite' })).toHaveCount(1);

    await page.getByTestId('filmstrip-track').click({ position: { x: 300, y: 20 } });
    await steps.getByRole('button', { name: 'Duplicate' }).click();
    await expect(steps.getByRole('textbox', { name: 'Title' })).toHaveValue('Click Invite');
    await expect(steps.locator('li').filter({ has: page.locator('button[aria-current="step"]') })).toHaveCount(1);
    await expect(steps.getByRole('button', { name: /Click Invite/ })).toHaveCount(2);
  });
});
