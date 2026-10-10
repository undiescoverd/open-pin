# 02 — Architecture

How Waypost is built as a web app: browser targets, tech stack, repo layout, data model, threading, rendering pipeline, storage, the published guide format, hosting and testing.

## Decisions at a glance

| Decision | Choice | Why |
|---|---|---|
| App type | **Static web app** (installable as a PWA) | No code signing, no notarization, no Apple Developer fee, no Xcode. Anyone can use it from a link. |
| Backend | **None** | Everything runs in the browser; guides are static files you host anywhere. That's what lets Waypost be a one-off purchase rather than a subscription. |
| Editor browsers | **Chromium-based desktop browsers** (Chrome, Edge, Brave, Arc), current versions | Needs WebCodecs, the File System Access API, OffscreenCanvas in workers, and WebP encoding. FramePin has the same requirement. Safari and Firefox get a clear "best in Chrome" notice. |
| Player browsers | **All modern browsers**, including Safari on iPhone and iPad | The player only needs `<video>`, canvas and Shadow DOM. |
| Language | TypeScript everywhere | Editor, player, renderer and workers share types and code. |
| UI | React + our own **PinKit** components on Radix primitives, styled with Tailwind using our tokens | Accessible behavior from Radix, our own look on top (see [03-design-system.md](03-design-system.md)). |
| Media engine | **Mediabunny** (MPL-2.0) on top of WebCodecs | Reads and writes MP4/MOV/WebM/MKV, frame-accurate decoding, hardware-accelerated encoding, streaming I/O for large files. |
| Rendering | One canvas renderer (`@waypost/render`) for editor, player and every export | What you see is exactly what you export and what viewers get. |

### What about macOS versions?

The app runs in the browser, so the Mac requirement is "any Mac that runs a current Chrome or Edge". That covers macOS 27 Golden Gate and several older releases. The browser vendor handles OS support. Guide viewers need nothing beyond an ordinary up-to-date browser on any device.

## Tech stack

Versions current on npm at the time of writing; licenses checked from package metadata.

| Package | License | Role |
|---|---|---|
| React 19 | MIT | Editor UI |
| Vite | MIT | Dev server and builds (editor app and player library) |
| TypeScript | Apache-2.0 | Language |
| Tailwind CSS 4 | MIT | Styling, configured from our design tokens |
| Radix UI primitives | MIT | Accessible headless dialogs, menus, popovers, tabs, sliders, tooltips |
| Lucide | ISC | Icons (editor and player) |
| Zustand 5 + Immer | MIT | App state; Immer patches power undo/redo |
| Zod | MIT | Validates `project.json` and `guide.json` on load |
| Mediabunny | MPL-2.0 | Demux/mux, decode/encode through WebCodecs, frame-exact reads |
| @mediabunny/aac-encoder | MPL-2.0 | AAC fallback where the browser can't encode AAC |
| Comlink | Apache-2.0 | Simple calls into Web Workers |
| pdf-lib (+ fontkit) | MIT | PDF export with embedded fonts and selectable text |
| fflate | MIT | Zip for `.waypost` project files, screenshot sets and guide bundles |
| kokoro-js | Apache-2.0 | On-device text-to-speech (model fetched on first use, then cached) |
| vite-plugin-pwa | MIT | Installable app, offline support |
| Vitest, Playwright | MIT / Apache-2.0 | Unit tests, browser tests, screenshot comparisons |

MPL-2.0 is file-level copyleft: we can use Mediabunny in a closed-source commercial app. Only changes made *inside* Mediabunny's own files would have to be published, and we won't be modifying them.

## Repo layout (pnpm workspaces)

```
waypost/
├─ apps/
│  └─ editor/              React app: screens, panels, timeline, canvas interactions
├─ packages/
│  ├─ core/                Pure TS: project model, schemas, time mapping, segments/holds,
│  │                       commands + undo. No DOM, no media. Fast unit tests.
│  ├─ render/              Canvas compositor: background, blur, zoom, annotations, logo,
│  │                       captions. Used by editor, player, and exports.
│  ├─ media/               Mediabunny wrappers: import, frame index, thumbnails, frame reads,
│  │                       MP4 encode, audio mix. Runs in workers.
│  ├─ export/              PNG/WebP, PDF, MP4 jobs, guide bundle writer, zip
│  ├─ player/              Embeddable guide player (built to a single player.js)
│  ├─ tts/                 Kokoro worker wrapper + voice list
│  └─ ui/                  PinKit: tokens + React components (see 03-design-system.md)
├─ workers/
│  └─ analytics/           Optional reference collector (Cloudflare Worker + D1)
├─ design/tokens.json      Single source of truth for colors/spacing/radii/motion
└─ docs/
```

## Data model

A project is a folder in the browser's private file system (OPFS). Saved to disk it becomes one `.waypost` file (a zip of the same folder):

```
Onboarding.waypost  (zip)
├─ project.json        the document (below)
├─ sources/            the recording(s)
├─ audio/              recorded/imported narration, music, generated TTS (TTS is regenerable)
├─ assets/             logo, background image
└─ cache/              frame index, thumbnails (regenerable; left out of the zip)
```

