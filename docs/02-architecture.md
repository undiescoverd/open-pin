# 02 — Architecture

How OpenPin is built: platform targets, tech stack, repo layout, data model, rendering pipeline, the published guide format, permissions, testing and distribution.

## Decisions at a glance

| Decision | Choice | Why |
|---|---|---|
| App type | **Native macOS app** (Swift, SwiftUI with AppKit where needed) | Hardware video decode/encode through VideoToolbox, 4K export without browser limits, Vision for blur tracking and OCR, free offline text-to-speech, ScreenCaptureKit for a built-in recorder later. FramePin had to live in Chrome; we don't. |
| Minimum macOS | **macOS 14 Sonoma** | Three releases behind Golden Gate (27 → 26 Tahoe → 15 Sequoia → 14 Sonoma). It's the first release with `@Observable`, the SwiftUI `.inspector` pane, `SCContentSharingPicker` and Personal Voice. Going lower would cost real APIs for little benefit. |
| Build SDK | Latest Xcode with the macOS 27 SDK, Swift 6 language mode | Newer APIs can be adopted behind `#available` checks. |
| CPU | Universal binary (arm64 + x86_64) | Golden Gate is Apple-silicon-only, but Sonoma and Sequoia still run on Intel Macs. Universal costs nothing extra. |
| Project format | Document-based app (`DocumentGroup` + `ReferenceFileDocument`) storing a `.openpin` package | Finder integration, autosave, Versions and Recent Documents for free. |
| Interactive player | **TypeScript web player**, no runtime dependencies | Guides are viewed in browsers. The Mac app bundles the built `player.js` and uses it for in-app preview too. |
| Hosting | Static files on any host; no OpenPin server | Removes the reason FramePin charges a subscription. |

### OS availability tiers

The app is fully functional on macOS 14. Newer systems light up extras.

| Tier | APIs | Used for |
|---|---|---|
| **14 Sonoma (baseline)** | SwiftUI + `@Observable`, `.inspector`, AVFoundation, Core Image, Vision (`VNTrackObjectRequest`, `VNRecognizeTextRequest`), `AVSpeechSynthesizer.write`, Personal Voice, ScreenCaptureKit + `SCContentSharingPicker`, PDFKit, WebKit, Swift Charts | Everything in the parity roadmap |
| **15 Sequoia** | `SCRecordingOutput` (simpler recording path), Swift-native Vision requests, Translation framework | Simpler recorder; optional title translation |
| **26 Tahoe** | Liquid Glass (`.glassEffect`), Foundation Models (on-device LLM), `SpeechAnalyzer` | Glass toolbars; auto step titles; better transcription |
| **27 Golden Gate** | Whatever ships that we want, e.g. the new SwiftUI document API shown at WWDC26 | Adopt once stable; never required |

Rule: **no feature in the parity roadmap may require more than macOS 14.** Anything newer is wrapped in `if #available(macOS 26, *)` with a working fallback, such as `.regularMaterial` instead of Liquid Glass.

## Repo layout

```
open-pin/
├─ OpenPin.xcodeproj           Mac app target (thin: scenes, windows, menus, entitlements)
├─ App/                        SwiftUI app sources: editor screens and view models
├─ Packages/
│  ├─ OpenPinCore/             Pure Swift: document model, timeline/time-mapping math,
│  │                           commands + undo, guide.json schema. No Apple media frameworks.
│  ├─ OpenPinMedia/            AVFoundation: import, frame index, thumbnails, composition,
│  │                           video compositor, MP4/PNG/WebP/PDF export, TTS, audio mix
│  ├─ OpenPinVision/           Blur tracking, OCR redaction suggestions (later: auto titles)
│  ├─ OpenPinPublish/          Guide bundle writer, publish adapters (folder, GitHub Pages, S3)
│  └─ PinKit/                  Design system: tokens + SwiftUI components (see 03-design-system.md)
├─ player/                     TypeScript web player (Vite library build → player.js)
├─ analytics/worker/           Optional reference collector (Cloudflare Worker + D1)
├─ design/tokens.json          Single source of truth for colors/spacing/radii → Swift + CSS
└─ docs/
```

Keeping `OpenPinCore` free of AVFoundation means the most bug-prone logic (time mapping, segments, holds) can be unit-tested quickly and in isolation.

## Data model

A project is a `.openpin` package (a folder Finder shows as one file):

```
Onboarding.openpin/
├─ project.json        the document (below)
├─ sources/            copied recordings, or bookmarks.json pointing at the originals
├─ audio/              recorded/imported narration, generated TTS (regenerable)
├─ assets/             logo etc.
└─ cache/              frame index, filmstrip thumbnails (regenerable, excluded from Versions)
```

`project.json` (abridged):

