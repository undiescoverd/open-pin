# Waypost click capture

A small Chrome extension (Manifest V3) that makes the first draft of a guide for you. While **Waypost records a browser tab**, it notes each click you make in the web app you're recording: where it was, and what it was on (a button's text, a link's text, an `aria-label`, a field's label). When the recording stops, Waypost proposes a step at each click, with a click marker where the click was and a title such as "Click Invite". You keep, merge or drop them, then press **Add steps**.

It is optional. Without it, **Record a tab** is just a recording and every step is made by hand, as before.

## What it does and doesn't do

- **Only logs while Waypost is recording.** Pressing **Record a tab** in Waypost switches it on; stopping switches it off. The toolbar icon shows **REC** the whole time. Nothing is read before or after.
- **Reads names, not content.** For each click it records the time, the position in the page and the name of the thing clicked. It never reads what was typed in a field (a text box is named by its label or placeholder, never its value).
- **Nothing leaves your browser.** The clicks pass from the page to the extension's background script and then to the Waypost editor tab, and that's all. The extension has no network code.
- **Two small scripts.** `capture.js` runs in every page and does nothing until recording; `bridge.js` runs only on the editor's own pages, listed in the manifest. The only permission asked for is `storage` (session storage, so a paused background script doesn't lose the clicks).
- **Top frame only.** Clicks inside an iframe aren't logged yet.

## Install it (until it is in the Chrome Web Store)

1. Build it: `pnpm install`, then `pnpm --filter @waypost/extension build` (or download `waypost-click-capture` from a CI run and unzip it).
2. Open `chrome://extensions`, switch on **Developer mode**, press **Load unpacked** and choose `apps/extension/dist`.
3. Open the Waypost editor. The first-run screen now shows **Suggest a step at each click**.

The build allows the hosted editor (`https://waypost-ac2.pages.dev` and its preview URLs). To use it with the editor running locally, or with a copy you host yourself:

```sh
node apps/extension/scripts/build.mjs --dev                         # also allows http://localhost and http://127.0.0.1
WAYPOST_EDITOR_ORIGINS="https://guides.example.com" pnpm --filter @waypost/extension build
```

## Use it

1. In Waypost, press **Record a tab** and choose the tab to share.
2. Switch to that tab and do the task, clicking as you go.
3. Come back to Waypost and press **Stop recording** (Chrome's own "Stop sharing" works too).
4. Review the proposed steps: untick one to drop it, press the arrow button to fold it into the step above, or retitle it. **Add steps** puts them in the guide; **Skip, I'll add my own** (or Esc) keeps the recording and nothing else.

Clicks made in other tabs are left out: Waypost takes the tab you clicked in most (or the one whose title matches the shared tab). Clicks less than 0.3 seconds apart, and a double click, count as one.

## How it works

```
editor page ── window.postMessage ──▶ bridge.js ── runtime message ──▶ background.js
                                                                          │  arm / disarm every tab
every page:  capture.js ◀──────────────── tab message ────────────────────┘
             capture.js ── click (time, x, y, label) ──▶ background.js (kept in session storage)
editor page ◀── 'stopped' + clicks ── bridge.js ◀──────────── background.js
```

The messages the editor and the bridge exchange are defined, and validated on both ends, in `packages/capture`, which also turns clicks into proposed steps. Clicks are stamped with `Date.now()`, as is the start of Waypost's recording, so a click's place in the video is just the difference. In the video, a step lands 0.15 seconds before its click so the picture shows the screen being clicked, not the one it led to.

## Developing

```sh
pnpm --filter @waypost/extension build     # apps/extension/dist
pnpm --filter @waypost/extension test      # what a click was on (jsdom)
pnpm --filter @waypost/extension run zip   # also writes waypost-click-capture.zip for the Chrome Web Store
```

`apps/editor/e2e/extension.spec.ts` loads the built extension into Chromium and records a stand-in web app with it (only the tab picker is faked).
