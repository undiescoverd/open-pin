import { expect, test, type Page } from '@playwright/test';
import { addButton, openRecording, watchErrors } from './helpers';

test.describe('editor shell', () => {
  test('first run is one drop zone with the shape of the job; the editor appears with a recording', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle('Waypost');
    await expect(page.getByRole('heading', { name: 'Drop a screen recording here' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a recording…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open a project file…' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'How it works' }).getByRole('listitem')).toHaveText(['1Add steps', '2Explain each one', '3Export']);
    /* nothing else until there is a recording */
    for (const pane of [/Steps/, 'Inspector']) await expect(page.getByRole('complementary', { name: pane })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Filmstrip' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);

    await openRecording(page, { fullTimeline: false });
    await expect(page.getByRole('banner', { name: 'Waypost' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: /Steps/ })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filmstrip' })).toBeVisible();
    await expect(page.getByRole('group', { name: /^Add to/ }).getByRole('button')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test('the next-step hint under the frame suggests one thing at a time, then goes quiet', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    const hint = page.getByTestId('next-hint');
    await expect(hint).toHaveText('Press Add step where the viewer should click', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(hint).toHaveText('Give step 1 a title', { timeout: 10_000 });
    await page.getByRole('complementary', { name: /Steps/ }).getByRole('textbox', { name: 'Title' }).fill('Open the menu');
    await expect(hint).toHaveText('Preview it, then Export', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(hint).toHaveCount(0);
  });

  test('fits a laptop screen without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Add buttons come with a recording, then keys pick the drawing tools, but not while typing', async ({ page }) => {
    await page.goto('/');
    await expect(addButton(page, 'Click')).toHaveCount(0);
    await page.keyboard.press('p');
    const armed = page.locator('[data-armed]');
    await expect(armed).toHaveCount(0);

    await openRecording(page);
    await page.keyboard.press('p');
    await expect(armed).toHaveText('Click');
    await page.keyboard.press('Shift+X'); /* Shift isn't a tool chord, so nothing changes */
    await expect(armed).toHaveText('Click');
    await page.keyboard.press('h');
    await expect(armed).toHaveText('Highlight');

    const name = page.getByRole('textbox', { name: 'Guide name' });
    await name.fill('');
    await name.pressSequentially('vpc');
    await expect(name).toHaveValue('vpc');
    await expect(armed).toHaveText('Highlight');

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await expect(armed).toHaveCount(0);
  });

  test('Z and X pick the Zoom and Hide tools', async ({ page }) => {
    await openRecording(page);
    const armed = page.locator('[data-armed]');
    await page.keyboard.press('z');
    await expect(armed).toHaveText('Zoom');
    await page.keyboard.press('x');
    await expect(armed).toHaveText('Hide');
    await page.keyboard.press('Escape');
    await expect(armed).toHaveCount(0);
  });

  test('N toggles snapping and Shift+R toggles ripple trim', async ({ page }) => {
    await openRecording(page); /* the switches are in the full timeline */
    const snap = page.getByRole('button', { name: 'Snapping' });
    const ripple = page.getByRole('button', { name: 'Ripple trim' });
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('n');
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Shift+R');
    await expect(ripple).toHaveAttribute('aria-pressed', 'false');
  });

  test('Add buttons show their tooltip and shortcut on keyboard focus', async ({ page }) => {
    await openRecording(page);
    await addButton(page, 'Callout').focus();
    await expect(page.getByRole('tooltip')).toHaveText(/^Callout/);
    /* the visible tooltip carries the key cap */
    await expect(page.locator('[data-radix-popper-content-wrapper] kbd')).toHaveText(/^C/);
  });

  test('inspector tabs switch by click and arrow keys', async ({ page }) => {
    await openRecording(page, { fullTimeline: false });
    await expect(page.getByRole('heading', { name: 'Nothing selected' })).toBeVisible();
    await page.getByRole('tab', { name: 'Canvas' }).click();
    await expect(page.getByRole('heading', { name: 'Canvas', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Inspector' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Nothing selected' })).toBeVisible();
  });
});

test.describe('themes', () => {
  const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT_APP = 'rgb(236, 239, 243)'; /* ink-100 */
  const DARK_APP = 'rgb(14, 17, 22)'; /* ink-950 */

  test('follows the system, then light, then dark, and remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await bg(page)).toBe(DARK_APP);

    const button = page.getByRole('button', { name: /^Theme/ });
    await expect(button).toHaveAccessibleName('Theme: match the system');
    await button.click();
    await expect(button).toHaveAccessibleName('Theme: light');
    expect(await bg(page)).toBe(LIGHT_APP);

    await page.reload();
    expect(await bg(page)).toBe(LIGHT_APP);

    await page.getByRole('button', { name: /^Theme/ }).click();
    expect(await bg(page)).toBe(DARK_APP);
    await page.getByRole('button', { name: /^Theme/ }).click();
    await expect(page.getByRole('button', { name: /^Theme/ })).toHaveAccessibleName('Theme: match the system');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await bg(page)).toBe(LIGHT_APP);
  });
});

test.describe('component gallery', () => {
  test('/kit shows every component in both themes', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/kit');
    await expect(page.getByRole('heading', { name: 'PinKit', level: 1 })).toBeVisible();
    for (const theme of ['Light theme', 'Dark theme']) {
      const region = page.getByRole('region', { name: theme });
      await expect(region.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
      await expect(region.getByRole('button', { name: 'Undo' })).toBeVisible();
    }
    const darkBg = await page.getByRole('region', { name: 'Dark theme' }).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(darkBg).toBe('rgb(14, 17, 22)');
    expect(errors).toEqual([]);
  });
});
