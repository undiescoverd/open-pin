# 06 — Simplify plan

Waypost is for **documentation and SOPs**: someone records a process once and turns it into a step-by-step guide that people can follow. It isn't a video editor. Phases 1 to 3 made it powerful, but most of that power came from DaVinci Resolve (lanes, layers, J K L, ripple, keyframes), and a first-time user now meets all of it at once.

This document is the design for making Waypost simple by default. It takes an outside product review (comparing Waypost with FramePin), keeps what makes the app easier and drops what would make it heavier. The build order is in [04-roadmap.md](04-roadmap.md), Phases 4 to 8.

**Design canvas:** "Waypost simple editor" (claude.ai design canvas, boards 1 to 5 in light and dark) is the reference for every screen below.

## Principles

1. **The test for every decision:** a person who has never edited video can turn a recording into a five-step guide and export it, without reading anything, in under ten minutes.
2. **Steps are the unit of work.** A guide is a list of steps, not a stack of lanes.
3. **Progressive disclosure is the house pattern.** Wherever a panel has precise or rarely used controls, they sit in a collapsed **Advanced** section at the end of that panel. Closed, it's one line that says what's inside. It's always in the same place, so people learn there's more without being shown it.
4. **Adding is always in one place:** the top of the right panel.
5. **Settings live with the thing they change.** The zoom amount is on the Zoom, the wait is on the step, and how the guide plays is in Export.
6. **Nothing is deleted from the engine.** Every Phase 2 control is still reachable, from **Trim & edit video** or an **Advanced** section.

## The screens

### 1. First run (board 1)

The whole window is one drop zone: **Drop a screen recording here** with *Choose a recording* and *Open a project file*. Under it, the shape of the whole job in three numbered lines: **Add steps · Explain each one · Export**. Nothing else is on screen until there is a recording.

### 2. Editing a step (board 2)

Three columns, with the filmstrip under the frame.

**Top bar:** the project name and "Saved", then undo and redo, then **Preview** and **Export** (primary). That's all.

**Left: Steps.** The steps list is the backbone, with **+ Add step** at the top. Each step is a row (thumbnail, number, title, a one-line summary such as "Click · Callout"). The selected step opens in place as a card:

- **Title**: one line, e.g. "Click Invite".
- **Note** (optional): a few lines of plain text. It becomes the body text of the PDF and the SOP document.
- **On this step**: chips for what's on it (Click marker, Callout, Zoom…). Clicking one selects it on the frame.
- A footer line that says how the step behaves in words ("Waits for a click, or 2.5 s in a video"), with **Duplicate**.
- **Advanced** (closed): exact pinned time, how long it waits in a video, and whether annotations appear all at once or one by one (board 5 shows it open).

**Centre: the frame.** It gets all the height there is, with no tool palette under it. Click a thing to select it and drag it to move it.

