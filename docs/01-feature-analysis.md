# 01 — FramePin feature analysis

What FramePin does, how each feature most likely works under the hood, and how OpenPin rebuilds it as a native Mac app.

**How this was researched.** framepin.com is blocked from the build container, so everything below comes from FramePin's public homepage text as surfaced by web search (sources at the bottom). Statements about *what* FramePin does are taken from its marketing copy. Statements about *how* it does it are marked **(inferred)**. They're educated guesses from the product's behavior and constraints, not facts. Nobody has seen FramePin's code, and we don't want to: OpenPin is a clean-room rebuild from public behavior. Don't copy FramePin's code, text, logo, screenshots or exact UI.

---

## The product in one paragraph

FramePin turns an existing screen recording into an **interactive, click-through product guide**. You load a recording from any recorder, cut out the mistakes, then **pin** individual frames as steps. Each step gets a title plus callouts, arrows, spotlights and zoom. When someone views the guide, the video plays between steps and **stops on each pinned frame** until the viewer clicks to continue. The same project also exports to MP4, PDF and PNG/WebP screenshots. Editing runs locally in Chrome; publishing uploads only the generated step media and pays for hosting, embedding and analytics.

## Feature inventory

| # | Feature | FramePin tier | OpenPin phase |
|---|---------|---------------|---------------|
| F1 | Import any screen recording | Free | 1 |
| F2 | Trim, split and per-section speed, with frame-level control | Free | 2 |
| F3 | Pin frames as steps; motion kept between steps | Free | 1 |
| F4 | Step titles | Free | 1 |
| F5 | Callouts, arrows, spotlights, zoom | Free | 1 (zoom: 2) |
| F6 | Control the order annotations appear in | Free | 2 |
| F7 | Keyframed blur that follows sensitive info | Free | 2 |
| F8 | Narration: original audio, uploaded voice, or generated voiceover | Free (preview) | 4 |
| F9 | Interactive guide player with branding and playback modes | Paid to publish | 3 |
| F10 | Call-to-action button | Paid to publish | 3 |
| F11 | Embed with two lines of HTML, or share a standalone link | Paid | 3 (+5 for hosting) |
| F12 | Cookieless view analytics; per-step reach (Pro) | Paid / Pro | 5 |
| F13 | MP4 export up to 4K | Free | 2 |
| F14 | PDF export, one page per step; hosted compressed copy | Free / paid hosting | 1 (+5) |
| F15 | PNG/WebP export per step; hosted WebP at fixed per-step links | Free / paid hosting | 1 (+4 WebP) |
| F16 | Local-first privacy | n/a | Built in |
| F17 | Accounts, trial, plan limits | n/a | **Dropped** |

Phases are defined in [04-roadmap.md](04-roadmap.md).

---

## F1 — Import any screen recording

**What it does.** FramePin takes recordings from "Loom, ScreenStudio, OBS, QuickTime, Zoom, or another screen recorder". There's no built-in recorder; you bring a file.

**How FramePin likely does it (inferred).** The editor is Chrome-only on desktop, which points to the **WebCodecs** API (`VideoDecoder`) plus a JS demuxer such as mp4box.js reading the file locally through the File System Access API. That explains both "Chrome only" and "your recording is never uploaded".

**How OpenPin does it.**
- Open the file with `AVURLAsset` and load tracks, duration, natural size, frame rate and preferred transform with the async `load(_:)` API (macOS 12+).
- Build a **frame index** in the background: walk the video track with `AVAssetReader` and record every sample's presentation timestamp. Screen recordings are often **variable frame rate** (QuickTime and ScreenStudio drop frames when nothing moves), so "next frame" can't be computed as `t + 1/fps`. The index makes frame stepping and pinning exact.
- Generate filmstrip thumbnails with `AVAssetImageGenerator` (`image(at:)`, macOS 13+), cached on disk in the project package.
- Keep a security-scoped bookmark to the original file (App Sandbox), with an optional "Copy into project" so the project stays self-contained.

**Gotchas.**
- AVFoundation reads MOV, MP4 and M4V. It **can't read MKV or WebM**. Loom and Zoom downloads are MP4 and QuickTime and ScreenStudio export MOV/MP4, but OBS users may have MKV. Phase 1: show a clear message ("In OBS use File › Remux Recordings to make an MP4"). Later: optional remux through a bundled LGPL ffmpeg.
- HDR or Display P3 recordings need converting to sRGB for web output (Core Image handles it if the working color space is set explicitly).
- 5K/6K Retina recordings are huge. Decode at full resolution for stills but scale on output.