```json
{
  "schema": "openpin.project/1",
  "sources": [{ "id": "src1", "file": "sources/recording.mov", "duration": 94.2, "size": [2880, 1800] }],
  "timeline": [
    { "id": "c1", "source": "src1", "in": 0.0,  "out": 31.5, "speed": 1.0 },
    { "id": "c2", "source": "src1", "in": 38.2, "out": 94.2, "speed": 1.5 }
  ],
  "steps": [
    {
      "id": "s_open-settings",
      "anchor": { "source": "src1", "time": 12.48 },
      "title": "Open Settings",
      "body": "The gear icon sits in the top-right corner.",
      "narration": { "mode": "tts", "voice": "com.apple.voice.premium.en-US.Zoe" },
      "minHold": 2.5,
      "zoom": { "rect": [0.55, 0.05, 0.40, 0.30] },
      "annotations": [
        { "id": "a1", "type": "spotlight", "shape": "roundedRect", "rect": [0.62, 0.08, 0.18, 0.07], "reveal": 0 },
        { "id": "a2", "type": "callout", "anchor": [0.71, 0.15], "text": "Click the gear", "placement": "auto", "reveal": 1 },
        { "id": "a3", "type": "arrow", "from": [0.45, 0.40], "to": [0.66, 0.13], "curve": 0.2, "reveal": 1 }
      ]
    }
  ],
  "blurs": [
    { "id": "b1", "style": "gaussian", "strength": 24,
      "keyframes": [ { "source": "src1", "time": 5.0, "rect": [0.1, 0.2, 0.3, 0.05] },
                     { "source": "src1", "time": 9.0, "rect": [0.1, 0.1, 0.3, 0.05] } ] }
  ],
  "audio": { "keepOriginal": true, "duckUnderNarration": true },
  "guide": {
    "playback": { "mode": "guided", "controls": ["prev", "next", "counter", "progress", "fullscreen"] },
    "branding": { "logo": "assets/logo.svg", "accent": "#FF5A4E", "chrome": "auto" },
    "cta": { "label": "Start free trial", "url": "https://example.com/signup", "showAt": "end" },
    "analytics": { "endpoint": null }
  }
}
```