**Right: Add, then adjust.** The panel always starts with **Add to step N**: six large labelled buttons, Callout, Arrow, Highlight, Zoom, Hide and Click. One click puts the item on the frame, selected, placed sensibly (around the step's click when there is one, otherwise in the middle), ready to drag. Below the buttons the panel shows only the selected item's few simple controls, then its **Advanced**, then **Remove**. For example:

| Item | Simple controls | Under Advanced |
|---|---|---|
| Callout | Show the step's title and note (or your own words), colour | Exact position and size, pointer side, text size, when it appears |
| Arrow | Colour | Exact ends, thickness, when it appears |
| Highlight | Spotlight or outline | Exact box, darkness, corner radius, when it appears |
| Zoom | How close (a slider) | Exact area, ease time |
| Hide | Look, strength, how long (screen 3) | Layers, stacked effects, fades, exact position and timing, following |
| Click | Nothing (drag it) | Exact position, ring style |

The keyboard shortcuts (C, A, H, Z, X, P) still work and show in each button's tooltip.

**Bottom: the filmstrip.** One strip of the whole recording with the numbered pins above it, the play button and the timecode, "Playback stops at every step", and **Trim & edit video**.

- Click a pin to go to its step and drag it to move it in time. Click the strip to move the playhead. Trim handles sit at both ends.
- Hidden areas show as tinted bars on the strip ("Hidden during step 2").
- **Trim & edit video** opens today's full timeline (Video, Effects, Voice and Music lanes, ripple, magnet, zoom, split), and **Done** closes it. The choice is remembered per project.
- J K L, ⇧L ⇧J and = / - keep working in both views but aren't shown in the default UI. They stay in the shortcut sheet.

### 3. Hiding something (board 3)

Hide is added from the same buttons as everything else. Its panel asks three things:

- **Look:** Blur, Pixelate or Cover. **Cover is the default** because it can't leak. Pixelate and blur start strong, never subtle.
- **Strength.**
- **How long:** *This step only* (the default), *From here to the end*, or *The whole video*.

Everything else (layers, stacked effects, darken, desaturate, tint, fades, exact position and timing, and following a moving thing with keyframes) is under **Advanced**. Existing projects keep what they have.

### 4. Export (board 4)

One **Export** button, one dialog.

- **What to export:** *Interactive guide*, *Video*, *PDF*, *Images*, and *Document* (Markdown or HTML, Phase 6) when it's built.
- **How it plays** (for the guide and the video): *Viewer clicks Next*, *Plays by itself* or *Plain video*.
- **Button at the end:** a tick box, its text and its link.
- The dialog doesn't ask for a web address up front. After an interactive guide is saved, it gives the link and the embed code, with plain-words help for GitHub Pages, Netlify and Cloudflare Pages.
- **Publish online, coming later** sits at the bottom, so people know it's planned (Phase 7).
- These settings replace the Guide tab's Player section. (Frame, background and logo were first put under Export's Advanced; they now live with the canvas, in the Canvas tab, because they change what you see while editing. See "The canvas" below.)

### 5. Preview

