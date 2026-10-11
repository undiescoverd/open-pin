import { expect, test } from '@playwright/test';
import { addButton, clickFrame, inspector, openItemAdvanced, openRecording, stepCards, stepChip, stepRail, watchErrors } from './helpers';

/** Phase 4, item 4: the right panel starts with Add to step N; one click places the item, selected, and the panel under it shows
    that item's simple controls, its Advanced and Remove. */

test.describe('Add, then adjust', () => {
  test('with no step on the frame, an Add button makes one; then the heading names the step', async ({ page }) => {
    const errors = watchErrors(page);
    await openRecording(page, { fullTimeline: false });
    await expect(page.getByRole('group', { name: 'Add to a new step' })).toBeVisible();
    await addButton(page, 'Callout').click();
    await expect(stepCards(page)).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Add to step 1' })).toBeVisible();
    await expect(inspector(page).getByRole('heading', { name: 'Callout' })).toBeVisible();
    await expect(inspector(page).getByRole('textbox', { name: 'Words' })).toHaveValue('Add a short note');
    /* Advanced is closed: one line that says what's inside */
    await expect(inspector(page).getByText('Side, position, when it appears')).toBeVisible();
    await expect(inspector(page).getByRole('spinbutton', { name: 'Pointer X' })).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('items go around the step’s click: the callout points at it and the arrow’s tip is on it', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.keyboard.press('p');
    await clickFrame(page, 0.25, 0.25); /* 160, 100 on the 640 × 400 recording */
    await page.keyboard.press('v');

    await addButton(page, 'Callout').click();
    await openItemAdvanced(page);
    await expect(inspector(page).getByRole('spinbutton', { name: 'Pointer X' })).toHaveValue('160');
    await expect(inspector(page).getByRole('spinbutton', { name: 'Pointer Y' })).toHaveValue('100');

    await addButton(page, 'Arrow').click();
    await expect(inspector(page).getByRole('heading', { name: 'Arrow' })).toBeVisible();
    await openItemAdvanced(page);
    await expect(inspector(page).getByRole('spinbutton', { name: 'Tip X' })).toHaveValue('160');
    await expect(inspector(page).getByRole('spinbutton', { name: 'Tip Y' })).toHaveValue('100');
    await expect(stepCards(page)).toHaveCount(1);
  });

  test('a callout can take the step’s title and note', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.getByRole('button', { name: 'Add step' }).click();
    await stepRail(page).getByRole('textbox', { name: 'Title' }).fill('Click Invite');
    await stepRail(page).getByRole('textbox', { name: 'Note' }).fill('It is top right.');
    await addButton(page, 'Callout').click();
    /* a titled step's callout starts with its title */
    const words = inspector(page).getByRole('textbox', { name: 'Words' });
    await expect(words).toHaveValue('Click Invite');
    await inspector(page).getByRole('button', { name: "Use the step's title and note" }).click();
    await expect(words).toHaveValue('Click Invite\nIt is top right.');
    await expect(inspector(page).getByRole('button', { name: "Use the step's title and note" })).toBeDisabled();
  });

  test('a highlight is a spotlight or an outline, and switching is one undo step', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await addButton(page, 'Highlight').click();
    await expect(inspector(page).getByRole('heading', { name: 'Highlight' })).toBeVisible();
    const look = inspector(page).getByRole('group', { name: 'Look' });
    await expect(look.getByRole('button', { name: 'Spotlight' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stepChip(page, 'Spotlight')).toBeVisible();

    await look.getByRole('button', { name: 'Outline' }).click();
    await expect(look.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stepChip(page, 'Outline')).toBeVisible();
    /* an outline has a colour; a spotlight doesn't */
    await expect(inspector(page).getByRole('group', { name: 'Colour' })).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Z');
    await expect(stepChip(page, 'Spotlight')).toBeVisible();
    await expect(inspector(page).getByRole('heading', { name: 'Highlight' })).toBeVisible();
  });

  test('Zoom adds one zoom and selects it again after that; Remove takes it off', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await addButton(page, 'Zoom').click();
    await expect(inspector(page).getByRole('heading', { name: 'Zoom' })).toBeVisible();
    await expect(inspector(page).getByLabel('How close', { exact: true })).toHaveValue('2');
    await addButton(page, 'Zoom').click();
    await expect(stepChip(page, 'Zoom')).toHaveCount(1);

    await inspector(page).getByRole('button', { name: 'Remove zoom' }).click();
    await expect(stepChip(page, 'Zoom')).toHaveCount(0);
    await expect(inspector(page).getByRole('heading', { name: 'Step 1', exact: true })).toBeVisible();
  });

  test('Click gives the step its click marker in the middle, and selects the one it has after that', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await page.getByRole('button', { name: 'Add step' }).click();
    await addButton(page, 'Click').click();
    await expect(inspector(page).getByRole('heading', { name: 'Click' })).toBeVisible();
    await openItemAdvanced(page);
    await expect(inspector(page).getByRole('spinbutton', { name: 'X' })).toHaveValue('320');
    await expect(inspector(page).getByRole('spinbutton', { name: 'Y' })).toHaveValue('200');

    await addButton(page, 'Click').click();
    await expect(page.getByText('This step already has its click.')).toBeVisible();
    await expect(stepChip(page, 'Click marker')).toHaveCount(1);
  });

  test('Hide adds a hidden area from here on, without needing a step', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await addButton(page, 'Hide').click();
    await expect(inspector(page).getByRole('button', { name: 'Remove hidden area' })).toBeVisible();
    await expect(stepCards(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Filmstrip' }).getByLabel(/^Hidden/)).toHaveCount(1);
  });

  test('Remove takes the selected item off, and repeated adds don’t land on top of each other', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await addButton(page, 'Callout').click();
    await addButton(page, 'Callout').click();
    await openItemAdvanced(page);
    /* the second sits a little down and right of the first, which is in the middle */
    await expect(inspector(page).getByRole('spinbutton', { name: 'Pointer X' })).toHaveValue('339');
    await expect(stepChip(page, /^Callout/)).toHaveCount(2);
    await inspector(page).getByRole('button', { name: 'Remove callout' }).click();
    await expect(stepChip(page, /^Callout/)).toHaveCount(1);
    await expect(inspector(page).getByRole('heading', { name: 'Step 1', exact: true })).toBeVisible();
  });
});
