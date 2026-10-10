# 04 — Roadmap

Build order for the Waypost web app. Each phase ends with something usable, and later phases never block earlier ones. Feature IDs (F1–F22) refer to [01-feature-analysis.md](01-feature-analysis.md).

## Phase 0 — Scaffold

- pnpm monorepo: `apps/editor`, `packages/{core,render,media,export,player,tts,ui}`.
- Vite + React + TypeScript editor shell with the three-pane layout from [03-design-system.md](03-design-system.md) (empty panels).
- `design/tokens.json` plus a generator for CSS custom properties and Tailwind theme; light/dark themes.
- PinKit foundations (`Button`, `IconButton`, `Tooltip`, `KeyCap`, `Surface`) and a `/kit` gallery page.
- GitHub Actions: lint, typecheck, Vitest, Playwright. Deploy to Cloudflare Pages with preview deploys for pull requests.

**Done when** the empty editor loads from a public URL in light and dark themes, and CI is green.

## Phase 1 — MVP: pin, annotate, export stills

**Status: built.** The acceptance test is `apps/editor/e2e/phase1.spec.ts`. Differences from the plan are listed under [Phase 1 as built](#phase-1-as-built) below.

- F1 import (drag-drop/browse; MP4, MOV, WebM, MKV) into OPFS; frame index and thumbnails in the media worker.
- Canvas preview, transport, exact frame stepping, millisecond timecode.
- F3 Pin tool (click on the frame → step + click marker) and "+ Pin step"; step rail; Steps lane on the timeline.
- F4 titles and notes.
- F5 annotations: callout, arrow, spotlight, box, click marker, all drawn by `@waypost/render`.
- F22 undo/redo; autosave; project list; save/open `.waypost` files.
- F14 PDF export (A4/Letter, 16:9) and F15 PNG/WebP export (zip). F21 copy/save frame.

**Done when** you can drop in a QuickTime recording, pin 5 steps, annotate them, reload the page without losing anything, and export a PDF and PNGs that match the canvas (screenshot tests pass).

### Phase 1 as built

- **Stills and the PDF export on the main thread**, not in an export worker. They yield between steps, the frames come from the media worker, and nothing else moves while the busy overlay shows. (MP4 export runs in a worker from Phase 2.)
- **Recordings the browser can't decode** (for example ProRes) are refused with a message. The one-time H.264 editing proxy from the architecture doc isn't built.
- Zoom, Blur, Ripple trim and the Pause setting were placeholders in Phase 1; Phase 2 made them work.
- **The PDF** is checked for page count, size, title and an embedded image per page, and the PNG export is compared pixel for pixel with the canvas. The PDF's pages are not rasterised and compared, so its layout is checked by eye.
- **Annotation snapshots** (`apps/editor/e2e/*-snapshots`) are Linux Chromium renders. Update them with `--update-snapshots` after an intended drawing change.

## Phase 2 — Edit and polish

**Status: built.** The acceptance tests are in `apps/editor/e2e/phase2.spec.ts`. Differences from the plan are listed under [Phase 2 as built](#phase-2-as-built) below.

- F2 timeline editing: trim, split (R), delete range, per-clip speed (⅓×–5×), with source-time anchoring and orphaned-step warnings. Fit-to-width timeline with zoom.
- F7 effect regions with keyframes and an **Effects lane, as in DaVinci Resolve**: any number of regions, any number at once, each with a stack of effects of any length (pixelate, blur, darken, desaturate, tint, solid fill), on layers where higher ones draw on top (docs/05, section 4).
- F5 zoom/focus per step; F6 reveal-order groups.
- F18 background framing and presets; F19 logo.
- F13 MP4 export in a worker (H.264, up to 4K) with holds, animated reveals, captions, original audio; progress and cancel.

**Done when** a 2-minute recording with cuts, a 2× section, 8 effect regions (at least 4 on screen at the same moment, on 4 layers, one with a stack of 3 effects), a gradient background and 10 steps exports to a 4K MP4 whose blur is present in every frame (checked by a frame-sampling test).

### Phase 2 as built

- **The acceptance export is smaller than planned.** The test builds the project the plan describes (cuts, a 2× section, 8 effect regions with 4 on screen at once on 4 layers, two stacks of 3 effects, a gradient background, 10 steps) on the 6-second test recording and exports it at 720p, then decodes every frame and checks each region's effects are there whenever the region is, and absent when it isn't. A 2-minute recording at 4K would take too long in CI with software encoding. 1440p and 4K use the same code with a bigger canvas; the Cancel test starts a 4K export.
- **Codecs.** MP4 export uses H.264 and AAC where the browser can encode them (Chrome and Edge on Mac and Windows). Chromium on Linux, including the one the tests run in, can't, so the export falls back to VP9 and Opus in the same MP4 and says so: that file plays in browsers but may not in QuickTime. H.264 output hasn't been checked by an automated test for this reason.
- **Sound in the MP4** is the recording's own audio under clips at normal speed, at each clip's volume. Sped-up and slowed clips are silent in the video (the preview plays them with the pitch kept); time-stretching without a pitch change is left for later. Pauses and gaps are silent.
- **Only the MP4 export runs in the export worker.** It writes straight into the browser's private file system, so a long 4K video never has to fit in memory, and it has progress and Cancel. Stills and the PDF still render on the main thread.
- **Delete range** is "split twice and delete the clip" (Delete or the Inspector's Delete clip). A clip holding a pinned step can't be deleted, and the only clip can't either. Clips can't be reordered.
- **Orphaned steps are prevented, not warned about**, as in the mockup: trims and typed In and Out stop at a pinned step with a message.
- **Effects** run in the editor with canvas filters and blend modes (blur, desaturate), which the editor's Chromium-based browsers all have. The Phase 3 player won't need them: the guide bundle bakes effects into its frames and segments.
- **Images** (logo, background) are copied into the project's `assets/` folder and into `.waypost` files.
- **Voice and Music lanes** are there, empty, until Phase 4.

## Phase 3 — Interactive guide

**Status: built, tested in Chromium only.** The acceptance tests are in `apps/editor/e2e/phase3.spec.ts`. Safari, Firefox and iPhone Safari still need a check on real browsers before the "done when" below is fully met; see [Phase 3 as built](#phase-3-as-built).

- `@waypost/player`: state machine, segment/still swap, annotations via `@waypost/render`, controls, keyboard, `aria-live`, reduced motion, Shadow DOM, `[data-waypost]` auto-mount, lazy loading.
- F9 branding and playback modes; F10 CTA.
- Guide bundle export (folder via the File System Access API, or zip): segments, stills, `guide.json`, `index.html`, compressed `guide.pdf`.
- F11 embed snippet sheet (script and iframe variants).
- In-editor preview using the same player.

**Done when** an exported folder dropped on any static host plays correctly in Safari, Chrome and Firefox (including iPhone Safari), embedded in a plain HTML page *and* inside a React app, with the player under 60 KB gzipped.

### Phase 3 as built

- **What the tests cover.** A three-step guide is exported as a zip, served from a plain static host (with byte ranges, as real hosts serve video) and played in Chromium: the standalone page from the start card to the end card, with the segments really playing from their files; the two-line embed in a page whose own CSS would break an unprotected widget; a phone-sized screen with touch and reduced motion; and a React app that mounts the guide, re-renders and navigates away. Preview is tested in guided, auto (with pause) and video modes.
- **Not yet tested: Safari, Firefox and iPhone Safari.** Only Chromium runs in this environment and in CI. The player uses only what those browsers have (`<video>`, canvas 2D with `roundRect`, Shadow DOM, container queries, `ResizeObserver`, `IntersectionObserver`). `requestVideoFrameCallback` is used where it exists, and the `playing` event stands in elsewhere. A manual pass on real devices is still owed.
- **Player size:** 13.7 KB gzipped, renderer included. `pnpm build` fails over 60 KB, and CI reports it as its own step.
- **Stills are the recording alone.** `steps/<id>.webp` is the pinned frame with its effect regions burned in, but without framing or logo, at the recording's size (up to 2560 px wide). The player composes the framing, logo, zoom and annotations with `@waypost/render`, so the zoom stays sharp and eases in as in the editor. The architecture doc had framing and logo baked into the still, which would have zoomed the background and logo along with the recording. Segments and `poster.webp` do have framing, effects and logo baked in, so the swap from motion to still lines up.
- **Codecs.** Segments are H.264 where the browser can encode it (Chrome and Edge on Mac and Windows). Chromium on Linux falls back to VP9 in the same MP4, which Chrome and Firefox play but Safari may not; the export says so when it happens.
- **Segments are silent.** Muted, inline video plays everywhere without a tap, iPhone included. Sound in the guide (narration, music, the recording's own audio) comes with Phase 4, along with the "Start guide" tap that unlocks it.
- **Reveal groups appear on a timer** (0.6 s apart, as in the editor's Viewer view), not one per click.
- **Auto and video modes** stay on each step for its pause (and never less than its entrance plus 0.6 s). Both have a pause button. Video mode's progress bar fills in time, with the steps marked where they come.
- **Call to action** shows on the end card, or in the control bar from a chosen step onward and on the end card. It is outlined in the accent colour in the bar, so Next stays the main button. Click events for analytics come with Phase 5.
- **Fullscreen** is the player's element going fullscreen. iPhone has no element fullscreen, so the button hides there.
- **Preview** runs the same player with the same stills, but the motion between steps is the recording drawn live on the player's canvas, as the editor plays it, rather than the encoded segment files. That lets it open at once without encoding anything.
- **Folder export** uses the File System Access API (Chromium), writing a `<guide-name>` folder inside the folder you pick and clearing old stills and segments there. Other browsers get a zip. Playwright can't drive the folder picker, so only the zip path has an automated test.
- **The player checks `guide.json` by hand** (schema version, sizes, steps, paths inside the folder, web-only call-to-action links) rather than with Zod, which would take a large share of the size budget. The editor validates every `guide.json` it writes against the full schema.
- **On a phone**, annotation text scales with the picture like everything else, so a callout is small on a narrow screen. Its text is also read out through the live region.
- **Cross-origin embeds:** when the page and the guide are on different sites, the guide's host must send `Access-Control-Allow-Origin` for the player to fetch `guide.json` and the fonts. GitHub Pages does; `embed.txt` says to use the iframe otherwise.

## Phase 4 — Audio

- F8 narration: keep original audio; import a voice file; record per step in the browser; generate voiceover with Kokoro in a worker (model downloaded on first use, then cached; voice picker with previews).
- Hold timing driven by narration length.
- **Auto-ducking driven by speech detection**: music dips only while someone is actually speaking, detected in recorded and imported narration, in generated voice (Kokoro's output can be analysed, unlike the browser's speech engine), and in the recording's own audio when it's kept.
- F20 background music lane, always the bottom lane, with volume, loop and fades.
- Narration and music in the player ("Start guide" overlay to unlock sound) and in MP4.

**Done when** a guide with generated voiceover and background music plays in sync in the player and in the MP4.

## Phase 5 — Publishing and analytics

- "Share" publishing adapters: GitHub Pages (via a GitHub token you provide, kept in the browser), then S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2).
- Stable per-step URLs for hosted WebP and PDF copies.
- F12: player beacons (opt-in per guide), the reference Cloudflare Worker + D1 collector with daily-salt visitor hashing, and a per-step reach funnel in the editor.
- Purchase and licence-key unlock (see the open questions below).

**Done when** "Share" produces a working public link and embed snippet, and the stats view shows drop-off for a test guide.

## Phase 6 — Beyond FramePin

- Record the screen inside the app (`getDisplayMedia`).
- Click-capture browser extension that proposes steps at each click.
- Auto-redaction suggestions (OCR + patterns) and a blur tracking assist.
- Auto step titles from OCR, with an optional LLM polish using your own API key.
- Markdown/HTML SOP export.
- PWA polish: offline, open `.waypost` files from Finder, "Install Waypost".

## Open questions for the owner

Decided: **Waypost** is the name, it's a **paid one-off purchase** (proprietary code), and the editor is hosted on **Cloudflare Pages**.

Still open:
1. **Name checks:** trademark, domain and app-store searches for "Waypost" before designing the app mark.
2. **Selling:** payment provider (Lemon Squeezy or Paddle issue licence keys and handle VAT; Stripe is cheaper per sale but leaves keys and tax to us), the price, and whether there's a free trial or a free tier.
3. **Unlocking:** a licence key checked online once and then cached, so the editor keeps working offline. Needs a decision on what a locked copy can still do (for example, edit and preview but not export).
4. **Repository visibility:** the repo is public; a paid product would normally make it private.
