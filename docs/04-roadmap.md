# 04 — Roadmap

Build order for the Waypost web app. Each phase ends with something usable, and later phases never block earlier ones. Feature IDs (F1–F22) refer to [01-feature-analysis.md](01-feature-analysis.md).

> **Re-planned after Phase 3.** Waypost is for documentation and SOPs, so Phase 4 now makes the editor simple by default, and the old audio, publishing and "beyond FramePin" phases are reordered and trimmed. The design is in [06-simplify-plan.md](06-simplify-plan.md).

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
- **Call to action** shows on the end card, or in the control bar from a chosen step onward and on the end card. It is outlined in the accent colour in the bar, so Next stays the main button. Click events for analytics are on the Later list.
- **Fullscreen** is the player's element going fullscreen. iPhone has no element fullscreen, so the button hides there.
- **Preview** runs the same player with the same stills, but the motion between steps is the recording drawn live on the player's canvas, as the editor plays it, rather than the encoded segment files. That lets it open at once without encoding anything.
- **Folder export** uses the File System Access API (Chromium), writing a `<guide-name>` folder inside the folder you pick and clearing old stills and segments there. Other browsers get a zip. Playwright can't drive the folder picker, so only the zip path has an automated test.
- **The player checks `guide.json` by hand** (schema version, sizes, steps, paths inside the folder, web-only call-to-action links) rather than with Zod, which would take a large share of the size budget. The editor validates every `guide.json` it writes against the full schema.
- **On a phone**, annotation text scales with the picture like everything else, so a callout is small on a narrow screen. Its text is also read out through the live region.
- **Cross-origin embeds:** when the page and the guide are on different sites, the guide's host must send `Access-Control-Allow-Origin` for the player to fetch `guide.json` and the fonts. GitHub Pages does; `embed.txt` says to use the iframe otherwise.

## Phase 4 — Simplify