Rules:
- **Geometry is normalized** (0–1 of the source frame), so it scales to any output size.
- **Time anchors are source time**, never timeline time (see F2 in [01-feature-analysis.md](01-feature-analysis.md#f2--trim-split-and-speed-with-frame-level-control)).
- **IDs are stable strings.** Published file names use step IDs, so links survive reordering.
- `schema` is versioned; a migration function per version lives in `OpenPinCore`.

### State, commands and undo

The open document holds an `@Observable` `ProjectModel`. Every edit is a small command (`PinStep`, `MoveAnnotation`, `SplitClip`…) that applies itself and registers its inverse with the window's `UndoManager`. That gives reliable undo/redo, named menu items ("Undo Move Arrow"), and a seam for tests.

## Rendering pipeline

```
          source .mov
               │  AVURLAsset
               ▼
   ┌───────────────────────┐   timeline clips (speed via scaleTimeRange)
   │ AVMutableComposition  │ + empty ranges inserted for step holds
   └───────────┬───────────┘
               │ per output frame
               ▼
   ┌────────────────────────────────────────────────────────────┐
   │ OpenPinCompositor (AVVideoCompositing)                     │
   │  1. frame = source frame, or cached step frame during hold │
   │  2. blur regions at source time   (CIGaussianBlur/Pixellate)│
   │  3. zoom transform                (eased affine)           │
   │  4. annotations at reveal progress (AnnotationRenderer, CG)│
   │  5. title caption                 (only in MP4 export)     │
   └───────┬───────────────────┬───────────────────┬────────────┘
           ▼                   ▼                   ▼
   Editor preview        MP4 export          Guide publish
   (AVPlayer +           (AVAssetWriter,     (per step: segment MP4 with
    videoComposition)     H.264/HEVC ≤4K)     steps 1–2 only + still WebP;
                                              player draws 3–4 itself)

   Stills for PNG / WebP / PDF: AVAssetImageGenerator (zero tolerance)
   → blur (CI) → AnnotationRenderer → ImageIO / libwebp / CGPDFContext
```

The same compositor powers the editor preview and the exports, so the editor never shows something the exports won't match. `AnnotationRenderer` is the one Core Graphics drawing routine; the SwiftUI canvas calls it through `Canvas`'s `withCGContext`.

The editor canvas is an `AVPlayerLayer` inside an `NSViewRepresentable`, with a SwiftUI overlay on top for selection handles and drag gestures. SwiftUI's own `VideoPlayer` is too limited for frame-accurate editing.

## The published guide bundle

```
<guide-slug>/
├─ index.html            standalone page (also the iframe target)
├─ player.js             web player (same build the app previews with)
├─ guide.json            schema "openpin.guide/1": steps, annotations, branding, cta, analytics
├─ guide.pdf             compressed PDF copy
├─ steps/<step-id>.webp  exact pinned frame, blur baked in, no annotations
├─ seg/<step-id>.mp4     motion leading into the step (H.264, blur baked in), ≤1920 px wide by default
└─ audio/<step-id>.m4a   optional narration
```

Embed:

```html
<div data-openpin="https://you.github.io/guides/onboarding/guide.json"></div>
<script src="https://you.github.io/guides/onboarding/player.js" async></script>
```

### Player internals (`player/`)

- TypeScript compiled with a Vite library build into one ES2020 file. No framework and no runtime dependencies. Budget: **< 40 KB gzipped**.
- Mounts into a **Shadow DOM** root; CSS custom properties come from `design/tokens.json` plus the guide's accent color.
- State machine: `idle → playingSegment(n) → atStep(n, revealGroup) → … → end`.
- Frame accuracy: at a segment's `ended` event, swap to the still image (no seek drift). `requestVideoFrameCallback`, where available, hides the video/still swap seam.
- Preloads the next segment and still while the viewer is on the current step.
- Annotations are SVG (arrows, spotlight mask) plus HTML (callout text), positioned in normalized coordinates over the stage.
- Icons: **Lucide** (ISC license). SF Symbols may only be used inside apps on Apple platforms, so they can't ship in a web player.

## Permissions and sandbox

| Capability | Entitlement / permission | When it's needed |
|---|---|---|
| Open/save user files | `com.apple.security.files.user-selected.read-write` + security-scoped bookmarks | Always |
| Publish / analytics | `com.apple.security.network.client` | Only when publishing or reading stats |
| Record narration | `com.apple.security.device.audio-input` + microphone prompt | Recording your voice |
| Personal Voice | `AVSpeechSynthesizer.requestPersonalVoiceAuthorization` | Only if chosen |
| Built-in recorder (later) | Screen Recording permission (TCC) | Phase 6 |
| Click capture (later) | None for mouse clicks via `NSEvent` global monitor | Phase 6 |
| Credentials | Keychain (Security framework) | GitHub/S3 tokens |

## Third-party dependencies

Kept deliberately small:

| Package | License | Purpose |
|---|---|---|
| libwebp (SwiftPM wrapper) | BSD-3 | WebP encoding (ImageIO only decodes WebP) |
| Sparkle | MIT | Auto-updates for builds distributed outside the App Store |
| Lucide icons (player only) | ISC | Player UI icons |
| Vite, TypeScript, Vitest, Playwright (dev only) | MIT / Apache-2.0 | Player build and tests |

Optional later: an LGPL ffmpeg build to remux MKV/WebM. It needs dynamic linking and a license notice, so it stays out of the MVP.

## Testing

- **`OpenPinCore` unit tests:** time mapping, segment/hold calculation, schema migrations, commands with undo round-trips. Fast, no media.
- **`OpenPinMedia` tests:** small fixture recordings (a few seconds, checked in with Git LFS). Check frame-index correctness on a VFR file, zero-tolerance still extraction, and the duration of the exported MP4.
- **Golden-image tests:** render each annotation type with `AnnotationRenderer` → PNG and compare against checked-in references with a small per-pixel tolerance.
- **Parity tests:** Playwright renders the same `guide.json` in the web player and screenshots it. Compare against the native golden images with a perceptual diff threshold, so the two renderers can't drift apart.
- **Player unit tests:** Vitest for the state machine and keyboard navigation.

### CI (GitHub Actions)

- `macos` runner: `xcodebuild test` for all packages and the app (deployment target 14.0, so CI also proves nothing newer leaked in without `#available`).
- `ubuntu` runner: player lint, typecheck, unit tests, size budget check, Playwright.
- Release workflow (later): archive, sign with Developer ID, notarize, staple, build a DMG, publish a GitHub Release and a Sparkle appcast.

## Distribution

- **Personal use:** build and run from Xcode with a free Apple ID. No paid account needed.
- **Sharing builds with others:** an Apple Developer Program membership ($99/year) for Developer ID signing and notarization. Without it, Gatekeeper blocks the app on other people's Macs unless they override it manually.
- **Later:** a Homebrew cask pointing at GitHub Releases.
- **License:** the user's call. MIT is the simplest choice for maximum reuse and is compatible with every dependency above.

## Development environment note

The app has to be built and run on a Mac with Xcode. The Linux cloud container these docs were written in can build and test the TypeScript player, but not the Swift app (AVFoundation, SwiftUI and Vision don't exist on Linux). Swift work should be verified locally or on the macOS CI runner.