`project.json` (abridged):

```json
{
  "schema": "waypost.project/1",
  "sources": [{ "id": "src1", "file": "sources/recording.mov", "duration": 17.775, "size": [2880, 1800] }],
  "timeline": [
    { "id": "c1", "source": "src1", "in": 0.0, "out": 9.2,    "speed": 1 },
    { "id": "c2", "source": "src1", "in": 9.2, "out": 17.775, "speed": 2 }
  ],
  "steps": [
    {
      "id": "s_open-settings",
      "anchor": { "source": "src1", "time": 4.98 },
      "title": "Open Settings",
      "body": "It's at the bottom of the sidebar.",
      "narration": { "mode": "tts", "voice": "af_heart" },
      "minHold": 2.5,
      "zoom": { "rect": [0.0, 0.2, 0.45, 0.45] },
      "annotations": [
        { "id": "a1", "type": "click", "at": [0.064, 0.44], "reveal": 0 },
        { "id": "a2", "type": "callout", "anchor": [0.07, 0.46], "text": "Open Settings", "placement": "right", "reveal": 1 }
      ]
    }
  ],
  "blurs": [
    { "id": "b1", "layer": 0,
      "effects": [ { "type": "pixelate", "on": true, "amount": 45 }, { "type": "darken", "on": true, "amount": 25 } ],
      "keyframes": [ { "source": "src1", "time": 1.0, "rect": [0.93, 0.03, 0.05, 0.07] },
                     { "source": "src1", "time": 9.0, "rect": [0.93, 0.03, 0.05, 0.07] } ] }
  ],
  "frame": { "aspect": "source", "padding": 0.06, "background": { "type": "gradient", "preset": "dusk" }, "cornerRadius": 12, "shadow": true },
  "logo": { "image": "assets/logo.svg", "corner": "br", "size": 0.08, "opacity": 0.9 },
  "audio": { "keepOriginal": true, "music": { "file": "audio/music.mp3", "volume": 0.25, "duck": true } },
  "guide": {
    "playback": { "mode": "guided", "controls": ["prev", "next", "counter", "progress", "fullscreen"] },
    "branding": { "accent": "#FF5A4E", "chrome": "auto" },
    "cta": { "label": "Start free trial", "url": "https://example.com/signup", "showAt": "end" },
    "analytics": { "endpoint": null }
  }
}
```

