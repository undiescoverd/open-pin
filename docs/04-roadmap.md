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

- **Export runs on the main thread**, not in an export worker. It yields between steps, the frames come from the media worker, and nothing else moves while the busy overlay shows. Moving it to a worker is a Phase 2 task, since MP4 needs one anyway. There is no cancel button yet for the same reason.
- **Recordings the browser can't decode** (for example ProRes) are refused with a message. The one-time H.264 editing proxy from the architecture doc isn't built.
- **Zoom and Blur tools** are in the palette but disabled; their keys say they're coming. The Ripple trim button is a placeholder until clip trimming.
- **Pause (`minHold`)** is stored and editable per step, but nothing uses it until the guide and MP4 exports.
- **The PDF** is checked for page count, size, title and an embedded image per page, and the PNG export is compared pixel for pixel with the canvas. The PDF's pages are not rasterised and compared, so its layout is checked by eye.
- **Annotation snapshots** (`apps/editor/e2e/*-snapshots`) are Linux Chromium renders. Update them with `--update-snapshots` after an intended drawing change.

## Phase 2 — Edit and polish

- F2 timeline editing: trim, split (R), delete range, per-clip speed (⅓×–5×), with source-time anchoring and orphaned-step warnings. Fit-to-width timeline with zoom.
- F7 effect regions with keyframes and an **Effects lane, as in DaVinci Resolve**: any number of regions, any number at once, each with a stack of effects of any length (pixelate, blur, darken, desaturate, tint, solid fill), on layers where higher ones draw on top (docs/05, section 4).
- F5 zoom/focus per step; F6 reveal-order groups.
- F18 background framing and presets; F19 logo.
- F13 MP4 export in a worker (H.264, up to 4K) with holds, animated reveals, captions, original audio; progress and cancel.

**Done when** a 2-minute recording with cuts, a 2× section, 8 effect regions (at least 4 on screen at the same moment, on 4 layers, one with a stack of 3 effects), a gradient background and 10 steps exports to a 4K MP4 whose blur is present in every frame (checked by a frame-sampling test).

## Phase 3 — Interactive guide

- `@waypost/player`: state machine, segment/still swap, annotations via `@waypost/render`, controls, keyboard, `aria-live`, reduced motion, Shadow DOM, `[data-waypost]` auto-mount, lazy loading.
- F9 branding and playback modes; F10 CTA.
- Guide bundle export (folder via the File System Access API, or zip): segments, stills, `guide.json`, `index.html`, compressed `guide.pdf`.
- F11 embed snippet sheet (script and iframe variants).
- In-editor preview using the same player.

**Done when** an exported folder dropped on any static host plays correctly in Safari, Chrome and Firefox (including iPhone Safari), embedded in a plain HTML page *and* inside a React app, with the player under 60 KB gzipped.

## Phase 4 — Audio

- F8 narration: keep original audio; import a voice file; record per step in the browser; generate voiceover with Kokoro in a worker (model downloaded on first use, then cached; voice picker with previews).
- Hold timing driven by narration length; ducking.
- F20 background music lane with volume, loop, fades and ducking.
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