## F2 — Trim, split and speed with frame-level control

**What it does.** "Remove mistakes, split sections, and adjust their speed with frame-level control."

**How FramePin likely does it (inferred).** A non-destructive edit list over the source video, rendered with WebCodecs at export/publish time.

**How OpenPin does it.**
- **Edit model:** the timeline is an ordered list of clips: `Clip { sourceID, sourceRange, speed }`. Splitting turns one clip into two. Deleting a range removes or shortens clips. Nothing touches the source file.
- **Playback:** rebuild an `AVMutableComposition` from the clip list whenever it changes. Speed is `scaleTimeRange(_:toDuration:)` on each clip's range. Set `audioTimePitchAlgorithm = .spectral` so sped-up audio doesn't chipmunk.
- **Frame-level control:** `AVPlayerItem.step(byCount:)` for ±1 frame, plus seeking with zero tolerance (`seek(to:toleranceBefore: .zero, toleranceAfter: .zero)`). Snap the playhead to timestamps from the F1 frame index.
- **Time mapping:** one pure function, `timelineTime ↔ (clip, sourceTime)`, lives in `OpenPinCore` and is heavily unit-tested. Every other feature depends on it.

**Key design decision.** Steps, blur keyframes and narration are anchored to **source time**, not timeline time. Trimming earlier in the video then never shifts a pinned frame. If a trim removes a step's frame, the step is flagged "orphaned" rather than silently deleted.

## F3 — Pin frames as steps (motion kept between steps)

**What it does.** "Pause on an exact frame and pin it as a guide step." The viewer "stops at each step and continues when ready", and "the motion between pinned moments" is kept.

**How FramePin likely does it (inferred).** On publish, FramePin uploads "generated step media", so it probably cuts the edited video into one short clip per step (the motion leading up to it) and one still image of the exact pinned frame. The player plays clip *n*, then shows still *n* with its annotations and waits. Pausing a single long video at timestamps with `timeupdate` is too imprecise (it fires every ~250 ms), which is why we think they split the media.

**How OpenPin does it.**
- **Editor:** press `P` (or click the pin button) to pin the current frame. The step appears in the left-hand step list and as a pin marker on the timeline. Drag the marker to re-time it. Steps are always sorted by time.
- **Segments:** segment *n* runs from step *n−1* (or the start) to step *n*. An optional outro segment runs after the last step.
- **Published media per step:** `seg/<step-id>.mp4` (H.264, blur baked in, no annotations), `steps/<step-id>.webp` (the exact pinned frame, blur baked in, no annotations) and optional `audio/<step-id>.m4a` narration. The player draws annotations itself so they stay crisp and accessible.
- **Player:** play segment *n* → on `ended`, show still *n* (pixel-exact, no seek drift) → reveal annotations → wait for Next/click/→ → preload and play segment *n+1*.

## F4 — Step titles

**What it does.** Each step gets a short title. Titles also drive the generated voiceover (F8) and appear in MP4 (F13) and PDF (F14).

**How OpenPin does it.** `Step.title` (one line) plus an optional `Step.body` (a longer note, used in PDF and Markdown export) and optional `Step.narrationScript` (defaults to the title). Edit inline in the step list or in the inspector. Phase 6 adds auto-suggested titles (see "Beyond FramePin").

## F5 — Callouts, arrows, spotlights and zoom

**What it does.** "Guide attention with callouts, arrows, spotlights and zoom."

**How OpenPin does it.** Each step has a list of annotations stored in **normalized coordinates** (0–1 of the source frame), so they scale to any output size.

| Annotation | Geometry | Rendering notes |
|---|---|---|
| **Callout** | anchor point + text + placement (auto/top/bottom/left/right) | Rounded bubble with a pointer. Auto placement flips to stay in frame. Text wraps at a max width. |
| **Arrow** | from/to points + curvature | Thick stroke with an arrowhead and a 2 px white halo, so it reads on both light and dark UIs. |
| **Spotlight** | rect or ellipse + feather + dim amount | Dims everything outside the shape (default 55% black, 12 px feather). |
| **Box / highlight** | rect + stroke/fill | Simple outline or translucent fill. |
| **Click ripple** (ours) | point | Concentric pulse to show "click here". Not in FramePin, but cheap and useful. |
| **Zoom** (per step, not a list item) | target rect + easing | Animated scale and translate into the rect when the step is reached. |

