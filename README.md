# Waypost

A web app that turns screen recordings into interactive, click-through product guides, with MP4, PDF and screenshot exports too. It's an alternative to [FramePin](https://framepin.com/) that you buy once instead of subscribing to.

**Status:** research and design. No app code yet.

## What it will do

1. Drop in a recording from QuickTime, Loom, ScreenStudio, OBS, Zoom or any other recorder (MP4, MOV, WebM, MKV).
2. Trim mistakes, split sections and change speed with frame-accurate control.
3. Click on the frame to pin a step, then add titles, callouts, arrows, spotlights and zoom.
4. Blur sensitive information with regions that follow it as it moves.
5. Put the recording on a styled background and add your logo.
6. Add narration (keep the original audio, record your voice, or generate a free voiceover that runs in your browser) and background music.
7. Export an interactive guide as a static folder you can host anywhere and embed with two lines of HTML, or export MP4 (up to 4K), PDF or PNG/WebP.

Everything runs in your browser. It's a one-off purchase with no subscription and no server; you host guides on GitHub Pages, Cloudflare Pages, S3 or any static host.

## Platform

- Web app (React + TypeScript). Installable as a desktop app from Chrome, with no code signing or notarization needed.
- **Editor:** current Chrome, Edge, Brave or Arc on any Mac that runs them, including macOS 27 Golden Gate and older releases.
- **Published guides:** play in every modern browser, including Safari on iPhone and iPad.

## Docs

| Doc | Contents |
|---|---|
| [01 — Feature analysis](docs/01-feature-analysis.md) | Every FramePin feature (including ones visible in its editor), how it likely works, how Waypost builds it |
| [02 — Architecture](docs/02-architecture.md) | Browser targets, tech stack, repo layout, data model, threads, rendering pipeline, storage, guide format |
| [03 — Design system and editor UI](docs/03-design-system.md) | What's wrong with FramePin's editor, our layout, "Coral & Graphite" tokens, PinKit components |
| [04 — Roadmap](docs/04-roadmap.md) | Phased build plan with acceptance criteria |
| [05 — Editor interactions](docs/05-editor-interactions.md) | Exact timeline, canvas, Inspector and keyboard behaviour proven in the mockup: time model, trimming and ripple, snapping, playback, undo, acceptance checks |
| [Editor mockup](design/mockup/editor.html) | Clickable single-file mockup of the editor and guide preview (open in Chrome) |

Waypost is an independent clean-room project built from FramePin's public product descriptions. It isn't affiliated with FramePin and uses none of its code or assets.
