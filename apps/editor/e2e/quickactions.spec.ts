import { expect, test, type Page } from '@playwright/test';
import { addButton, clickFrame, frameBox, openRecording, stepChip, stepRail, watchErrors } from './helpers';

/** Phase 4, item 8: quick actions after a pin (Add callout · Highlight · Zoom here) and Duplicate step (⌘D). */

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Next for this click' });

test.describe('quick actions after a pin', () => {
  test('a bar next to the new click marker adds a callout, a highlight and a zoom around it, then goes away', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page, { fullTimeline: false });
    await page.keyboard.press('p');
    await clickFrame(page, 0.3, 0.4);
    await expect(bar(page)).toBeVisible();

    /* it sits next to the marker: to the right of and below the click */
    const b = await frameBox(page);
    const box = (await bar(page).boundingBox())!;
    expect(box.x).toBeGreaterThan(b.x + b.width * 0.3);
    expect(box.y).toBeGreaterThan(b.y + b.height * 0.4);

    await bar(page).getByRole('button', { name: 'Add callout' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(stepChip(page, /Callout/)).toBeVisible();

    /* each pin offers it again; a click elsewhere puts it away */
    await page.getByTestId('filmstrip-track').click({ position: { x: 300, y: 20 } });
    await addButton(page, 'Click').click();
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Zoom here' }).click();
    await expect(page.getByTestId('zoom-box')).toHaveCount(1);
    await expect(bar(page)).toBeHidden();

    await page.getByTestId('filmstrip-track').click({ position: { x: 450, y: 20 } });
    await page.keyboard.press('p');
    await clickFrame(page, 0.8, 0.85);
    await expect(bar(page)).toBeVisible();
    /* near the bottom right it flips to above and to the left */
    const flipped = (await bar(page).boundingBox())!;
    expect(flipped.x + flipped.width).toBeLessThan(b.x + b.width * 0.8);
    expect(flipped.y + flipped.height).toBeLessThan(b.y + b.height * 0.85);
    await bar(page).getByRole('button', { name: 'Highlight' }).click();
    await expect(stepChip(page, /Highlight|Spotlight/)).toBeVisible();

    await page.keyboard.press('p');
    await clickFrame(page, 0.5, 0.5);
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press('v');
    await expect(bar(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('⌘D copies the selected step onto the frame at the playhead', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.getByRole('button', { name: 'Add step' }).click();
    await stepRail(page).getByRole('textbox', { name: 'Title' }).fill('Click Invite');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.getByTestId('filmstrip-track').click({ position: { x: 300, y: 20 } });
    await page.keyboard.press('Control+d');
    await expect(stepRail(page).getByRole('button', { name: /Click Invite/ })).toHaveCount(2);
    await expect(stepRail(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Click Invite');
  });
});
