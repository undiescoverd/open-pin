# 01 — FramePin feature analysis

What FramePin does, how each feature most likely works under the hood, and how Waypost rebuilds it as a **web app** that runs in the browser.

**How this was researched.** framepin.com is blocked from the build container. The information comes from two places:
1. FramePin's public homepage text, as surfaced by web search (sources at the bottom).
2. A screenshot of FramePin's editor supplied by the project owner (described below; not committed to the repo because it's FramePin's copyrighted UI).

Statements about *what* FramePin does come from those sources. Statements about *how* it does it are marked **(inferred)**: educated guesses from behavior and constraints, not facts. Waypost is a clean-room rebuild from public behavior. Don't copy FramePin's code, text, logo, screenshots or UI.

---

## The product in one paragraph

FramePin turns an existing screen recording into an **interactive, click-through product guide**. You load a recording, cut out the mistakes, then **pin** individual frames as steps. Each step gets a title plus callouts, arrows, spotlights and zoom. When someone views the guide, the video plays between steps and **stops on each pinned frame** until the viewer clicks to continue. The same project also exports to MP4, PDF and PNG/WebP screenshots. Editing runs locally in Chrome. Publishing uploads only the generated step media, and FramePin charges for hosting, embedding and analytics.

## What the editor screenshot shows

The editor is a dark UI with a left panel, a large canvas and a bottom timeline.

| Area | What's visible | What it tells us |
|---|---|---|
| Left panel, header | "← Home", **Export**, **Widget** (highlighted blue) | "Widget" is FramePin's name for the interactive embed (F9/F11). Export covers MP4/PDF/screenshots. |
| Left panel, button group | **Settings**, **Blur Info**, **Voice Over** | Blur (F7) and narration (F8) are top-level modes. |
| Left panel, tabs | **Frames**, **Background**, **Logo** | "Frames" = the step list. **Background** and **Logo** are features the homepage didn't mention (F18, F19). |
| Empty state | "Capture your first frame. Go to any frame in the video and click on the screen to get started →" | You create a step by **clicking on the video canvas**; the click position probably becomes the step's click target (F3). |
| Canvas | The recording sits inside a checkerboard border | The checkerboard is the background/padding area around the recording, currently transparent (F18). |
| Timeline toolbar, left | Round blue **pin** button (no label), **Undo**, **Snapshot**, **Focus Frame** | Pin = add step at playhead **(inferred)**. Snapshot = save or add the current frame as an image **(inferred)**. Focus Frame = zoom/focus region for a step (F5) **(inferred)**. |
| Timeline toolbar, centre | Previous/next-frame buttons, **Play**, rewind/fast-forward buttons | Frame-level control (F2). |
| Timeline toolbar, right | Speed presets **x5, x2, 1, 1/2, 1/3** | Section speed (F2) or preview speed; not clear which **(inferred)**. |
| Timecodes | `00:04.980` current, `00:17.775` total | Millisecond-precision display. |
| Timeline | Ruler 0–16 s; orange playhead with a drag grip on top and an **×** handle at the bottom; one clip labelled `0 [17.775]`; an empty lane; a dashed **"ADD BACKGROUND AUDIO"** lane | Clips are numbered with their duration. The × handle is likely "split/cut here" **(inferred)**. Background music is a feature (F20). |

