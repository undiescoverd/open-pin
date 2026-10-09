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

- F1 import (drag-drop/browse; MP4, MOV, WebM, MKV) into OPFS; frame index and thumbnails in the media worker.
- Canvas preview, transport, exact frame stepping, millisecond timecode.
- F3 Pin tool (click on the frame → step + click marker) and "+ Pin step"; step rail; Steps lane on the timeline.
- F4 titles and notes.
- F5 annotations: callout, arrow, spotlight, box, click marker, all drawn by `@waypost/render`.
- F22 undo/redo; autosave; project list; save/open `.waypost` files.
- F14 PDF export (A4/Letter, 16:9) and F15 PNG/WebP export (zip). F21 copy/save frame.

**Done when** you can drop in a QuickTime recording, pin 5 steps, annotate them, reload the page without losing anything, and export a PDF and PNGs that match the canvas (screenshot tests pass).

## Phase 2 — Edit and polish

- F2 timeline editing: trim, split (R), delete range, per-clip speed (⅓×–5×), with source-time anchoring and orphaned-step warnings. Fit-to-width timeline with zoom.
- F7 blur regions with keyframes (gaussian, pixelate, solid) and a Blur lane.
- F5 zoom/focus per step; F6 reveal-order groups.
- F18 background framing and presets; F19 logo.
- F13 MP4 export in a worker (H.264, up to 4K) with holds, animated reveals, captions, original audio; progress and cancel.

**Done when** a 2-minute recording with cuts, a 2× section, 2 blurred regions, a gradient background and 10 steps exports to a 4K MP4 whose blur is present in every frame (checked by a frame-sampling test).

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
