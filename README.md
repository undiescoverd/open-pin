# OpenPin

An open-source Mac app that turns screen recordings into interactive, click-through product guides, plus MP4, PDF and screenshot exports. It's a free, self-hosted alternative to [FramePin](https://framepin.com/).

**Status:** research and design. No app code yet.

## What it will do

1. Drop in a recording from QuickTime, Loom, ScreenStudio, OBS, Zoom or any other recorder.
2. Trim mistakes, split sections and change speed with frame-accurate control.
3. Pin the frames that matter as steps, and add titles, callouts, arrows, spotlights and zoom.
4. Blur sensitive information with regions that follow it as it moves.
5. Add narration: keep the original audio, record your voice, or generate a free on-device voiceover.
6. Export an interactive guide as a static folder you can host anywhere and embed with two lines of HTML. Or export MP4 (up to 4K), PDF or PNG/WebP.

Everything runs locally. There's no account and no subscription; you host guides on GitHub Pages, S3 or any static host.

## Platform

- Native Swift/SwiftUI app.
- Runs on **macOS 14 Sonoma and later**, so it works on macOS 27 Golden Gate and three releases back. Newer-OS extras such as Liquid Glass and on-device AI titles turn on automatically where available.
- Universal binary (Apple silicon and Intel).

## Docs

| Doc | Contents |
|---|---|
| [01 — Feature analysis](docs/01-feature-analysis.md) | Every FramePin feature: what it does, how it likely works, how OpenPin builds it |
| [02 — Architecture](docs/02-architecture.md) | OS targets, tech stack, repo layout, data model, rendering pipeline, guide format |
| [03 — Design system](docs/03-design-system.md) | "Coral & Graphite" palette, typography, layout, PinKit component library |
| [04 — Roadmap](docs/04-roadmap.md) | Phased build plan with acceptance criteria |

OpenPin is an independent clean-room project built from FramePin's public product descriptions. It isn't affiliated with FramePin and uses none of its code or assets.