Why the UI feels bad, and what Waypost does differently, is covered in [03-design-system.md](03-design-system.md#lessons-from-framepins-editor).

## Feature inventory

| # | Feature | FramePin tier | Waypost phase |
|---|---------|---------------|---------------|
| F1 | Import any screen recording | Free | 1 |
| F2 | Trim, split and per-section speed, with frame-level control | Free | 2 |
| F3 | Pin frames as steps (click on the frame); motion kept between steps | Free | 1 |
| F4 | Step titles | Free | 1 |
| F5 | Callouts, arrows, spotlights, zoom ("Focus Frame") | Free | 1 (zoom: 2) |
| F6 | Control the order annotations appear in | Free | 2 |
| F7 | Keyframed blur that follows sensitive info ("Blur Info") | Free | 2 |
| F8 | Narration: original audio, uploaded voice, or generated voiceover ("Voice Over") | Free (preview) | 4 |
| F9 | Interactive guide player ("Widget") with branding and playback modes | Paid to publish | 3 |
| F10 | Call-to-action button | Paid to publish | 3 |
| F11 | Embed with two lines of HTML, or share a standalone link | Paid | 3 (+5 for hosting) |
| F12 | Cookieless view analytics; per-step reach (Pro) | Paid / Pro | 5 |
| F13 | MP4 export up to 4K | Free | 2 |
| F14 | PDF export, one page per step; hosted compressed copy | Free / paid hosting | 1 (+5) |
| F15 | PNG/WebP export per step; hosted WebP at fixed per-step links | Free / paid hosting | 1 |
| F16 | Local-first privacy | n/a | Built in |
| F17 | Accounts, trial, plan limits | n/a | **Dropped** |
| F18 | Background and framing around the recording | Free (from screenshot) | 2 |
| F19 | Logo placement | Free (from screenshot) | 2 |
| F20 | Background audio (music) track | Free (from screenshot) | 4 |
| F21 | Snapshot of the current frame | Free (from screenshot) | 1 |
| F22 | Undo | Free (from screenshot) | 1 (with redo) |

Phases are defined in [04-roadmap.md](04-roadmap.md). Libraries named below are described in [02-architecture.md](02-architecture.md).

---

## F1 — Import any screen recording

**What it does.** FramePin takes recordings from "Loom, ScreenStudio, OBS, QuickTime, Zoom, or another screen recorder". There's no built-in recorder.

**How FramePin likely does it (inferred).** Chrome-only editing points to **WebCodecs** for decoding plus a JavaScript demuxer, reading the file locally. That explains "Chrome only" and "your recording is never uploaded".

**How Waypost does it.**
- Drag and drop a file or use the file picker. Read it with **Mediabunny**, which reads and writes **MP4, MOV, WebM and MKV**. That covers QuickTime, ScreenStudio, Loom, Zoom *and* OBS's MKV files with no remuxing step.
- Copy the file into the project's storage in the browser's private file system (OPFS), so the project still works after a reload.
- Build a **frame index** in a Web Worker: read every video packet's timestamp without decoding (fast). Screen recordings are often **variable frame rate** (QuickTime and ScreenStudio skip frames when nothing moves), so "next frame" can't be computed as `t + 1/fps`. The index makes frame stepping and pinning exact.
- Generate filmstrip thumbnails in the worker and cache them.
- If the browser's `<video>` element can't play the codec (for example ProRes from some ScreenStudio exports), make a one-time H.264 editing proxy with Mediabunny's conversion API. Exports still read the original.

## F2 — Trim, split and speed with frame-level control

**What it does.** "Remove mistakes, split sections, and adjust their speed with frame-level control." The screenshot shows speed presets from 5× to ⅓×, frame-step buttons and millisecond timecodes.

**How Waypost does it.**
- **Edit model:** the timeline is an ordered list of clips: `Clip { sourceId, in, out, speed }`. Split turns one clip into two. Deleting a range removes or shortens clips. The source file is never modified.
- **Speed:** per-clip, with presets (⅓×, ½×, 1×, 2×, 5×) plus custom values, set in the clip's inspector. Preview playback speed is a separate control, so the two aren't confused the way they are in FramePin's toolbar.
- **Preview playback:** a `<video>` element plays the source while `requestVideoFrameCallback` hands each frame to our compositor canvas. When playback crosses a clip's out point, the player jumps to the next clip's in point and switches `playbackRate`. A tiny hitch at cut points is acceptable in preview; exports are exact.
- **Frame-level control:** when paused, the visible frame is decoded exactly by Mediabunny from the frame index, not by seeking the `<video>`, which is imprecise. ←/→ step one frame and the playhead snaps to real frame timestamps.
- **Time mapping:** one pure function, `timelineTime ↔ (clip, sourceTime)`, lives in `@waypost/core` and is heavily unit-tested. Every other feature depends on it.

**Key design decision.** Steps, blur keyframes and narration are anchored to **source time**, not timeline time. Trimming earlier in the video then never shifts a pinned frame. If a trim removes a step's frame, the step is flagged "orphaned" instead of silently deleted.

## F3 — Pin frames as steps (motion kept between steps)

**What it does.** "Pause on an exact frame and pin it as a guide step." The viewer "stops at each step and continues when ready", and the motion between pinned moments is kept. The screenshot shows the interaction: **click on the video** to capture a frame.

**How FramePin likely does it (inferred).** On publish it uploads "generated step media", which suggests one short clip per step (the motion leading into it) and one still of the exact pinned frame. The player plays clip *n*, then shows still *n* with annotations and waits. Stopping a single long video at timestamps isn't frame-accurate, which is why we think they split the media.

**How Waypost does it.**
- **Two ways to pin, both obvious:**
  - The **Pin tool (P)**: click anywhere on the frame. That creates a step at the current frame *and* places a click marker where you clicked. This keeps FramePin's best idea but makes it a visible, named tool instead of a hint hidden in an empty state.
  - The **"+ Pin step"** button at the top of the step list, which pins without a click marker.
- Steps appear in the step list and as numbered markers on their own timeline lane. Drag a marker to re-time a step. Steps are always sorted by time.
- **Segments:** segment *n* runs from step *n−1* (or the start) to step *n*. An optional outro segment runs after the last step.
- **Published media per step:** `seg/<step-id>.mp4` (H.264, blur and background baked in, no annotations), `steps/<step-id>.webp` (the exact pinned frame, same treatment) and optional `audio/<step-id>.m4a`. The player draws annotations itself.
- **Player:** play segment *n* → on `ended`, show still *n* (pixel-exact, no seek drift) → reveal annotations → wait for Next, a click or → → play segment *n+1*, which was preloaded.

## F4 — Step titles

**What it does.** Each step gets a short title. Titles also drive the generated voiceover (F8) and appear in MP4 (F13) and PDF (F14).

**How Waypost does it.** `step.title` (one line) plus optional `step.body` (a longer note for PDF and Markdown export) and optional `step.narration.script` (defaults to the title). Edit inline in the step list or in the inspector. Phase 6 adds auto-suggested titles.

## F5 — Callouts, arrows, spotlights and zoom ("Focus Frame")

**What it does.** "Guide attention with callouts, arrows, spotlights and zoom." The screenshot's **Focus Frame** button is most likely the zoom/focus control **(inferred)**.

**How Waypost does it.** Each step has a list of annotations stored in **normalized coordinates** (0–1 of the *recording* frame, not the padded canvas from F18). They scale to any output size and stay attached to the content when padding changes.

| Annotation | Geometry | Rendering notes |
|---|---|---|
| **Callout** | anchor point + text + placement (auto/top/bottom/left/right) | Rounded bubble with a pointer. Auto placement flips to stay in frame. Text wraps at a max width. |
| **Arrow** | from/to points + curvature | Thick stroke with an arrowhead and a 2 px contrasting halo, so it reads on both light and dark UIs. |
| **Spotlight** | rect or ellipse + feather + dim amount | Dims everything outside the shape (default 55% black, 12 px feather). |
| **Box / highlight** | rect + stroke/fill | Simple outline or translucent fill. |
| **Click marker** | point | Pulse ring showing "click here". Created automatically by the Pin tool. |
| **Zoom / focus** (per step) | target rect + easing | The view eases into the rect when the step is reached. |

**One renderer everywhere.** `@waypost/render` draws annotations onto a canvas. The editor preview, the published player and every export (PNG, WebP, PDF, MP4) call the *same function*, so what you see is exactly what you export and what viewers get. In the native plan this needed two renderers plus parity tests; going web removes that. Annotation text uses a bundled font (Figtree) so output looks identical on every machine.

**Zoom.** The zoom box always keeps the frame's shape, so the box *is* what viewers will see. Its size and the zoom amount are one setting (1.25× to 4×): drag a corner of the box or move the Zoom amount slider. Drag the box's edge to move it, or center it on the step's click marker. The compositor applies an eased scale and translate before drawing annotations. In the player, the step still is full resolution, so zoom stays sharp.

## F6 — Annotation reveal order

**What it does.** "Control the order in which these appear."

**How Waypost does it.** Each annotation has a `reveal` index (0, 1, 2…). Annotations sharing an index appear together. The inspector shows the reveal groups as a drag-to-reorder list.
- **Player:** groups appear in sequence with a short fade or scale-in, either on a timer (default 600 ms apart) or one per click/→ before advancing.
- **MP4:** groups animate in during the step's hold.
- **PDF/PNG:** everything shown at once.

## F7 — Keyframed blur regions ("Blur Info")

**What it does.** "Keyframed blur regions can follow sensitive information as it moves." Blur is rendered into the interactive guide and every export.

**How FramePin likely does it (inferred).** Rectangles with keyframes, interpolated per frame and burned into the pixels at export. It has to be burned in: a blur drawn as an overlay could be removed with dev tools.

**How Waypost does it.**
- `BlurRegion { keyframes: [{ sourceTime, rect }], style: "gaussian" | "pixelate" | "solid", strength }`. Rects interpolate linearly between keyframes; the region is active only inside its time range.
- **Editing:** Blur tool (X): draw a rect, scrub forward, move it, and a keyframe is added automatically. Blur regions show as bars on their own timeline lane. There's no limit on how many regions a project has or how many overlap at once.
- **Rendering:** the compositor applies canvas `filter: blur()` (gaussian) or a downscale/upscale (pixelate) clipped to the rect. Pixelate and solid are the safest choices for sensitive text.
- **Always baked:** stills, segments, MP4, PDF and screenshots are rendered from blurred frames. No output has an unblurred path, and the player never sees unblurred pixels.
- **Phase 6 bonus:** a tracking assist (template matching in a worker) and auto-redaction suggestions using OCR (Tesseract.js, loaded only when used) with patterns for emails, API keys and card numbers.

## F8 — Narration ("Voice Over")

**What it does.** Three options: keep the recording's original audio, upload your own voice, or generate a voiceover from step titles. Narration belongs to the video and interactive guide only, not PDF or screenshots.

**How FramePin likely does it (inferred).** Original audio is cut along with the video. Generated voiceover is probably a cloud text-to-speech call, because the browser's speech API can speak aloud but can't save audio to a file.

**How Waypost does it.**
1. **Original audio** follows the timeline edits. Speed changes are pitch-corrected in exports.
2. **Your own voice:** import an audio file, or **record per step** in the browser (microphone through `getUserMedia` + `MediaRecorder`).
3. **Generated voiceover, free and local:** **Kokoro** (an 82-million-parameter open model, Apache-2.0) runs in a Web Worker through `kokoro-js`. The model is downloaded once and cached: about 90 MB for the compact build, up to about 330 MB for the highest quality (fastest with WebGPU in Chrome). Several voices are available. Optional later: a cloud TTS provider using your own API key.

**In the clickable mockup** (`design/mockup/editor.html`) each step has a **Source**: generated voice, my recorded voice, audio file, original audio, or none. It plays for real while you play the timeline, and in the guide preview:
- *Generated voice* uses the browser's built-in speech (Kokoro replaces it in the app). The browser can't seek or fade speech, so it starts at the top of the voice bar and ignores fades; the bar's length is measured from the first time it plays.
- *Recorded* and *file* clips are decoded for their length and a waveform, then follow the playhead, the speed (pitch kept), volume and fades. Recording needs microphone access, which an embedded or published page may not get; importing a file always works.
- Clips live outside the undo history (the step keeps a small pointer), so undo and redo never copy audio. **M** turns sound off.

**Timing rule.** A step's hold lasts at least as long as its narration: `hold = max(minHold, narrationDuration + 0.4 s, revealGroups × revealInterval)`. In the player, step audio starts when the still appears. Browsers block autoplay with sound, so guides with audio start with a "Start guide" button; that first click unlocks audio.

## F9 — Interactive guide player ("Widget")

**What it does.** A click-through guide that "automatically matches the recording's aspect ratio, works inside SPA and CMS content, and can use your logo, accent color, controls, and default playback mode."

**How Waypost does it.** `@waypost/player`: a small script with no framework, built from this repo and copied into every exported guide. It reuses `@waypost/render`.
- **Playback modes:** `guided` (stop at every step, click to continue; the default), `auto` (stop for the hold time, then continue) and `video` (continuous, with step markers on the progress bar).
- **Controls:** previous/next, step counter (`3 / 12`), progress bar with step markers, restart, mute, fullscreen. Each can be shown or hidden.
- **Keyboard and accessibility:** ←/→ and Space to navigate; step titles announced through an `aria-live` region; callout text mirrored in a visually hidden text layer for screen readers; `prefers-reduced-motion` turns zoom and pulses into fades.
- **Branding:** logo, accent color, light/dark/auto chrome.
- **Aspect ratio:** from `guide.json`; the stage keeps it with CSS `aspect-ratio`.
- **Works on any site:** renders inside a **Shadow DOM** so the host page's CSS can't interfere. It finds `[data-waypost]` elements on load and watches for new ones (React/Vue apps, CMS editors). It also exposes `Waypost.mount(el, url)` and lazy-loads media when scrolled into view.
- **In-editor preview** runs the same player code, so preview equals what viewers see.

## F10 — Call-to-action button

**What it does.** A button to "a signup, booking, documentation, or other URL".

**How Waypost does it.** `cta { label, url, showAt: "end" | stepId, newTab }`. It shows on the end card by default or on a chosen step, in the accent color. Clicks emit a `cta` analytics event (F12).

## F11 — Embed with two lines of HTML, or a standalone link

**What it does.** "Publish the interactive guide, embed it with two lines of HTML, or share its standalone link." FramePin charges for this because it hosts the files.

**How Waypost does it.** Export produces a **static folder** (or zip) that works on any static host: GitHub Pages, Cloudflare Pages, Netlify, S3/R2 or your own server. There's no Waypost server and no fee.

```
connect-calendar/
  index.html             ← the standalone link
  player.js              ← the web player
  guide.json             ← steps, annotations, branding
  guide.pdf              ← compressed PDF copy (F14)
  steps/<step-id>.webp   seg/<step-id>.mp4   audio/<step-id>.m4a
```

The two-line embed:

```html
<div data-waypost="https://you.github.io/guides/connect-calendar/guide.json"></div>
<script src="https://you.github.io/guides/connect-calendar/player.js" async></script>
```

An `<iframe src=".../index.html">` snippet is offered too, for CMSs that strip scripts. Phase 5 adds one-click publishing (GitHub Pages first, then S3-compatible storage).

## F12 — Analytics

**What it does.** Views counted without cookies, with "privacy-friendly unique visitors". Pro shows how many sessions reached each step (drop-off).

**How FramePin likely does it (inferred).** A Plausible-style approach: no cookies, and unique visitors estimated server-side from a hash of IP + user agent + a daily rotating salt that's discarded each day.

**How Waypost does it (optional, off by default).**
- The player sends tiny events with `navigator.sendBeacon`: `{ guide, session, event: view | step | complete | cta, step, ts }`. `session` is a random ID held in memory for one page view; nothing is stored on the viewer's device.
- `analytics.endpoint` in `guide.json` points at a collector you choose. The repo will ship a reference **Cloudflare Worker + D1** collector (fits in the free tier) that applies daily-salt hashing and serves `/stats?guide=…`.
- The editor shows a per-step reach funnel.
- With no endpoint configured, the player sends nothing.

## F13 — MP4 export up to 4K

**What it does.** A standard video up to 4K that keeps titles, annotations, blur and narration.

**How Waypost does it.** In a Web Worker:
1. Walk the timeline, decoding source frames with Mediabunny. Insert a **hold** at every step (the step frame repeated for the hold duration).
2. Run each frame through the compositor (`@waypost/render`): background (F18) → recording with blur → zoom → annotations at their reveal progress → logo (F19) → title caption.
3. Encode with WebCodecs (H.264, or HEVC where supported) through Mediabunny's canvas source and MP4 muxer. Presets: 720p, 1080p, 1440p, 2160p, capped at the source resolution.
4. Mix audio (original, narration, music) with an `OfflineAudioContext`. Encode as AAC where the browser supports it, otherwise with Mediabunny's AAC encoder add-on.

Rendering a long 4K video takes a while, so export shows progress, can be cancelled, and the editor stays usable.

## F14 — PDF export (one page per step)

**What it does.** One page per pinned step, for documentation, client handoffs or a LinkedIn carousel. Paid FramePin plans host a compressed copy.

**How Waypost does it.** **pdf-lib** builds the PDF in the browser. Text is real, selectable text in the embedded Figtree font; each page shows the step number, title, annotated still and optional body. A bookmark outline lists every step. Page presets: A4/Letter (docs), 16:9 (slides), 1080×1350 (LinkedIn carousel, 4:5). A compressed copy (images 1600 px wide, JPEG quality 0.75) goes into every guide bundle.

## F15 — Screenshot export (PNG/WebP)

**What it does.** Each pinned frame as PNG or WebP with annotations in place. Paid FramePin plans host optimized WebP at fixed per-step links.

**How Waypost does it.** Render each step through the compositor onto an `OffscreenCanvas` and save with `convertToBlob` as PNG or WebP. Chrome encodes WebP natively; browsers that can't fall back to PNG. Options: annotated or clean, 1× or 2×, file names like `01-open-settings.png`, delivered as a zip (fflate). "Fixed per-step links" come free: bundle files are named by **step ID**, not position, so reordering steps doesn't break shared links.

## F16 — Local-first privacy

**What it does.** "Editing runs in Chrome on your computer. The original recording and local exports are not uploaded." Publishing uploads only generated step media and metadata.

**How Waypost does it.** Same principle, enforced by design. The editor is a static site with no backend. Recordings and projects live in your browser's private storage (OPFS) and in `.waypost` files you save. The only network traffic is loading the app, the one-time voice model download (F8), publishing to a host *you* configure, and the optional analytics endpoint *you* configure.

**Caveat:** browser storage can be wiped if you clear site data. Waypost asks the browser for persistent storage and nudges you to save `.waypost` project files (Chrome can save straight to a folder you pick).

## F17 — Accounts, trial and plan limits (replaced by a one-off purchase)

FramePin: build and preview free without an account. PDF and screenshot exports are free. A 14-day trial unlocks publishing, and the paid Creator and Pro plans set limits on live guides and monthly publishing; only Pro gets per-step analytics. FramePin's dollar prices didn't appear in search results.

Waypost replaces all of it with one purchase: every feature, no plan limits, no monthly fee, and you host the output wherever you like.

## F18 — Background and framing

**What it does (from the screenshot).** A **Background** tab, and a checkerboard (transparent) area around the recording on the canvas. FramePin probably lets you put the recording on a padded background **(inferred)**, like ScreenStudio's "beautify" feature.

**How Waypost does it.** `frame { padding, background: none | color | gradient | image, cornerRadius, shadow, aspect: "source" | "16:9" | "4:3" | "1:1" | "4:5" }`. The compositor draws the background, then the recording inset with rounded corners and a soft shadow. MP4 has no transparency, so "none" becomes a solid fill there; PNG and WebP keep transparency. Presets: a few gradients that fit our palette, plus custom colors and images.

## F19 — Logo placement

**What it does (from the screenshot).** A **Logo** tab next to Background. Likely a logo placed on the frame and in the player **(inferred)**.

**How Waypost does it.** `logo { image, corner: tl | tr | bl | br, size, margin, opacity }` drawn by the compositor in exports. In the player, the logo also appears in the control bar (F9 branding). Supports SVG and PNG.

## F20 — Background audio (music)

**What it does (from the screenshot).** An "ADD BACKGROUND AUDIO" timeline lane.

**How Waypost does it.** A music lane with one audio file: volume, loop, fade in/out, and automatic **ducking** under narration. Mixed into MP4. In the player, music loops quietly while the guide is open, ducks during step narration, and stops when the viewer pauses or leaves.

## F21 — Snapshot

**What it does (from the screenshot).** A "Snapshot" button next to Undo. Most likely saves the current frame as an image, or adds the current frame without a click target **(inferred)**.

**How Waypost does it.** "Copy frame" (in the canvas right-click menu and the ⌘K command palette) copies the fully composited current frame to the clipboard, and "Save frame…" downloads it as PNG. There's no default shortcut, because ⇧⌘C and ⌥⌘C belong to Chrome's dev tools. Pinning without a click target is handled by the "+ Pin step" button (F3), so one button doesn't have two possible meanings.

## F22 — Undo (and redo)

**What it does (from the screenshot).** An Undo button. No redo is visible.

**How Waypost does it.** Full undo/redo (⌘Z / ⇧⌘Z) for every edit. Every change goes through a command layer that records inverse patches (see architecture), and menu labels name the change ("Undo Move Arrow").

---

## Beyond FramePin

Optional extras after parity. Each one is cheap in the browser.

| Bonus | How |
|---|---|
| **Record in the app** | `getDisplayMedia` + `MediaRecorder` records a screen, window or tab straight into a new project. |
| **Click-capture extension** | A web page can't see clicks outside its own tab. An optional Waypost browser extension can log clicks inside the web apps you're recording and propose a step at each click, Arcade/Scribe-style. |
| **Auto-redaction suggestions** | OCR + patterns (F7). |
| **Auto step titles** | OCR the text under each click marker ("Click 'Settings'"). Optional polish with an LLM using your own API key. |
| **Markdown/HTML SOP export** | A docs-style page per guide (title, numbered steps, annotated images) that pastes cleanly into help centers and wikis. |
| **Light and dark editor themes** | FramePin's editor appears to be dark-only. |

---

## Sources

- [FramePin homepage](https://framepin.com/): the only first-party text source. Search snippets quoted its workflow, exports, privacy, branding, analytics and plan copy. [framepin.com/tutorials](https://framepin.com/tutorials) couldn't be fetched from the build environment.
- FramePin editor screenshot supplied by the project owner (not committed).
- [Mediabunny](https://mediabunny.dev/): format support (MP4, MOV, WebM, MKV and more) and WebCodecs encoding, confirmed from the package README.
- [kokoro-js on npm](https://npmjs.com/package/kokoro-js) and [Kokoro WebGPU demo](https://huggingface.co/spaces/webml-community/kokoro-webgpu): in-browser TTS options; model sizes from [Hugging Face](https://huggingface.co/aeli3) and [OfflineTTS](https://offlinetts.com/app/kokoro/).
- [MDN: AudioEncoder](https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder) and the [W3C AAC registration](https://www.w3.org/TR/2022/DNOTE-webcodecs-aac-codec-registration-20221115/): AAC encoding is optional for browsers, hence the fallback.
- Unrelated namesake: [Framepin (framepin.co)](https://www.framepin.co/en), a filming-locations travel app.