Rules:
- **Geometry is normalized** (0–1 of the recording frame, independent of padding), so it scales to any output and survives framing changes.
- **Time anchors are source time**, never timeline time (see F2 in [01-feature-analysis.md](01-feature-analysis.md#f2--trim-split-and-speed-with-frame-level-control)).
- **IDs are stable strings.** Published file names use step IDs, so links survive reordering.
- `schema` is versioned; `@waypost/core` holds a migration per version, and Zod validates on load.

### State, commands and undo

The open project lives in a Zustand store. Every edit is a named command (`pinStep`, `moveAnnotation`, `splitClip`…) that changes the state through Immer's `produceWithPatches`. The inverse patches go on the undo stack, which gives exact undo/redo for every edit with little code, and labels for the menu ("Undo Move Arrow"). Autosave writes `project.json` to OPFS a moment after each change.

## Threads

Keeping the UI smooth while decoding 4K video means heavy work stays off the main thread:

| Thread | Work |
|---|---|
| Main | React UI, canvas interactions, preview `<video>`, drawing the current frame |
| Media worker | Import, frame index, thumbnails, exact frame reads for pause/scrub |
| Export worker | PNG/WebP/PDF/MP4 rendering on an `OffscreenCanvas`, encoding, zipping; reports progress, supports cancel |
| TTS worker | Kokoro model loading and speech generation |

Workers are called through Comlink, so they look like async functions.

## Preview playback

- **Playing:** a hidden `<video>` element plays the source. `requestVideoFrameCallback` delivers each frame, which the compositor draws onto the visible canvas with blur, zoom, framing, logo and annotations. Clip edits are applied live: crossing a cut jumps to the next clip and sets `playbackRate` for its speed.
- **Paused or scrubbing:** the exact frame is decoded by Mediabunny in the media worker (using the frame index) and drawn. The paused frame is therefore always the frame that will be pinned and exported.
- **Unsupported codecs:** if `<video>` can't play the source (for example ProRes), a one-time H.264 editing proxy is made on import. Exports always read the original.

## Rendering pipeline

```
 source file (OPFS)
      │ Mediabunny Input (demux) → WebCodecs decode
      ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ @waypost/render — compose(frameImage, t, project, options)    │
 │  1. background + padding + rounded corners + shadow   (F18)   │
 │  2. recording frame with blur regions at source time  (F7)    │
 │  3. zoom/focus transform                               (F5)   │
 │  4. annotations at reveal progress                     (F5/F6)│
 │  5. logo                                               (F19)  │
 │  6. step title caption (MP4 only)                      (F13)  │
 └───────┬─────────────────┬────────────────┬───────────────┬────┘
         ▼                 ▼                ▼               ▼
   Editor canvas     MP4 export       Stills: PNG/WebP   Guide bundle
   (main thread)     (worker; H.264/  (convertToBlob)    (worker: steps 1–3 + 5 baked
                     HEVC via Media-   PDF (pdf-lib)      into seg/*.mp4 and steps/*.webp;
                     bunny + audio                        player draws step 4 live with
                     from Offline-                        the SAME render package)
                     AudioContext)
```

Annotation text uses a bundled Figtree font (WOFF2), so canvas output is identical on every OS.

## Storage

- **Projects:** OPFS folders (fast, private to the app's origin, large quota). A small IndexedDB table lists projects with thumbnails and dates.
- **Persistence:** on first project, call `navigator.storage.persist()` so the browser doesn't evict data under storage pressure.
- **Saving to disk:** "Save project" writes a `.waypost` zip. In Chrome this uses `showSaveFilePicker`, and the file handle is remembered so later saves go to the same file. Other browsers download it.
- **Opening from Finder:** the installed PWA registers as a handler for `.waypost` files (Chrome's file-handling support for installed web apps).
- **Warning in the UI:** "Projects live in this browser. Save a .waypost file to keep a copy." Clearing site data deletes unsaved projects.

## The published guide bundle

```
<guide-slug>/
├─ index.html            standalone page (also the iframe target)
├─ player.js             @waypost/player (includes @waypost/render)
├─ guide.json            schema "waypost.guide/1": steps, annotations, branding, cta, analytics
├─ guide.pdf             compressed PDF copy
├─ steps/<step-id>.webp  exact pinned frame (framing/blur/logo baked in, no annotations)
├─ seg/<step-id>.mp4     motion leading into the step (H.264 for universal playback), ≤1920 px wide by default
└─ audio/<step-id>.m4a   optional narration (+ audio/music.m4a)
```

Embed:

```html
<div data-waypost="https://you.github.io/guides/onboarding/guide.json"></div>
<script src="https://you.github.io/guides/onboarding/player.js" async></script>
```

### Player internals

- Built with Vite in library mode into one file. No framework. Budget: **< 60 KB gzipped** including the renderer (fonts load separately and are cached).
- Mounts in a **Shadow DOM**; CSS custom properties come from `design/tokens.json` plus the guide's accent color.
- State machine: `idle → playingSegment(n) → atStep(n, revealGroup) → … → end`.
- At a segment's `ended` event it swaps to the still (no seek drift). Where `requestVideoFrameCallback` is supported, it hides the swap seam.
- Preloads the next segment and still while the viewer reads the current step.
- Annotations are drawn on a canvas over the stage, plus a visually hidden text layer for screen readers.

## Hosting the editor

- A static build deployed to **Cloudflare Pages** (free plan). Pull requests get preview deploys. GitHub Pages isn't used: its terms don't allow hosting a commercial product.
- Cloudflare Pages can set custom response headers, which keeps the door open for cross-origin isolation if we ever need multithreaded WebAssembly (`SharedArrayBuffer`). GitHub Pages can't set headers; the `coi-serviceworker` workaround exists if needed.
- The editor is a PWA: "Install Waypost" in Chrome gives it its own window and Dock icon, works offline, and opens `.waypost` files from Finder.
- No desktop wrapper is planned. A wrapper (Tauri or Electron) would bring code signing and notarization back.

## Testing

- **`@waypost/core` unit tests (Vitest):** time mapping, segments and holds, schema migrations, command undo round-trips. No browser needed.
- **`@waypost/render` screenshot tests (Playwright):** render each annotation type, blur style, framing preset and zoom state to PNG and compare with checked-in references. Because the editor, player and exports share this renderer, these tests cover all of them.
- **Media tests (Playwright, in a real browser):** small fixture recordings (a few seconds), including a variable-frame-rate one. Check the frame index, exact frame reads and exported durations.
- **End-to-end (Playwright):** import → pin 3 steps → annotate → export guide → load the bundle in a test page and click through it.
- **Codec caveat:** Playwright's bundled Chromium on Linux lacks the proprietary H.264/AAC codecs. Media tests use VP9/WebM fixtures there; H.264 and AAC paths are tested on a runner using the real Chrome channel.

### CI (GitHub Actions)

- Lint, typecheck, unit tests, player size budget.
- Playwright screenshot and end-to-end tests (Chromium; plus a real-Chrome job for H.264/AAC).
- On merge to `main`: deploy the editor to Cloudflare Pages, and give pull requests preview deploys.

## Development environment

Node 22 + pnpm. `pnpm dev` runs the editor locally; `pnpm check` runs what CI runs (tokens, lint, typecheck, unit tests, build) and `pnpm test:e2e` the browser tests. The whole project builds and runs on any OS, including the Linux cloud environment these docs were written in (Chromium for Playwright is pre-installed there).

## License and sales

Waypost is proprietary and sold as a one-off purchase; the code isn't open source. Every dependency above allows use in a closed-source commercial app: MIT, ISC and Apache-2.0 freely, MPL-2.0 (Mediabunny) as long as we don't modify its own files, and Figtree under the SIL Open Font License, which allows bundling the font. How purchases unlock the app is an open question in [04-roadmap.md](04-roadmap.md).