**Status: built (items 1 to 11), tested in Chromium.** The first-guide test with three new users (the first "done when" below) is still to run. Differences from the plan are listed under [Phase 4 as built](#phase-4-as-built) below.

Make the editor simple by default, as designed in [06-simplify-plan.md](06-simplify-plan.md). Nothing is removed from the engine; precise controls move behind **Trim & edit video** and **Advanced** sections. Build it in this order, each item shippable on its own:

1. **Advanced section component** in PinKit: a collapsed disclosure with a one-line summary, used by every panel from here on.
2. **Filmstrip timeline:** one strip with numbered pins, play, timecode, trim handles and tinted bars for hidden areas. **Trim & edit video** opens today's full timeline and **Done** closes it, remembered per project.
3. **Step card in the Steps list:** title, note, "On this step" chips, a plain-words footer ("Waits for a click, or 2.5 s in a video"), Duplicate, and Advanced (pinned time, wait, reveal order). **+ Add step** at the top of the list.
4. **Right panel, Add then adjust:** *Add to step N* with Callout, Arrow, Highlight, Zoom, Hide and Click; one click places the item on the frame, selected. Under it, the selected item's simple controls, its Advanced and Remove. The tool palette and the Edit / Viewer switch under the frame go; the frame takes their height.
5. **Hide panel:** Blur, Pixelate or Cover (Cover by default), strength, and *This step only* / *From here to the end* / *The whole video*. Effect stacks, layers, fades and keyframes under Advanced. The Blur tool becomes Hide (X).
6. **One Export dialog:** Interactive guide, Video, PDF, Images; *How it plays*; the end button; the link and embed code after saving; "Publish online, coming later". The Guide tab's player settings move here. (Frame, background, logo and annotation style were first put under its Advanced, then moved to the Canvas tab; see "Phase 4 as built".)
7. **Preview at the selected step**, with Esc back to that step.
8. **Quick actions after a pin** (Add callout · Highlight · Zoom here) and **Duplicate step** (⌘D).
9. **First run:** the full-window drop zone with *Add steps · Explain each one · Export*, and the one-line next-step hint under the frame.
10. **Honest messages:** silent sped-up clips in the MP4 noted in the Export dialog; unsupported recordings say what to do.
11. **Docs:** update 03-design-system and 05-editor-interactions to the new layout; update the HTML mockup or retire it in favour of the design canvas.

**Done when**

- Someone who has never seen Waypost turns a 30-second recording into a five-step guide with titles, one callout, one zoom and one hidden area, then exports a PDF and an interactive guide, in under ten minutes without help. Run it with at least three people and note where they hesitate.
- Every Phase 1 to 3 browser test still passes (moved to the new controls where needed), and new tests cover the filmstrip, the Add buttons, the Hide panel, Advanced sections and the Export dialog.
- Projects saved before Phase 4 open unchanged, effect stacks and all.

### Phase 4 as built

- **Tests.** Each item has its own browser spec in `apps/editor/e2e` (`filmstrip`, `stepcard`, `addpanel`, `hide`, `export`, `preview`, `quickactions`, and the first-run and next-step-hint tests in `shell`), and the Phase 1 to 3 specs drive the new controls (most open the full timeline with Trim & edit video first). The first-guide test with new users hasn't been run.
- **Preview** opens at the selected step's still, or on the start card when no step is selected. Esc selects the step the preview was showing, which may be a later one if you moved on in the preview. Two small bugs turned up and were fixed: the Esc that closes any dialog no longer also reaches the editor (it cleared the selection), and a tooltip no longer opens behind a dialog, where it took the dialog's first Esc.
- **Quick actions** appear after the Click button too, not just the Pin tool, since both drop a click marker. Their buttons do exactly what the matching Add buttons do.
- **Duplicate step** is on the step card and ⌘D. It copies the step onto the frame at the playhead, and refuses a frame that already has a step. There is no separate step menu.
- **The next-step hint** asks for a step, then a title for the first untitled step, then "Preview it, then Export". It stops once the guide has been previewed or Export opened since the project was opened. It sits under the frame only when the status line has nothing else to say.
- **First run** keeps **Projects** and the theme button above the drop zone, so saved projects stay reachable before a recording is open.
- **Honest messages:** the video's sound switch says how many sped-up or slowed clips will be silent and for how long, and is off and disabled for a recording without sound. Recordings the browser can't open name their format (ProRes, HEVC…) and say to re-export from QuickTime Player as H.264.
- **The ⌘K command palette** is still not built (its top-bar button is disabled), and **⌘E** went with the old Export menu. The keyboard tables in docs 03 and 05 say so.
- **The HTML mockup** is retired as the layout reference in favour of the design canvas. It stays in `design/mockup` only for narration and music, which aren't built yet.
- **The canvas** (after the first build): framing, background, logo and annotation colour moved out of Export's Advanced into the **Canvas** tab in the right panel (replacing the Guide tab), shape first, with nothing above the frame. A new project is 16:9 on a gradient and opens on the Canvas tab. The editor now draws what exports draw where there is no background, so there is no checkerboard. See [06](06-simplify-plan.md), "The canvas".
- **One annotation style per guide** is its colour only: **Annotation colour** (now on the Canvas tab), which new arrows, outlines and click markers take; changing it recolours every annotation still in the old colour, and one given its own colour keeps it. Callouts stay dark bubbles. Callout shape and text size aren't built, because the renderer has no such options yet.

## Phase 5 — Click capture (next)

Pinning every click by hand is the slowest part of making a guide. Capture the clicks while recording, so a guide starts with a step at each one, already in the right place. A web page can't see clicks outside its own tab, so this needs a small browser extension (Chrome first). It is always optional: anyone who doesn't want it skips it in one click and works exactly as in Phase 4.

- **Record in the app:** *Record a tab* records a browser tab straight into a new project (`getDisplayMedia` + `MediaRecorder`). Recording in the app keeps the clicks and the video on one clock, so every click lands on the right frame.
- **Waypost click-capture extension:** while recording, it logs each click in the recorded tab with its time, its position in the page and the label of what was clicked (button text, link text or `aria-label`). The clicks go to the editor and never leave the browser. It only runs while a recording is going and says so in its icon.
- **A step at every click:** when recording stops, the editor proposes a step at each click, with a click marker where the click was and a title from the label ("Click Invite"). A short review list lets you keep, merge or drop them, then **Add steps**. Proposed steps are ordinary steps afterwards: move, retitle or delete them as usual.
- **Easy to skip, at every point:**
  - *Drop a recording* stays the main action on the first-run screen; *Record a tab* sits beside it, never in front of it.
  - Recording without the extension just works. The offer to install it is one quiet line with **Not now**, and it stops asking once dismissed.
  - Before recording, a *Suggest a step at each click* switch (on when the extension is installed) turns capture off for that recording.
  - The review list has **Skip, I'll add my own**, which keeps the recording and drops every suggestion. Esc does the same.
  - Each choice is remembered, so someone who never wants suggestions turns them off once and doesn't see them again.
- **Without the extension** everything works as today: the Pin tool and **+ Add step** stay the way to make steps by hand, and recordings made elsewhere import as before.

**Done when** someone records a five-click task in a browser tab with the extension on and gets five steps, each with its click marker on what was clicked and a sensible title, without pinning anything by hand; and someone who skips it, at the install offer or at the review list, ends up with the plain recording and no extra steps or prompts.

## Phase 6 — Documents and phones

- **SOP document export:** Markdown with a folder of step images, and a single HTML file with the images inside. Added to the Export dialog as *Document*.
- **Phone layout in the player:** each step's title and note under the picture in readable text on narrow screens.
- **Privacy check** before export: every hidden area at its first and last frame, and a warning if the recording's sound is on.
- **Safari, Firefox and iPhone Safari** checked on real devices (owed from Phase 3).

**Done when** a guide exported as Markdown pastes into Notion and GitHub with its images, its HTML copy pastes into Confluence and Google Docs, and the interactive guide reads well on an iPhone.

## Phase 7 — Sharing

- **Publish online** in the Export dialog: connect a host once, then one click gives a link and an embed code. Republishing keeps the same link. Start with the one host that needs the fewest steps for someone non-technical (see the open questions).
- Stable per-step links for the hosted pictures and PDF.
- Purchase and licence-key unlock (see the open questions).

**Done when** a non-technical tester publishes a guide and pastes its working link into a chat without touching a file.

## Phase 8 — Narration

- Record narration per step in the browser, and import an audio file per step.
- Keep the recording's own sound, including in the interactive guide ("Start guide" tap to unlock sound), and in the MP4.
- Step waits driven by the narration's length.

**Done when** a guide with recorded narration plays in sync in the player and in the MP4.

## Later

Kept for when people ask for them, not planned:

- Generated voiceover (Kokoro), background music and auto-ducking.
- Viewer analytics (player beacons, a collector and a per-step funnel).
- OCR title suggestions and auto-redaction suggestions.
- Click-to-reveal annotations, time-stretched sound for sped-up clips, PDF visual regression tests, a ProRes editing proxy.
- Recording a whole screen or window inside the app (Phase 5 records a browser tab), click capture in desktop apps, PWA polish.

## Open questions for the owner

Decided: **Waypost** is the name, it's a **paid one-off purchase** (proprietary code), and the editor is hosted on **Cloudflare Pages**. After Phase 3: Waypost is a **guide and SOP maker first**, simple by default, with precise controls behind **Advanced** sections and **Trim & edit video** ([06-simplify-plan.md](06-simplify-plan.md)).

Still open (the options for 1, 3 and 4 are laid out in [07-business-model.md](07-business-model.md)):
1. **First publishing host** (Phase 7): Cloudflare Pages, Netlify or GitHub Pages. GitHub Pages needs a token and a repository, so test the other two against it first.
2. **Name checks:** trademark, domain and app-store searches for "Waypost" before designing the app mark.
3. **Selling:** payment provider (Lemon Squeezy or Paddle issue licence keys and handle VAT; Stripe is cheaper per sale but leaves keys and tax to us), the price, and whether there's a free trial or a free tier.
4. **Unlocking:** a licence key checked online once and then cached, so the editor keeps working offline. Needs a decision on what a locked copy can still do (for example, edit and preview but not export).
5. **Repository visibility:** the repo is public; a paid product would normally make it private.
