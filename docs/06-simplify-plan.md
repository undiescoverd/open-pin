# 06 — Simplify plan

Waypost is for **documentation and SOPs**: someone records a process once and turns it into a step-by-step guide that people can follow. It isn't a video editor. Phases 1 to 3 made it powerful, but most of that power came from DaVinci Resolve (lanes, layers, J K L, ripple, keyframes), and a first-time user now meets all of it at once.

This plan takes an outside product review (comparing Waypost with FramePin), keeps what makes the app easier, and drops what would make it heavier. It comes **before** Phase 4 in [04-roadmap.md](04-roadmap.md) and changes what Phases 4 to 6 include.

**The rule for every decision below:** a person who has never edited video can turn a recording into a five-step guide and share it, without reading anything, in under ten minutes.

Nothing is deleted from the engine. The power stays, but it moves out of the way.

**Progressive disclosure is the house pattern.** Wherever a panel has precise or rarely used controls, they sit in a collapsed **Advanced** section at the end of that panel. Closed, it's one line that says what's inside. It stays where it is, so people learn there's more without being shown all of it. The design canvas "Waypost simple editor" shows the step card with Advanced closed (board 2) and open (board 5), and the Hide panel's Advanced (board 3).

## What we take from the review

| # | Idea | Decision | Why |
|---|---|---|---|
| 1 | Steps first, timeline second | **Take, top priority** | It's the change that matters most. A guide is a list of steps, not a stack of lanes. |
| 2 | Simple hide options first, advanced effects behind "Advanced" | **Take** | Most people just want to hide an email address or a password. |
| 3 | A focused Step inspector | **Take** | Each step becomes the unit you edit: title, instruction, what to point at. |
| 4 | Quick actions after pinning ("Add callout here", "Highlight", "Zoom here") | **Take** | It turns four clicks into one, and we already know where the click was. |
| 5 | Duplicate a step, apply a style to all steps | **Take** | SOPs need a consistent look across many similar steps. |
| 6 | Preview from the current step, then return to it | **Take** | Small, and it removes the restart-the-whole-guide loop. |
| 7 | Separate "Export files" from "Publish online" | **Take** | People shouldn't need to understand hosting, CORS or zips. |
| 8 | Readable step text on phones | **Take, simple version** | A guide that people actually follow is often read on a phone. |
| 9 | Privacy check before export | **Take, simple version** | One leaked frame of a password ruins an SOP. |
| 10 | Markdown / HTML SOP export | **Take, move up from Phase 6** | It is the product's main purpose: documentation people can paste into Notion, Confluence or a wiki. |
| 11 | Narration: record per step and import files first | **Take** | Matches how SOP makers work, and it's simpler than generated voice. |
| 12 | Warn about silent sped-up clips | **Take the warning, leave the time-stretch** | One honest line is cheap. Time-stretching is a lot of audio work for a rare case. |
| 13 | Test three journeys end to end | **Take two of them** | The first-time creator and the viewer. The "experienced editor" journey isn't who we're building for. |
| 14 | Quick Share and Self-host as two clear choices | **Take** | It keeps the no-subscription promise without making hosting the user's job. |
| 15 | Workflow stepper across the top (Import → Steps → Enhance → Preview → Share) | **Leave** | It adds chrome and a new idea to learn. A single "what to do next" hint does the same job. |
| 16 | Two editing levels | **Take, as one switch** | Same as item 1, not a second editor. |
| 17 | OCR title suggestions | **Leave for later** | Useful, but it's a nice-to-have. Typing a title is easy. |
| 18 | Click-to-reveal annotations | **Leave** | Another setting to explain. The timer works. |
| 19 | Viewer analytics | **Leave for later** | It doesn't help anyone write a guide. |
| 20 | Generated voice (Kokoro), auto-ducking, background music | **Leave for later** | Video-production features. SOPs rarely need music. |
| 21 | ProRes proxy conversion | **Leave; improve the message** | Say what to do instead ("Export from QuickTime as H.264"). |
| 22 | PDF visual regression tests | **Leave for later** | Low risk for now. |
| 23 | Safari, Firefox and phone testing | **Take** | Already owed from Phase 3. Viewers use every browser. |

## The changes

### 1. Steps first: the timeline becomes a strip

By default the bottom of the editor is a **single filmstrip** of the whole recording with the numbered pins above it, the play button, the timecode and a **Trim & edit video** button. Nothing else, as in the latest design mock-up.

- Click a pin to go to its step. Drag a pin to move it in time. Click the strip to move the playhead.
- **Trim & edit video** opens today's full timeline (Video, Effects, Voice and Music lanes, ripple, magnet, zoom, split). **Done** closes it again. The choice is remembered per project.
- A recording that has never been trimmed doesn't need the full timeline at all.
- J K L, ⇧L ⇧J and = / - keep working in both views but aren't shown in the default UI. They stay in the shortcut sheet.

### 2. The Step inspector is the default

Selecting a step (or opening a project) shows one simple panel, in this order:

1. **Title**: one line, e.g. "Click Save".
2. **Instruction**: a few lines of plain text. This becomes the body text of the SOP export.
3. **Point at it**: the step's annotations as a short list (Callout, Arrow, Highlight, Box), each with a delete button, and an **Add** menu.
4. **Zoom**: on or off, with the area set on the canvas.
5. **Pause**: Short, Medium or Long, instead of seconds.

The Resolve-style rows (slider, number box, reset button, typed timecodes) move under a collapsed **Advanced** section in each group, closed by default and showing a one-line summary of what is inside. Every value keeps its precise control, but you only see it when you ask for it.

### 3. Quick actions after pinning

Pinning with the Pin tool already records where you clicked. Right after the pin drops, a small bar appears next to it:

**Add callout · Highlight · Zoom here · Done**

