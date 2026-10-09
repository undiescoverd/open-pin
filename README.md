# Waypost

A web app that turns screen recordings into interactive, click-through product guides, with MP4, PDF and screenshot exports too. It's an alternative to [FramePin](https://framepin.com/) that you buy once instead of subscribing to.

**Status:** Phase 1 of the [roadmap](docs/04-roadmap.md) is built: open a recording, pin steps, annotate them, keep your work, and export a PDF or screenshots. Editing (trim, speed, blur, zoom, framing), MP4 export, the interactive player, audio and publishing arrive in later phases. The full designed behaviour lives in the [clickable mockup](design/mockup/editor.html).

## What works today (Phase 1)

- Drop in or choose a recording (MP4, MOV, WebM or MKV). It's copied into this browser's private storage; nothing is uploaded.
- Frame-exact preview with a transport (Space or K, L and J for faster or backward playback that stops at every step, arrow keys for single frames) and a millisecond timecode.
- Pin the moments that matter: the Pin tool (P) drops a step and a click marker where you click, and "+ Pin step" (⇧P) pins the frame you're on.
- Give each step a title and a note, and add callouts, arrows, spotlights and boxes. Move and resize them on the frame or type exact positions in the Inspector.
- Undo and redo (⌘Z, ⇧⌘Z), autosave, a project list, and `.waypost` files you can save, move to another computer and open again.
- Export a PDF (A4, Letter or 16:9), PNG or WebP screenshots in a zip, or copy or save the frame on screen. Exports use the same renderer as the canvas, so they match it pixel for pixel.

The editor needs Chrome, Edge, Brave or Arc on a computer (WebCodecs, private file storage). Other browsers see a notice.

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

## Developing

Needs Node 22 and pnpm 10 (`corepack enable` gives you the pinned pnpm).

```sh
pnpm install
pnpm dev          # the editor at http://localhost:5173 (the component gallery is at /kit)
pnpm check        # tokens, lint, typecheck, unit tests and a production build: what CI runs
pnpm test:e2e     # browser tests against the production build (first run: pnpm --filter @waypost/editor exec playwright install chromium)
pnpm --filter @waypost/editor exec playwright test --update-snapshots   # after an intended change to how annotations draw
pnpm tokens       # regenerate the CSS after editing design/tokens.json
```

| Path | What's there |
|---|---|
| `apps/editor` | The editor web app (Vite, React 19, Tailwind 4) and its Playwright tests |
| `packages/ui` | PinKit: generated token CSS plus `Button`, `IconButton`, `Tooltip`, `KeyCap`, `Surface`, `Icon`, `Dialog`, `Menu` and the inspector's form controls |
| `packages/core` | The project model: schema (Zod), time mapping, commands with undo and redo, timecodes. No DOM |
| `packages/render` | The canvas renderer for annotations, shared by the editor and every export |
| `packages/media` | Reads recordings with Mediabunny in a worker: the time of every frame, exact frame reads |
| `packages/export` | PNG and WebP zips and the PDF |
| `packages/player`, `tts` | Empty until their roadmap phase |
| `design/tokens.json` | Colours, type, radii and motion for both themes; `scripts/build-tokens.mjs` turns it into CSS |

## Deploying

CI deploys to Cloudflare Pages once two repository secrets exist; until then the deploy step is skipped and everything else still runs.

1. In Cloudflare, create an API token with the **Cloudflare Pages: Edit** permission, and note your account ID.
2. Create the Pages project once: `pnpm dlx wrangler pages project create waypost --production-branch=claude/gracious-keller-073zo2` (use whichever branch is the repository's default).
3. In GitHub, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Settings → Secrets and variables → Actions).

Pushes to the default branch then go to production, and every pull request branch gets its own preview URL.

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
