import { expect, test, type Page } from '@playwright/test';
import { addButton, dragOnFrame, inspector, openItemAdvanced, openRecording, seekTo } from './helpers';

/** Phase 4, item 5: the Hide panel asks for a look, a strength and how long; everything else is under its Advanced. */

const look = (page: Page) => inspector(page).getByRole('group', { name: 'Look' });
const howLong = (page: Page) => inspector(page).getByRole('group', { name: 'How long' });
const pressed = (group: ReturnType<typeof look>) => group.locator('button[aria-pressed=true]');

/** Steps at 1 s and 3 s, with the playhead on the second. */
async function twoSteps(page: Page): Promise<void> {
  await openRecording(page);
  for (const t of [1, 3]) {
    await seekTo(page, t);
    await page.keyboard.press('Shift+P');
  }
}

test.describe('Hide', () => {
  test('starts as a Cover for this step only, with nothing else showing until Advanced is opened', async ({ page }) => {
    await twoSteps(page);
    await addButton(page, 'Hide').click();
    await expect(inspector(page).getByRole('heading', { name: 'Hide' })).toBeVisible();
    await expect(pressed(look(page))).toHaveAccessibleName('Cover');
    await expect(pressed(howLong(page))).toHaveAccessibleName('This step only');
    await expect(inspector(page).getByText(/^Hidden from 0:01\.0\d to 0:03\.0\d\.$/)).toBeVisible();
    await expect(inspector(page).getByLabel('Strength', { exact: true })).toHaveCount(0);
    await expect(inspector(page).getByLabel('Add an effect', { exact: true })).toBeHidden();
    await expect(inspector(page).getByText('Effects, layers, timing, fades, position')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Hidden during step 2' })).toBeVisible();
  });

  test('Pixelate and Blur have a strength that starts strong; Cover has none', async ({ page }) => {
    await openRecording(page);
    await addButton(page, 'Hide').click();
    await look(page).getByRole('button', { name: 'Pixelate' }).click();
    const strength = inspector(page).getByLabel('Strength', { exact: true });
    await expect(strength).toHaveValue('75');
    await strength.fill('90');
    await strength.press('Enter');
    await expect(strength).toHaveValue('90');
    await look(page).getByRole('button', { name: 'Blur' }).click();
    await expect(strength).toHaveValue('75');
    await look(page).getByRole('button', { name: 'Cover' }).click();
    await expect(strength).toHaveCount(0);
    /* each look is one undo step */
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(pressed(look(page))).toHaveAccessibleName('Blur');
  });

  test('How long: from here to the end, the whole video, and back to this step', async ({ page }) => {
    await twoSteps(page);
    await addButton(page, 'Hide').click();
    await howLong(page).getByRole('button', { name: 'The whole video' }).click();
    await expect(pressed(howLong(page))).toHaveAccessibleName('The whole video');
    await expect(inspector(page).getByText('Hidden from 0:00.00 to 0:06.00.')).toBeVisible();
    await howLong(page).getByRole('button', { name: 'From here to the end' }).click();
    await expect(inspector(page).getByText(/^Hidden from 0:01\.0\d to 0:06\.00\.$/)).toBeVisible();
    await howLong(page).getByRole('button', { name: 'This step only' }).click();
    await expect(inspector(page).getByText(/^Hidden from 0:01\.0\d to 0:03\.0\d\.$/)).toBeVisible();
  });

  test('a stack of its own shows no look picked, and picking one replaces the stack', async ({ page }) => {
    await openRecording(page);
    await addButton(page, 'Hide').click();
    await openItemAdvanced(page);
    await inspector(page).getByLabel('Add an effect', { exact: true }).selectOption('darken');
    await expect(inspector(page).locator('[data-effect]')).toHaveCount(2);
    await expect(pressed(look(page))).toHaveCount(0);
    await expect(inspector(page).getByText('It has its own mix of effects, under Advanced.', { exact: false })).toBeVisible();
    await look(page).getByRole('button', { name: 'Cover' }).click();
    await expect(inspector(page).locator('[data-effect]')).toHaveCount(1);
    await expect(inspector(page).locator('[data-effect]')).toHaveAttribute('data-effect', 'solid');
  });

  test('the X key is Hide: drawing one gives a Cover', async ({ page }) => {
    await openRecording(page);
    await page.keyboard.press('x');
    await expect(page.locator('[data-armed]')).toHaveText('Hide');
    await expect(page.getByRole('status').filter({ hasText: 'Drag over what should be hidden.' })).toBeVisible();
    await dragOnFrame(page, [0.2, 0.2], [0.4, 0.4]);
    await expect(pressed(look(page))).toHaveAccessibleName('Cover');
    /* no steps, so it lasts from the playhead (the start, here) to the end */
    await expect(pressed(howLong(page))).toHaveAccessibleName('The whole video');
  });
});
