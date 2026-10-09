# 04 — Roadmap

Build order for OpenPin. Each phase ends with something usable, and later phases never block earlier ones. Feature IDs (F1–F17) refer to [01-feature-analysis.md](01-feature-analysis.md).

## Phase 0 — Scaffold

- Xcode project (macOS 14.0 deployment target, universal, sandboxed), `DocumentGroup` app with an empty `.openpin` package document.
- Swift packages: `OpenPinCore`, `OpenPinMedia`, `OpenPinVision`, `OpenPinPublish`, `PinKit`.
- `design/tokens.json` plus a generator script → Swift `PKTokens` and `player/src/tokens.css`.
- `player/` with Vite + TypeScript + Vitest skeleton.
- GitHub Actions: macOS build/test, player lint/test/size budget.

**Done when** an empty project opens, saves and reopens, and CI is green on both runners.

## Phase 1 — MVP: pin, annotate, export stills

- F1 import (MOV/MP4/M4V), frame index, filmstrip.
- Player transport with frame stepping and zero-tolerance seeking.
- F3 pin steps; step list (`PKStepCard`); pin markers on the timeline.
- F4 titles and body text.
- F5 annotations: callout, arrow, spotlight, box, click ripple, all through the shared `AnnotationRenderer`.
- F14 PDF export (A4/Letter and 16:9) and F15 PNG export.
- Undo/redo for every edit.

**Done when** you can drop in a QuickTime recording, pin 5 steps, annotate them, and export a PDF and PNGs that match the canvas pixel for pixel (golden-image tests pass).

## Phase 2 — Edit and polish

- F2 timeline editing: trim, split, delete range, per-clip speed (pitch-corrected), with source-time anchoring and orphaned-step warnings.
- F7 blur regions with keyframes, live preview through the custom compositor, and Vision tracking assist.
- F5 zoom per step; F6 reveal-order groups.
- F13 MP4 export (H.264/HEVC, up to 4K) with holds, animated reveals, title captions and original audio.

**Done when** a 2-minute recording with cuts, a 1.5× section, 2 blurred regions and 10 steps exports to a 4K MP4 whose blur is present in every frame (checked by a frame-sampling test).

## Phase 3 — Interactive guide

- `player.js`: state machine, segment/still swap, annotation layer (SVG + HTML), controls, keyboard, `aria-live`, Reduce Motion, Shadow DOM, `[data-openpin]` auto-mount plus `MutationObserver`, lazy loading.
- F9 branding (logo, accent, chrome, control visibility, playback modes); F10 CTA.
- Guide bundle writer in `OpenPinPublish`: segments, stills, `guide.json`, `index.html`, compressed `guide.pdf`.
- F11: "Export guide folder…" plus a copy-embed-snippet sheet (script and iframe variants).
- In-app preview in `WKWebView` using the bundled player.
- Native ↔ web annotation parity tests.

**Done when** an exported folder dropped onto any static host plays correctly in Safari, Chrome and Firefox, embedded in a plain HTML page *and* inside a React app, and the player stays under 40 KB gzipped.

## Phase 4 — Narration and WebP

- F8: keep original audio; import a voice track; record per step in the app; generate voiceover with `AVSpeechSynthesizer` (system voices, Personal Voice on 14+).
- Hold timing driven by narration length; ducking in MP4.
- Narration in the player (per-step audio, "Start guide" overlay to unlock sound).
- F15 WebP export through libwebp.

**Done when** a guide with generated voiceover plays in sync in the player and in MP4, and WebP stills are produced.

## Phase 5 — Publishing and analytics

- Publish adapters: GitHub Pages (token in Keychain, pushes to a `gh-pages` branch), then S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2).
- Stable per-step URLs for hosted WebP and PDF copies.
- F12: player beacons (opt-in per guide), reference Cloudflare Worker + D1 collector with daily-salt visitor hashing, and an in-app Swift Charts funnel of per-step reach.

**Done when** "Publish" from the app produces a working public link and embed snippet, and the stats view shows drop-off for a test guide.

## Phase 6 — Beyond FramePin

- Built-in recorder (ScreenCaptureKit) with click capture → auto-proposed steps and click ripples.
- Auto-redaction suggestions (Vision OCR + patterns).
- Auto step titles (OCR heuristic; Foundation Models polish on macOS 26+).
- Markdown/HTML SOP export.
- Liquid Glass surfaces on macOS 26+.
- Release pipeline: Developer ID signing, notarization, DMG, Sparkle updates, Homebrew cask.

## Open questions for the owner

1. **License:** MIT recommended (see [02-architecture.md](02-architecture.md#distribution)).
2. **Name and icon:** "OpenPin" is distinct from "FramePin", but confirm you're happy with it before designing the icon.
3. **Accent color:** confirm Coral doesn't collide with FramePin's brand color (see [03-design-system.md](03-design-system.md)).
4. **Apple Developer Program:** only needed if you want to give notarized builds to other people.