- **Preview** in the top bar opens the full player **at the selected step**, not at the start. Esc returns to that step in the editor.
- Playback in the editor already shows each step as the viewer sees it (zoom easing in and out, annotations in order) and stops at every step.
- The Edit / Viewer switch from [open-pin#11](https://github.com/undiescoverd/open-pin/pull/11) goes, because there's no tool palette for it to sit beside. On the frame, the selected step is shown with every annotation and handle visible (today's Edit view).

## The canvas

Added after Phase 4's first build, when finding the shape of the picture turned out to be hard: it was two clicks deep in a dialog about exporting.

- **What you set while editing is what comes out.** The editor draws what every export draws; Export has no canvas controls.
- **One place:** everything is in the **Canvas** tab of the right panel, beside the frame so changes can be watched, replacing the old Guide tab: the shape (**Original, 16:9, 4:3, 1:1, 4:5**) first, then background, frame, annotation colour and logo. Nothing sits above the frame, and the tab carries no explanatory text.
- **Look first, or steps first:** a new project is 16:9 on a gradient and opens on the Canvas tab, so the look can be chosen straight away. Starting on steps is just as easy: **+ Add step** shows the Inspector, and the bar is still there.
- **"Guide" means the finished thing** (the interactive guide you export), not the picture you edit. The picture is the **canvas**.

## Other decisions

- **Quick actions after the Click tool:** right after a pin drops, a small bar next to it offers **Add callout · Highlight · Zoom here**, each placed around the click. It goes away as soon as you do anything else.
- **Duplicate step** (⌘D and in the step's menu) copies the title, note, annotations and zoom to the frame you're on.
- **One annotation style per guide** (colour, callout shape, text size), set under Export's Advanced. New annotations use it. Changing it updates every annotation that hasn't been styled by hand. (Built for colour; shape and text size wait for the renderer to support them.)
- **Next-step hint:** a single quiet line under the frame suggests the next useful thing ("Press Add step where the viewer should click", "Give step 2 a title", "Preview it, then Export") and says nothing once the guide is ready.
- **Privacy check:** before any export, a short list of every hidden area with a thumbnail at its first and last frame, plus a warning if the recording's own sound is on. It doesn't block the export.
- **SOP document export:** Markdown with a folder of step images, or a single HTML file with the images inside. The content is the guide title, then each step's number, title, note and annotated picture.
- **Phones:** on narrow screens the player shows each step's title and note under the picture in normal-size text. The callouts stay on the picture as shapes.
- **Honest messages:** sped-up or slowed clips are silent in the MP4 (say so in the Export dialog), and a recording the browser can't open says what to do ("Export it from QuickTime as H.264").

## What we took from the review, and what we left

| Idea | Decision |
|---|---|
| Steps first, timeline second | **Taken**: filmstrip plus Trim & edit video |
| Simple options first, advanced behind a disclosure | **Taken**: Advanced everywhere |
| A focused step editor | **Taken**: the step card |
| Contextual actions after a pin | **Taken** |
| Duplicate a step, one style for all steps | **Taken** |
| Preview from the current step | **Taken** |
| Separate exporting files from publishing online | **Taken**: one Export dialog, publishing later |
| Readable step text on phones | **Taken** |
| Privacy check before export | **Taken**, simple version |
| Markdown / HTML documentation export | **Taken**, moved up from the last phase |
| Narration: record and import per step first | **Taken**, after sharing |
| Silent sped-up clips | **A warning**, not time-stretching |
| Test the first-time creator and the viewer journeys | **Taken** |
| Safari, Firefox and phone testing | **Taken** |
| Workflow stepper across the top | **Left**: the next-step hint does the job |
| OCR title suggestions | **Later** |
| Click-to-reveal annotations | **Left** |
| Viewer analytics | **Later** |
| Generated voice, background music, auto-ducking | **Later** |
| ProRes proxy conversion | **Left**: a clearer message instead |
| PDF visual regression tests | **Later** |

## Starting Phase 4

For whoever (or whichever chat) builds this next.

**Read first:** this file, the Phase 4 list in [04-roadmap.md](04-roadmap.md), then [03-design-system.md](03-design-system.md) and [05-editor-interactions.md](05-editor-interactions.md) for how the editor works today. (Phase 4 is built; those two describe the new layout, and the roadmap's "Phase 4 as built" lists where it differs from this plan.)

**The screens:** the design canvas "Waypost simple editor" is the visual reference (boards 1 to 5, light and dark). It lives on claude.ai, not in this repository, and it's private to its owner: https://claude.ai/artifact/BUeKy3swhxrWXYrDdfaGgy. Its boards are drawn at 1440×900. If the canvas isn't available, the "The screens" section above describes every panel in words.

**Branches:** build on top of the zoom ease-out and dock work in [open-pin#11](https://github.com/undiescoverd/open-pin/pull/11) (branch `improvements`), because Phase 4 reworks that dock. Merge #11 and then the PR carrying this plan before starting, or branch from both.

**Run it:** `pnpm install`, `pnpm dev` for the editor, `pnpm check` for tokens, lint, typecheck, unit tests, build and the player size budget, and `pnpm test:e2e` for the browser tests (Chromium). Screenshot baselines in `apps/editor/e2e/*-snapshots` are Linux Chromium renders and will need regenerating where the layout changes on purpose (`--update-snapshots`, then check the new images by eye).

**Where things are:** the editor shell is `apps/editor/src/editor/` (`EditorShell`, `Stage`, `Dock`, `ToolPalette`, `StepRail`, `Inspector`, `Timeline`, `TopBar`, `ShareDialog`), the project model and plans are in `packages/core`, shared controls in `packages/ui`, and tokens in `design/tokens.json`.

**Rules for the work:**
- Build one numbered item at a time and ship each as its own pull request. The editor must stay usable after every one.
- Don't remove any engine feature. Move controls, don't delete them. Old `.waypost` files must open unchanged.
- Move tests to the new controls rather than deleting them. Keep the Phase 1 to 3 acceptance specs passing.
- The first-guide test in the roadmap is the real finish line, so schedule it once items 1 to 9 are in.

**Decisions already made on the canvas, to treat as settled:** one Export button (no separate Share), the Edit / Viewer switch is removed, Cover is the default Hide look, exact pause length lives under the step's Advanced, and the tool palette under the frame is replaced by the Add buttons at the top of the right panel.

## Open questions for the owner

1. **Which host for one-click publishing** first: Cloudflare Pages, Netlify or GitHub Pages?
2. Still open from the roadmap: repository visibility, since a paid product would normally be private.