**One renderer, many outputs.** A single `AnnotationRenderer` in Core Graphics/Core Text draws into any `CGContext`. The editor canvas uses it through SwiftUI `Canvas { ctx in ctx.withCGContext { … } }`, and PNG, PDF and MP4 exports use the same code, so what you see is what you export. The web player is the only second implementation (SVG and HTML). Snapshot tests keep the two matching (see [02-architecture.md](02-architecture.md#testing)).

**Zoom.** In the player, zoom is a CSS `transform` on the stage that eases in when the step's still appears. The still is full resolution, so it stays sharp. In MP4 export, the custom video compositor applies the same transform per frame with Core Image.

## F6 — Annotation reveal order

**What it does.** "Control the order in which these appear."

**How OpenPin does it.** Each annotation has a `reveal` index (0, 1, 2…). Annotations sharing an index appear together. The inspector shows the reveal groups as a reorderable list.
- **Player:** groups appear one after another with a short fade or scale-in. Mode option: on a timer (default 600 ms apart) or one per click/→ press before advancing to the next step.
- **MP4:** groups animate in during the step's hold.
- **PDF/PNG:** everything is shown at once (static output).

## F7 — Keyframed blur regions

**What it does.** "Keyframed blur regions can follow sensitive information as it moves." Blur is rendered into the interactive guide and every export.

**How FramePin likely does it (inferred).** Rectangles with keyframes, interpolated per frame and applied while encoding, so the blur is burned into the pixels. It has to be burned in: a blur drawn as an overlay could be removed in dev tools.

**How OpenPin does it.**
- `BlurRegion { keyframes: [(sourceTime, rect)], style: gaussian | pixelate | solid, strength }`. Rects interpolate linearly between keyframes; the region is active only inside its time range.
- **Live preview:** the custom `AVVideoCompositing` compositor (shared with MP4 export, see architecture) applies `CIGaussianBlur` or `CIPixellate` cropped to the interpolated rect, so you see the blur while scrubbing.
- **Tracking assist:** draw the rect once, press "Track", and Vision's `VNTrackObjectRequest` follows it frame by frame through `AVAssetReader`. The result is simplified to a handful of editable keyframes.
- **Always baked:** stills, segments, MP4, PDF and screenshots are rendered from blurred frames. There's no unblurred path in any output.
- **Phase 6 bonus:** auto-redaction suggestions. Run `VNRecognizeTextRequest` on sampled frames, match emails, API keys, card numbers (Luhn-checked) and phone numbers, and propose blur regions for you to confirm.

## F8 — Narration (optional)

**What it does.** Three options: keep the recording's original audio, upload your own voice, or generate a voiceover from step titles. Narration belongs to the video and interactive guide only, not PDF or screenshots.

**How FramePin likely does it (inferred).** Original audio is cut along with the video. Generated voiceover is probably a cloud text-to-speech call, because the browser's Web Speech API can't record speech to a file.

**How OpenPin does it.**
1. **Original audio:** the source audio track follows the timeline edits automatically (it's in the same composition). Speed changes are pitch-corrected.
2. **Your own voice:** import an audio file (M4A, MP3, WAV, AIFF) as one continuous track, or **record per step** inside the app with `AVAudioEngine` (needs microphone permission).
3. **Generated voiceover, free and offline:** `AVSpeechSynthesizer.write(_:toBufferCallback:)` (macOS 10.15+) renders each step's narration script straight to an `AVAudioFile`. Users can pick any installed system voice, including the downloadable Enhanced/Premium voices, and on macOS 14+ their **Personal Voice** after granting permission. A cloud TTS provider with a user-supplied API key can come later as a plugin, but the default costs nothing.

**Timing rule.** A step's hold lasts at least as long as its narration: `hold = max(minHold, narrationDuration + 0.4 s, revealGroups × revealInterval)`. In the player, step audio starts when the still appears. Browsers block autoplay with sound, so the guide starts with a "Start guide" button. That first click unlocks audio.

## F9 — Interactive guide player (branding and playback modes)

**What it does.** A click-through guide that "automatically matches the recording's aspect ratio, works inside SPA and CMS content, and can use your logo, accent color, controls, and default playback mode."

**How OpenPin does it.** A small TypeScript web player with no dependencies (target under 40 KB gzipped). It's built from `player/` in this repo and copied into every exported guide.
- **Playback modes:** `guided` (stop at every step, click to continue; the default), `auto` (stop for the hold time, then continue) and `video` (continuous playback with step markers on the progress bar).
- **Controls:** previous/next, step counter (`3 / 12`), progress bar with step pins, restart, mute, fullscreen. Each can be shown or hidden.
- **Keyboard and accessibility:** ←/→ and Space to navigate, Esc to leave fullscreen. Step titles go to an `aria-live` region, callout text is real DOM text, and `prefers-reduced-motion` turns zoom and pulse animations into fades.
- **Branding:** logo, accent color (drives buttons, progress and default annotation color) and light/dark/auto chrome.
- **Aspect ratio:** read from `guide.json`; the stage keeps it with CSS `aspect-ratio` and resizes through `ResizeObserver`.
- **SPA/CMS friendly:** renders inside a **Shadow DOM** so host-page CSS can't leak in or out. It scans for `[data-openpin]` elements on load and watches for new ones with a `MutationObserver` (so it works in React/Vue apps and CMS editors). It also exposes `window.OpenPin.mount(el, url)` for manual control and lazy-loads media when scrolled into view (`IntersectionObserver`).
- **In-app preview:** the Mac app previews guides in a `WKWebView` running the *same* `player.js`, so the preview is exactly what viewers get.

## F10 — Call-to-action button

**What it does.** A button that sends viewers to "a signup, booking, documentation, or other URL".

**How OpenPin does it.** `cta { label, url, showAt: "end" | stepID, openInNewTab }`. It appears on the end card by default or on a chosen step, styled with the accent color. Clicks emit a `cta` analytics event (F12).

## F11 — Embed with two lines of HTML, or a standalone link

**What it does.** "Publish the interactive guide, embed it with two lines of HTML, or share its standalone link." On FramePin this needs a paid plan, because FramePin hosts the files.

**How OpenPin does it.** Export produces a **static folder** that works on any static host: GitHub Pages, Cloudflare Pages, Netlify, an S3 or R2 bucket, or your own server. There's no OpenPin server and no monthly fee.

```
connect-calendar/
  index.html          ← the standalone link
  player.js           ← the web player
  guide.json          ← steps, annotations, branding
  guide.pdf           ← compressed PDF copy (F14)
  steps/<step-id>.webp, seg/<step-id>.mp4, audio/<step-id>.m4a
```

The two-line embed:

```html
<div data-openpin="https://you.github.io/guides/connect-calendar/guide.json"></div>
<script src="https://you.github.io/guides/connect-calendar/player.js" async></script>
```

An `<iframe src=".../index.html">` snippet is offered too, for CMSs that strip scripts. Phase 5 adds one-click publishing adapters (GitHub Pages first, then S3-compatible storage), with credentials kept in the macOS Keychain.

## F12 — Analytics

**What it does.** Views are counted without cookies, with "privacy-friendly unique visitors". Pro shows how many sessions reached each step, so you can see where people drop off.

**How FramePin likely does it (inferred).** A Plausible-style approach: no cookies, and unique visitors estimated server-side from a hash of IP + user agent + a daily rotating salt, with the salt thrown away each day.

**How OpenPin does it (optional, off by default).**
- The player sends tiny events with `navigator.sendBeacon`: `{ guide, session, event: view|step|complete|cta, step, ts }`. `session` is a random ID held in memory for one page view. Nothing is stored on the viewer's device.
- `analytics.endpoint` in `guide.json` points at whatever collector you choose. The repo will ship a reference **Cloudflare Worker + D1** collector (fits in the free tier) that applies the daily-salt hashing and serves `/stats?guide=…`.
- The Mac app shows a per-step reach funnel with Swift Charts.
- With no endpoint configured, the player sends nothing.

## F13 — MP4 export up to 4K

**What it does.** A standard video up to 4K that keeps titles, annotations, blur and narration.

**How OpenPin does it.**
- Build an `AVMutableComposition` from the clip list and insert a **hold** (an empty time range) at every step.
- A custom `AVVideoCompositing` compositor renders each output frame: source frame (or the cached step frame during a hold) → blur regions → zoom transform → annotations at their reveal progress → title caption. The same compositor drives the editor's live preview.
- Encode with `AVAssetWriter`: H.264 (works everywhere) or HEVC (smaller), 30 or 60 fps, presets 720p / 1080p / 1440p / 2160p, capped at the source resolution.
- Audio: original audio, imported voice and generated voiceover mixed with an `AVMutableAudioMix`. Optional ducking lowers the original audio under narration.

## F14 — PDF export (one page per step)

**What it does.** One page per pinned step, for documentation, client handoffs or a LinkedIn carousel. Paid FramePin plans also host a compressed copy.

**How OpenPin does it.**
- Draw into a Core Graphics PDF context (`CGContext(url:mediaBox:)`). Text goes through Core Text, so it stays **real, selectable text**. Each page shows the step number, title, annotated still and optional body text.
- Add a PDF outline (bookmarks) per step with PDFKit.
- Page presets: A4/Letter (documentation), 16:9 (slides), 1080×1350 (LinkedIn carousel, 4:5).
- "Compressed copy" for the guide bundle: images scaled to 1600 px wide, JPEG quality 0.75.

## F15 — Screenshot export (PNG/WebP)

**What it does.** Each pinned frame as PNG or WebP with annotations in place. Paid FramePin plans host optimized WebP files at fixed per-step links.

**How OpenPin does it.**
- PNG through ImageIO (`CGImageDestination`).
- **WebP needs a library.** Apple's ImageIO decodes WebP but doesn't encode it (developers get "unsupported file format 'org.webmproject.webp'"). Bundle **libwebp** through Swift Package Manager. At runtime, check `CGImageDestinationCopyTypeIdentifiers()` first in case a future macOS adds native encoding.
- Options: annotated or clean, 1× or 2×, file names like `01-open-settings.png`.
- "Fixed per-step links" come free: the bundle names files by **step ID**, not position (`steps/<step-id>.webp`), so reordering steps doesn't break links people have already shared.

## F16 — Local-first privacy

**What it does.** "Editing runs in Chrome on your computer. The original recording and local exports are not uploaded." Publishing uploads only the generated step media and metadata.

**How OpenPin does it.** A native app is local by default. OpenPin has no server and no account. The only network traffic is (a) publishing to a host *you* configure and (b) the optional analytics endpoint *you* configure. The App Sandbox only grants network access for those features.

## F17 — Accounts, trial and plan limits (dropped)

FramePin: build and preview free without an account. PDF and screenshot exports are free. A 14-day trial unlocks publishing, and the paid Creator and Pro plans set limits on live guides and monthly publishing; only Pro gets per-step analytics. FramePin's dollar prices didn't appear in search results.

OpenPin drops all of this. Every feature is free, there are no limits, and you host the output wherever you want.

---

## Beyond FramePin: Mac-native advantages

These are cheap to build natively and give OpenPin features FramePin doesn't advertise. They're all optional and come after parity.

| Bonus | How | macOS |
|---|---|---|
| **Built-in recorder** | ScreenCaptureKit: `SCStream` → `AVAssetWriter` (12.3+), or `SCRecordingOutput` (15+). The system picker `SCContentSharingPicker` (14+) handles window/display choice. | 14 baseline |
| **Auto-pin at clicks** | While recording, log mouse-click times and positions with `NSEvent.addGlobalMonitorForEvents` (mouse events need no extra permission; keystrokes would need Accessibility, which we don't need). After recording, propose a step at each click with a click-ripple annotation at the cursor position. This is how Scribe and Arcade work, and it saves most of the manual pinning. | 14 |
| **Auto-redaction suggestions** | Vision OCR + pattern matching (F7). | 14 |
| **Auto step titles** | OCR the text under each click ("Click 'Settings'"). On macOS 26+ with Apple Intelligence, polish it with the on-device **Foundation Models** framework. Gated with `#available`. | 26 for LLM |
| **Transcribe original audio** | `SFSpeechRecognizer` (all versions) or `SpeechAnalyzer` (26+) to turn spoken narration into step titles or captions. | 14 / 26 |
| **Markdown/HTML SOP export** | A docs-style page per guide (title, numbered steps, annotated images). Pastes cleanly into help centers and wikis. | 14 |

---

## Sources

- [FramePin homepage](https://framepin.com/): the only first-party source available. Search snippets quoted its workflow, exports, privacy, branding, analytics and plan copy. The tutorials page ([framepin.com/tutorials](https://framepin.com/tutorials)) couldn't be fetched from the build environment.
- [Apple Developer Forums: "unsupported file format 'org.webmproject.webp'"](https://developer.apple.com/forums/thread/688001): evidence that ImageIO doesn't encode WebP.
- [macOS 27 Golden Gate (Low End Mac)](https://lowendmac.com/2026/macos-27-0-golden-gate/) and [MacTech](https://www.mactech.com/2026/06/08/we-were-wrong-macos-27-is-dubbed-golden-gate-not-big-bear/): confirm the macOS 27 name.
- [macOS Golden Gate: the first Apple-silicon-only macOS (Evetech)](https://evezone.evetech.co.za/quick-bytes/what-is-macos-golden-gate-27-the-first-apple-silicon-only-macos): background for the deployment-target decision.
- Unrelated namesake to avoid confusion with: [Framepin (framepin.co)](https://www.framepin.co/en), a filming-locations travel app.
