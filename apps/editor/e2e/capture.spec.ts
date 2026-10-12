import { expect, test, type Page } from '@playwright/test';
import { fakeExtension, fakeTabSharing, savedProject, type FakeClick } from './capture-helpers';
import { stepRail, watchErrors } from './helpers';

/** Phase 5: record a tab in the app, with the click-capture extension (here a stand-in; see extension.spec.ts for the real one)
    suggesting a step at every click, and without it. */

const FIVE: FakeClick[] = [
  { at: 1000, x: 0.1, y: 0.2, label: 'Invite' },
  { at: 2200, x: 0.3, y: 0.4, label: 'Email', kind: 'field' },
  { at: 3400, x: 0.5, y: 0.6, label: 'Send invite' },
  { at: 4600, x: 0.7, y: 0.5, label: 'Settings', kind: 'link' },
  { at: 5800, x: 0.9, y: 0.8, label: '' },
];

const record = async (page: Page, ms: number) => {
  await page.getByRole('button', { name: 'Record a tab' }).click();
  await expect(page.getByRole('heading', { name: 'Recording a tab' })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Stop recording' }).click();
};

const review = (page: Page) => page.getByRole('dialog', { name: 'Steps from your clicks' });

test.describe('record a tab with click capture', () => {
  test('a five-click task becomes five steps, each with its click marker and a title, with nothing pinned by hand', async ({ page }) => {
    const errors = watchErrors(page);
    await fakeTabSharing(page);
    await fakeExtension(page, FIVE);
    await page.goto('/');
    await expect(page.getByRole('switch', { name: 'Suggest a step at each click' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Want a step at every click?')).toHaveCount(0);

    await record(page, 7500);
    await expect(review(page)).toBeVisible();
    const titles = review(page).getByRole('textbox');
    await expect(titles).toHaveCount(5);
    expect(await titles.evaluateAll(list => list.map(el => (el as HTMLInputElement).value))).toEqual(['Click Invite', 'Click the Email field', 'Click Send invite', 'Click Settings', '']);
    await review(page).getByRole('button', { name: 'Add steps' }).click();
    await expect(review(page)).toBeHidden();

    await expect(stepRail(page).getByRole('listitem')).toHaveCount(5);
    await expect(stepRail(page).getByText('Click Invite')).toBeVisible();
    await expect.poll(async () => (await savedProject(page)).steps.length).toBe(5);
    const project = await savedProject(page);
    expect(project.sources[0]!.duration).toBeGreaterThan(5);
    const steps = project.steps;
    steps.forEach((step, i) => {
      const click = FIVE[i]!;
      expect(step.annotations).toHaveLength(1);
      expect(step.annotations[0]!.type).toBe('click');
      expect(step.annotations[0]!.at[0]).toBeCloseTo(click.x, 2);
      expect(step.annotations[0]!.at[1]).toBeCloseTo(click.y, 2);
      /* just before the click: the recording starts a moment before the stand-in extension, and the step leads its click */
      expect(step.anchor.time).toBeGreaterThan(click.at / 1000 - 0.8);
      expect(step.anchor.time).toBeLessThan(click.at / 1000 + 0.2);
    });
    expect(steps.map(s => s.title)).toEqual(['Click Invite', 'Click the Email field', 'Click Send invite', 'Click Settings', '']);
    expect(errors).toEqual([]);
  });

  test('Esc, or Skip, keeps the plain recording and adds no steps', async ({ page }) => {
    await fakeTabSharing(page);
    await fakeExtension(page, FIVE.slice(0, 2));
    await page.goto('/');
    await record(page, 2800);
    await expect(review(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(review(page)).toBeHidden();
    await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
    await expect(stepRail(page).getByRole('listitem')).toHaveCount(0);
    expect((await savedProject(page)).steps).toEqual([]);
  });

  test('Skip, I\'ll add my own does the same', async ({ page }) => {
    await fakeTabSharing(page);
    await fakeExtension(page, FIVE.slice(0, 2));
    await page.goto('/');
    await record(page, 2800);
    await review(page).getByRole('button', { name: "Skip, I'll add my own" }).click();
    await expect(review(page)).toBeHidden();
    await expect(stepRail(page).getByRole('listitem')).toHaveCount(0);
  });

  test('a click can be dropped, retitled or merged into the one above', async ({ page }) => {
    await fakeTabSharing(page);
    await fakeExtension(page, FIVE.slice(0, 4));
    await page.goto('/');
    await record(page, 6200);
    await expect(review(page).getByRole('textbox')).toHaveCount(4);
    /* the first can't merge into anything; the second is folded into it; the third is dropped; the fourth is retitled */
    await expect(review(page).getByRole('button', { name: 'Merge step 1 into the step above' })).toBeDisabled();
    await review(page).getByRole('button', { name: 'Merge step 2 into the step above' }).click();
    await review(page).getByRole('checkbox', { name: 'Keep step 3' }).uncheck();
    await review(page).getByRole('textbox', { name: 'Step 4 title' }).fill('Open Settings');
    await review(page).getByRole('button', { name: 'Add steps' }).click();

    await expect.poll(async () => (await savedProject(page)).steps.length).toBe(2);
    const steps = (await savedProject(page)).steps;
    expect(steps.map(s => s.title)).toEqual(['Click Invite', 'Open Settings']);
    expect(steps[0]!.annotations.map(a => [a.type, a.reveal])).toEqual([['click', 0], ['click', 1]]);
    expect(steps[0]!.annotations[1]!.at[0]).toBeCloseTo(0.3, 2);
    /* one undo takes them all away */
    await page.keyboard.press('ControlOrMeta+z');
    await expect(stepRail(page).getByRole('listitem')).toHaveCount(0);
  });

  test('the switch turns suggestions off for good, and a recording then has no review', async ({ page }) => {
    await fakeTabSharing(page);
    await fakeExtension(page, FIVE.slice(0, 2));
    await page.goto('/');
    await page.getByRole('switch', { name: 'Suggest a step at each click' }).click();
    await expect(page.getByRole('switch', { name: 'Suggest a step at each click' })).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Suggest a step at each click' })).toHaveAttribute('aria-checked', 'false');
    await record(page, 1500);
    await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await expect(stepRail(page).getByRole('listitem')).toHaveCount(0);
  });

  test('a recording with no clicks in it says so and goes straight to the editor', async ({ page }) => {
    await fakeTabSharing(page);
    await fakeExtension(page, []);
    await page.goto('/');
    await record(page, 1500);
    await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
    await expect(page.getByText(/No clicks were captured/)).toBeVisible();
    await expect(review(page)).toHaveCount(0);
  });
});

test.describe('record a tab without the extension', () => {
  test('it is just a recording: no switch, no review, no steps', async ({ page }) => {
    const errors = watchErrors(page);
    await fakeTabSharing(page);
    await page.goto('/');
    await expect(page.getByRole('switch', { name: 'Suggest a step at each click' })).toHaveCount(0);
    await record(page, 2000);
    await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await expect(stepRail(page).getByRole('listitem')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the offer to install it is one quiet line; Not now stops it for good', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Want a step at every click?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add the Waypost extension' })).toHaveAttribute('href', /apps\/extension/);
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText('Want a step at every click?')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Choose a recording…' })).toBeVisible();
    await expect(page.getByText('Want a step at every click?')).toHaveCount(0);
  });

  test('Drop a recording stays the main action, with Record a tab beside it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Drop a screen recording here' })).toBeVisible();
    const buttons = page.getByRole('main').getByRole('button');
    await expect(buttons.filter({ hasText: /Choose a recording|Record a tab|Open a project file/ })).toHaveText(['Choose a recording…', 'Record a tab', 'Open a project file…']);
    await expect(page.getByRole('button', { name: 'Choose a recording…' })).toHaveClass(/bg-primary/);
    await expect(page.getByRole('button', { name: 'Record a tab' })).not.toHaveClass(/bg-primary/);
  });

  test('closing the picker without choosing a tab changes nothing', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Record a tab' }).click();
    await expect(page.getByRole('heading', { name: 'Drop a screen recording here' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
