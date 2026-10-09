import { expect, test, type Page } from '@playwright/test';
import { openRecording, watchErrors } from './helpers';

test.describe('editor shell', () => {
  test('shows the empty editor with every pane', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle('Waypost');
    await expect(page.getByRole('banner', { name: 'Waypost' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: /Steps/ })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drop a screen recording' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Tools' }).getByRole('button')).toHaveCount(8);
    for (const lane of ['Video', 'Steps', 'Blur', 'Voice', 'Music']) await expect(page.getByLabel(`${lane} lane, empty`)).toBeVisible();
    await expect(page.getByText('0:00.000 / 0:00.000')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('fits a laptop screen without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tools wait for a recording, then keys pick them, but not while typing', async ({ page }) => {
    await page.goto('/');
    const tools = page.getByRole('toolbar', { name: 'Tools' });
    await expect(tools.getByRole('button', { name: 'Pin' })).toBeDisabled();
    await page.keyboard.press('p');
    await expect(tools.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');

    await openRecording(page);
    await page.keyboard.press('p');
    await expect(tools.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true');
    await expect(tools.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Shift+X'); /* Shift isn't a tool chord, so nothing changes */
    await expect(tools.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('b');
    await expect(tools.getByRole('button', { name: 'Box' })).toHaveAttribute('aria-pressed', 'true');

    const name = page.getByRole('textbox', { name: 'Guide name' });
    await name.fill('');
    await name.pressSequentially('vpc');
    await expect(name).toHaveValue('vpc');
    await expect(tools.getByRole('button', { name: 'Box' })).toHaveAttribute('aria-pressed', 'true');

    await tools.getByRole('button', { name: 'Callout' }).click();
    await expect(tools.getByRole('button', { name: 'Callout' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(tools.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Zoom and Blur say they are coming rather than doing nothing', async ({ page }) => {
    await openRecording(page);
    const tools = page.getByRole('toolbar', { name: 'Tools' });
    await expect(tools.getByRole('button', { name: 'Zoom' })).toBeDisabled();
    await expect(tools.getByRole('button', { name: 'Blur' })).toBeDisabled();
    await page.keyboard.press('x');
    await expect(page.getByRole('status').filter({ hasText: 'Blur: blur arrives' })).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('N toggles snapping and Shift+R toggles ripple trim', async ({ page }) => {
    await page.goto('/');
    const snap = page.getByRole('button', { name: 'Snapping' });
    const ripple = page.getByRole('button', { name: 'Ripple trim' });
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('n');
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Shift+R');
    await expect(ripple).toHaveAttribute('aria-pressed', 'false');
  });

  test('icon buttons show their tooltip and shortcut on keyboard focus', async ({ page }) => {
    await openRecording(page);
    await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Callout' }).focus();
    await expect(page.getByRole('tooltip')).toHaveText(/^Callout/);
    /* the visible tooltip carries the key cap */
    await expect(page.locator('[data-radix-popper-content-wrapper] kbd')).toHaveText(/^C/);
  });

  test('inspector tabs switch by click and arrow keys', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nothing selected' })).toBeVisible();
    await page.getByRole('tab', { name: 'Guide' }).click();
    await expect(page.getByRole('heading', { name: 'Guide settings' })).toBeVisible();
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
