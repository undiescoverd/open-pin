# Waypost

A web app that turns screen recordings into interactive, click-through product guides, with MP4, PDF and screenshot exports too. It's an alternative to [FramePin](https://framepin.com/) that you buy once instead of subscribing to.

**Status:** Phases 1 to 4 of the [roadmap](docs/04-roadmap.md) are built: open a recording, add steps and explain each one, hide what needs hiding, frame it, and publish it as an interactive guide you can host anywhere and embed with two lines of HTML, or export a PDF, screenshots or an MP4. Phase 4 made the editor simple by default (steps first, one Add panel, precise controls under Advanced, the full timeline behind Trim & edit video; see [the simplify plan](docs/06-simplify-plan.md)); its first-guide test with new users is still to run. Next come click capture (a step proposed at every click you make while recording, easy to skip), SOP documents, one-click publishing and narration. The interactive guide has been tested in Chromium; Safari, Firefox and iPhone still need a check on real devices.

## What works today

- Drop in or choose a recording (MP4, MOV, WebM or MKV). It's copied into this browser's private storage; nothing is uploaded.
- Frame-exact preview with a transport (Space or K, L and J for faster or backward playback that stops at every step, arrow keys for single frames) and a millisecond timecode.
- **Steps first:** a full-window drop zone to start, then a Steps list with **+ Add step** (⇧P) at the top. The selected step opens as a card with its title, note, what's on it, how it behaves in plain words, Duplicate (⌘D) and an Advanced section. A quiet line under the frame suggests the next useful thing.
- **Add, then adjust:** six buttons at the top of the right panel (Callout, Arrow, Highlight, Zoom, Hide, Click) put the item on the step with one click, placed around the step's click; the keys draw it exactly instead. Right after a click marker drops, a small bar offers Add callout, Highlight and Zoom here. Each item shows a few simple controls, with exact positions and timing under Advanced. Callouts, arrows and highlights can appear with the step or after it, group by group.
- **Edit the recording:** the filmstrip under the frame shows the whole recording with the numbered steps and trim handles. **Trim & edit video** opens the full timeline: split with R, trim clip edges with or without ripple (⇧R), set each clip's speed (¼× to 8×) and volume, and close or size the gaps. Steps stay on their frames whatever you cut, and a trim stops at a pinned step.
- **Hide things:** Hide (X) covers part of the frame for this step, from here to the end, or the whole video, as a cover (the default, which can't leak), pixelation or a blur. Under Advanced each region has its own stack of effects (pixelate, blur, darken, desaturate, tint, solid fill) applied in order, sits on a layer of the Effects lane as in DaVinci Resolve, and follows what it hides with keyframes. Effects are burned into every export.
- **Zoom in** on part of the frame at a step, with a How close slider; playing shows the step the way the guide will.
- **Set the canvas first:** a new project is 16:9 on a gradient. The Canvas tab beside the frame picks the shape (the recording's own, 16:9, 4:3, 1:1 or 4:5) in one click, then sets the background (colour, gradient or image), padding, rounded corners, shadow and your logo. What you see is what every export draws.
- Undo and redo (⌘Z, ⇧⌘Z), autosave, a project list, and `.waypost` files you can save, move to another computer and open again.
- **Publish an interactive guide:** the Export dialog saves a folder (or a zip) with a standalone page, the player, `guide.json`, the pictures and motion for every step and an optional PDF copy. Upload it to GitHub Pages, Cloudflare Pages, Netlify, S3 or any static host, then share the link, paste the two-line embed into any page (it works inside React and Vue apps and CMS pages too), or use an iframe. Viewers click through the steps, which play the motion between them and draw each step's zoom and annotations exactly as the editor does, with ← → keys, screen-reader announcements and reduced motion respected. The player is 14 KB gzipped.
- **One Export dialog:** pick an interactive guide, a video, a PDF or images, then answer only what matters for it. For the guide, how it plays: viewer clicks Next, plays by itself, or plain video; and a button at the end. Under Advanced: your accent colour, light, dark or the viewer's own setting, and which controls show. After saving, it gives the link and embed code. **Preview** (⌘↩) runs the same player inside the editor, starting at the selected step.
- Export an MP4 (720p to 4K) that pauses on every step with its zoom, annotations and title, with the recording's sound (the dialog says which parts are silent); a PDF (A4, Letter or 16:9); PNG or WebP screenshots in a zip; or copy or save the frame on screen. Every export uses the same renderer as the canvas.

The editor needs Chrome, Edge, Brave or Arc on a computer (WebCodecs, private file storage). Other browsers see a notice. Published guides are made to play in any modern browser, phones included. For a guide that plays in Safari too, export it from Chrome or Edge on a Mac or PC, which can encode H.264.

## What it will do

1. Drop in a recording from QuickTime, Loom, ScreenStudio, OBS, Zoom or any other recorder (MP4, MOV, WebM, MKV).
2. Trim mistakes, split sections and change speed with frame-accurate control.
3. Click on the frame to pin a step, then add titles, callouts, arrows, spotlights and zoom.
4. Blur sensitive information with regions that follow it as it moves.
5. Put the recording on a styled background and add your logo.
6. Add narration: keep the recording's own sound, or record or import your voice for each step.
7. Export an interactive guide as a static folder you can host anywhere and embed with two lines of HTML, or export MP4 (up to 4K), PDF, PNG/WebP or an SOP document (Markdown or HTML).

Everything runs in your browser. It's a one-off purchase with no subscription and no server; you host guides on GitHub Pages, Cloudflare Pages, S3 or any static host.

## Platform

- Web app (React + TypeScript). Installable as a desktop app from Chrome, with no code signing or notarization needed.
- **Editor:** current Chrome, Edge, Brave or Arc on any Mac that runs them, including macOS 27 Golden Gate and older releases.
- **Published guides:** play in every modern browser, including Safari on iPhone and iPad.

## Developing

Needs Node 22 and pnpm 10 (`corepack enable` gives you the pinned pnpm).

```sh
pnpm install
pnpm dev          # builds player.js, then the editor at http://localhost:5173 (the component gallery is at /kit)
pnpm check        # tokens, lint, typecheck, unit tests and a production build (with the player's size budget): what CI runs
pnpm test:e2e     # browser tests against the production build (first run: pnpm --filter @waypost/editor exec playwright install chromium)
pnpm --filter @waypost/editor exec playwright test --update-snapshots   # after an intended change to how annotations draw
pnpm tokens       # regenerate the CSS after editing design/tokens.json
```

| Path | What's there |
|---|---|
| `apps/editor` | The editor web app (Vite, React 19, Tailwind 4) and its Playwright tests |
| `packages/ui` | PinKit: generated token CSS plus `Button`, `IconButton`, `Tooltip`, `KeyCap`, `Surface`, `Icon`, `Dialog`, `Menu` and the inspector's form controls |
| `packages/core` | The project model: schema (Zod), time mapping, clip editing, effect layers, the export plan, the `guide.json` format, commands with undo and redo, timecodes. No DOM |
| `packages/render` | The compositor: framing, effect regions, zoom, annotations, logo and captions, shared by the editor, the player and every export |
| `packages/media` | Reads recordings with Mediabunny in a worker: the time of every frame, exact frame reads |
| `packages/export` | PNG and WebP zips, the PDF, MP4 and a guide's stills and segments in an export worker, and the guide folder or zip |
| `packages/player` | The guide player, built to one `player.js` with no dependencies: state machine, Shadow DOM, controls, auto-mount on `[data-waypost]` |
| `packages/tts` | Empty until its roadmap phase |
| `design/tokens.json` | Colours, type, radii and motion for both themes; `scripts/build-tokens.mjs` turns it into CSS |

## Deploying

CI deploys to Cloudflare Pages once two repository secrets exist; until then the deploy step is skipped and everything else still runs.

1. In Cloudflare, create an API token with the **Cloudflare Pages: Edit** permission, and note your account ID.
2. In GitHub, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Settings → Secrets and variables → Actions).

CI creates the `waypost` Pages project on its first deploy, with the repository's default branch as production.

Pushes to the default branch then go to production, and every pull request branch gets its own preview URL.

## Docs

| Doc | Contents |
|---|---|
| [01 — Feature analysis](docs/01-feature-analysis.md) | Every FramePin feature (including ones visible in its editor), how it likely works, how Waypost builds it |
| [02 — Architecture](docs/02-architecture.md) | Browser targets, tech stack, repo layout, data model, threads, rendering pipeline, storage, guide format |
| [03 — Design system and editor UI](docs/03-design-system.md) | What's wrong with FramePin's editor, our layout, "Coral & Graphite" tokens, PinKit components |
| [04 — Roadmap](docs/04-roadmap.md) | Phased build plan with acceptance criteria |
| [05 — Editor interactions](docs/05-editor-interactions.md) | Exact behaviour of the filmstrip and timeline, canvas, Add buttons, right panel and keyboard: time model, trimming and ripple, snapping, playback, undo, acceptance checks |
| [06 — Simplify plan](docs/06-simplify-plan.md) | The steps-first editor design behind Phase 4: screens, principles and what moves under Advanced |
| [07 — Hosting and payment options](docs/07-business-model.md) | Online storage options for published guides (R2), how FramePin charges, payment structures and a recommendation |
| [Editor mockup](design/mockup/editor.html) | Clickable single-file mockup from before Phase 4 (open in Chrome). Retired as the layout reference in favour of the design canvas; kept for narration and music, which aren't built yet |

Waypost is an independent clean-room project built from FramePin's public product descriptions. It isn't affiliated with FramePin and uses none of its code or assets.