Each one creates the annotation already placed around the click, using the guide's default style. The bar goes away as soon as you do anything else.

### 4. Hide: three choices, not an effects stack

Rename the Blur tool **Hide** (keep the X shortcut). Drawing a region asks one question:

**Cover · Pixelate · Blur**

- **Cover is the default**, because it's the only one that can't leak. Pixelate is strong by default, never subtle.
- The region lasts until the end of the recording, as now. The Inspector shows *Start*, *End* and *Follow it as it moves* (which sets the keyframes).
- Effect stacks, layers, fades, darken, desaturate and tint go under **Advanced**. Existing projects keep them.
- Before any export, a short **privacy check** lists every hidden area with a thumbnail at its first and last frame, plus a warning if the recording's own audio is still on. One click jumps to each one. It doesn't block the export.

### 5. Duplicate and styles

- **Duplicate step** (⌘D and in the step's menu) copies the title, instruction, annotations and zoom to the frame you're on.
- A guide has **one annotation style** (colour, callout shape, font size), set in the Guide tab. New annotations use it. Changing it updates every annotation that hasn't been styled by hand, and "Apply to all" resets those too.

### 6. One idea of preview

Today there are three similar things: the Edit / Viewer switch in the dock, playback (which uses the viewer rendering) and the Preview dialog. That's too many for a new user.

- The dock's switch becomes a single **Preview step** button. It plays the selected step exactly as a viewer will see it, then returns to editing.
- The top bar's **Preview** opens the full player **at the selected step**, not at the start, and Esc returns to that step in the editor.
- Playback in the editor stays as it is.

### 7. Sharing in plain words

The top bar keeps two buttons, with clearer jobs:

- **Share** (primary): opens a dialog with two choices.
  - **Publish online** (Phase 5, simplest host first): connect once, then one click gives a link and an embed code. Republishing keeps the same link.
  - **Download for my website**: today's folder or zip, with a short guide in plain words for GitHub Pages, Netlify and Cloudflare Pages. The CORS detail stays in `embed.txt`, not in the dialog.
- **Export**: files for other uses (**SOP document**, PDF, MP4, screenshots).

### 8. SOP document export (moved up from Phase 6)

Export a guide as a document people can paste or upload anywhere:

- **Markdown** with a folder of step images (for GitHub, Notion, Obsidian and most wikis).
- **HTML**: one self-contained file with the images embedded (pastes cleanly into Confluence and Google Docs).
- Structure: the guide title, an optional intro, then for each step its number, title, instruction and the annotated still. That's the same content as the PDF, in an editable form.

### 9. Phones

On narrow screens the player shows the step's **title and instruction under the picture** in normal-size text, instead of relying on callout text that has shrunk with the recording. The callouts stay on the picture as shapes. This is a player change only.

### 10. Next-step hint instead of a wizard

A single line in the dock's status area suggests the next useful thing, and only that:

- no recording → "Drop a recording to start"
- no steps → "Press P and click where the viewer should click"
- a step with no title → "Give step 2 a title"
- all steps titled → "Preview the guide, then Share"

It never blocks anything and says nothing once the guide is ready.

## Revised order of work

### Phase 3.5 — Simplify (next)

1. Steps-first strip, with the full timeline behind **Trim & edit video** (change 1).
2. Step inspector with **Advanced** sections (change 2).
3. Hide tool with Cover, Pixelate and Blur, and the advanced options under Advanced (change 4).
4. Quick actions after pinning (change 3).
5. Duplicate step and the guide-wide annotation style (change 5).
6. Preview step and Preview-from-here (change 6).
7. Next-step hint (change 10).
8. Clearer messages: silent sped-up clips in the MP4, and what to do with an unsupported recording.

**Done when** someone who has never seen Waypost turns a 30-second recording into a five-step guide with titles, one callout, one zoom and one hidden area, then exports a PDF, in under ten minutes without help. Run it with at least three people and record where they hesitate.

### Phase 4 — Documents and phones (was part of Phase 6)

- SOP document export: Markdown and HTML (change 8).
- Phone layout in the player (change 9).
- Privacy check before export (change 4).
- Safari, Firefox and iPhone checks on real devices (owed from Phase 3).

### Phase 5 — Sharing (was Phase 5, now simpler)

- The new Share dialog (change 7).
- **One** publishing target to start with, the one that needs the fewest steps for a non-technical user. GitHub Pages needs a token and a repository, so test Cloudflare Pages or Netlify against it first.
- Stable links and republishing.

### Phase 6 — Narration (was Phase 4, now smaller)

- Record narration per step in the browser and import an audio file per step.
- Keep the recording's own audio, including in the interactive guide.
- Step pause driven by the narration's length.
- **Later, if people ask:** generated voice (Kokoro), background music, auto-ducking.

### Later

- OCR title suggestions, auto-redaction suggestions, analytics, the click-capture extension, in-app screen recording, time-stretched audio for sped-up clips, PDF visual tests.

## What stays exactly as it is

- The renderer, export pipeline, player, `.waypost` files and storage.
- Every editing feature, reachable from the full timeline and the **Advanced** sections.
- Keyboard shortcuts.

## Open questions for the owner

1. **The Edit / Viewer switch** we just docked under the frame ([open-pin#11](https://github.com/undiescoverd/open-pin/pull/11)): replace it with **Preview step** as proposed in change 6, or keep both?
2. **Should the Effects lane appear at all** in the simple view? This plan says no: hidden areas show as faint bars on the filmstrip.
3. **Which host for one-click publishing** first: Cloudflare Pages, Netlify or GitHub Pages?
4. **Pause presets:** are Short / Medium / Long (about 1, 2.5 and 5 seconds) right?
5. Still open from the roadmap: repository visibility, since a paid product would normally be private.
