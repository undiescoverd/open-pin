import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fakeTabSharing, savedProject } from './capture-helpers';
import { stepRail, watchErrors } from './helpers';

/** The real click-capture extension, loaded into Chromium, against a stand-in for the web app being recorded. Only the tab picker
    is faked (a headless browser has no tab to share); the extension's scripts, its bridge on the editor and the clicks it logs in
    another tab are the ones that ship. */

const EDITOR = 'http://localhost:4173/';
const APP = 'http://waypost-app.test/';
const DOCS = 'http://waypost-docs.test/';

const APP_HTML = `<!doctype html><title>Acme · Dashboard</title>
<body style="margin:0;font:16px sans-serif">
<main style="padding:40px">
  <button id="invite" style="position:absolute;left:100px;top:120px;width:120px;height:40px">Invite</button>
  <label for="email" style="position:absolute;left:100px;top:200px">Email</label>
  <input id="email" type="text" value="private@example.com" style="position:absolute;left:100px;top:230px;width:240px;height:32px">
  <a href="#settings" style="position:absolute;left:100px;top:320px">Settings</a>
</main>`;

let profile: string;
let dist: string;
let context: BrowserContext;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'waypost-extension-'));
  execFileSync('node', ['../extension/scripts/build.mjs', '--dev', `--out=${dist}`], { stdio: 'pipe' });
});

test.beforeEach(async () => {
  /* a new browser profile each time, so no project from an earlier test is waiting to reopen */
  profile = mkdtempSync(path.join(tmpdir(), 'waypost-profile-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  for (const origin of [APP, DOCS]) {
    await context.route(`${origin}**`, route => route.fulfill({ contentType: 'text/html', body: origin === APP ? APP_HTML : '<!doctype html><title>Help centre</title><button style="width:200px;height:100px">Contact us</button>' }));
  }
});

test.afterEach(async () => {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
});

test.afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

/** The text on the extension's toolbar icon, read from inside its service worker. */
const badge = (worker: Worker): Promise<string> =>
  worker.evaluate(() => (globalThis as unknown as { chrome: { action: { getBadgeText(details: object): Promise<string> } } }).chrome.action.getBadgeText({}));

async function openEditor(): Promise<Page> {
  const editor = await context.newPage();
  await fakeTabSharing(editor);
  await editor.goto(EDITOR);
  return editor;
}

test('the extension announces itself, and a click in the recorded tab becomes a step with the right title and place', async () => {
  const editor = await openEditor();
  const errors = watchErrors(editor);
  await expect(editor.getByRole('switch', { name: 'Suggest a step at each click' })).toBeVisible();
  await expect(editor.getByText('Want a step at every click?')).toHaveCount(0);

  const app = await context.newPage();
  await app.goto(APP);

  await editor.bringToFront();
  await editor.getByRole('button', { name: 'Record a tab' }).click();
  await expect(editor.getByRole('heading', { name: 'Recording a tab' })).toBeVisible();

  /* a tab opened after recording started is logged too, but the tab clicked in most is the recorded one */
  const docs = await context.newPage();
  await docs.goto(DOCS);

  await app.bringToFront();
  const box = async (selector: string) => (await app.locator(selector).boundingBox())!;
  const centre = async (selector: string) => {
    const b = await box(selector);
    return [(b.x + b.width / 2) / 1280, (b.y + b.height / 2) / 720] as const;
  };
  const invite = await centre('#invite');
  await app.locator('#invite').click();
  await app.waitForTimeout(1300);
  const email = await centre('#email');
  await app.locator('#email').click();
  await app.waitForTimeout(1300);
  await docs.bringToFront();
  await docs.getByRole('button', { name: 'Contact us' }).click();
  await app.bringToFront();
  await app.waitForTimeout(1300);
  const settings = await centre('a');
  await app.locator('a').click();
  await app.waitForTimeout(1200);

  await editor.bringToFront();
  await editor.getByRole('button', { name: 'Stop recording' }).click();
  const review = editor.getByRole('dialog', { name: 'Steps from your clicks' });
  await expect(review).toBeVisible();
  const titles = review.getByRole('textbox');
  await expect(titles).toHaveCount(3);
  expect(await titles.evaluateAll(list => list.map(el => (el as HTMLInputElement).value))).toEqual(['Click Invite', 'Click the Email field', 'Click Settings']);
  await review.getByRole('button', { name: 'Add steps' }).click();

  await expect(stepRail(editor).getByRole('listitem')).toHaveCount(3);
  await expect.poll(async () => (await savedProject(editor)).steps.length).toBe(3);
  const steps = (await savedProject(editor)).steps;
  [invite, email, settings].forEach(([x, y], i) => {
    expect(steps[i]!.annotations[0]!.at[0]).toBeCloseTo(x, 2);
    expect(steps[i]!.annotations[0]!.at[1]).toBeCloseTo(y, 2);
  });
  /* what was typed in the field is nowhere in the project */
  expect(JSON.stringify(steps)).not.toContain('private@example.com');
  expect(errors).toEqual([]);
});

test('the REC badge is up while recording and gone after, and clicks outside a recording are not kept', async () => {
  const editor = await openEditor();
  await expect(editor.getByRole('switch', { name: 'Suggest a step at each click' })).toBeVisible();
  const app = await context.newPage();
  await app.goto(APP);
  /* before recording: a click is not logged */
  await app.locator('#invite').click();

  await editor.bringToFront();
  await editor.getByRole('button', { name: 'Record a tab' }).click();
  const [worker] = context.serviceWorkers();
  await expect.poll(() => badge(worker!)).toBe('REC');
  await app.bringToFront();
  await app.waitForTimeout(600);
  await app.locator('a').click();
  await app.waitForTimeout(800);
  await editor.bringToFront();
  await editor.getByRole('button', { name: 'Stop recording' }).click();
  const review = editor.getByRole('dialog', { name: 'Steps from your clicks' });
  await expect(review.getByRole('textbox')).toHaveCount(1);
  await expect.poll(() => badge(worker!)).toBe('');
  await review.getByRole('button', { name: 'Skip, I\'ll add my own' }).click();
});
