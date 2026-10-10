# 03 — Design system and editor UI

Waypost should be immediately familiar to anyone who has used a video or guide editor, but look like its own product and be much easier to use than FramePin's editor. This doc covers what's wrong with FramePin's UI, the redesigned editor layout, and **PinKit**, our React component library and design tokens.

**Clickable mockup:** [`design/mockup/editor.html`](../design/mockup/editor.html) puts this layout and these tokens into a working page: open it in Chrome. It has a sample project, all the tools, timeline editing, the guide preview, the Share dialog and the ⌘K command palette. Nothing is saved or exported; it's for judging the design before real code exists.

## Lessons from FramePin's editor

From the editor screenshot (described in [01-feature-analysis.md](01-feature-analysis.md#what-the-editor-screenshot-shows)):

| # | Problem | Effect | Waypost fix |
|---|---|---|---|
| 1 | **Three stacked navigation layers** in the left panel: header buttons (Export/Widget), a button group (Settings/Blur Info/Voice Over), then tabs (Frames/Background/Logo). | You can't tell which are modes, which are panels and what "Settings" means. | One **context inspector** on the right that shows the properties of whatever is selected. Project-wide options live in one "Guide" panel with clear sections. Blur and voice become tools and timeline lanes, not modes. |
| 2 | **The main action is hidden.** You create a step by "clicking on the screen", explained only in an empty state; the blue pin button has no label. | New users don't know how to start. | A labelled **Pin tool (P)** in the canvas toolbar and a **"+ Pin step"** button at the top of the step list, both with shortcut hints. |
| 3 | **Wasted space.** The left panel is almost empty; black gutters around the canvas; the clip fills half the timeline and the rest is dead space. | The video is smaller than it needs to be, and the timeline is hard to read. | The canvas fits the available space. The timeline **fits to width** by default with a zoom slider. The step list shows real content (thumbnails and titles). |
| 4 | **Low contrast.** Grey-on-near-black text, barely visible tracks, faint disabled buttons. | Hard to read, especially on a laptop in daylight. | Tokens checked against WCAG AA: 4.5:1 for text, 3:1 for UI shapes. |
| 5 | **Cryptic labels.** A clip labelled `0 [17.775]`; speed buttons `x5 x2 1 1/2 1/3` with no hint whether they change preview or clip speed; look-alike icon-only transport buttons. | Guesswork. | Readable clip labels ("Clip 1 · 0:00–0:09 · 1×"). Clip speed lives in the clip's inspector; preview speed is a separate, labelled dropdown. Every icon button has a tooltip with its shortcut. |
| 6 | **Two unrelated accents:** blue for buttons and tabs, orange for the playhead, with no meaning behind either. | Visual noise. | Colors have jobs: **coral = steps and the primary action**, **teal = "where you are"** (playhead, selection, focus). Nothing else is colored. |
| 7 | **Outputs in the wrong place.** Export and Widget sit in the left sidebar header. | The most important finishing actions are hard to find. | A top bar with **Preview**, **Export ▾** and a primary **Share** button on the right, where people expect them. |
| 8 | **Steps aren't visible as steps.** No list of pinned frames with titles, and no step markers on the timeline. | Hard to see the guide's structure. | A step rail with numbered cards, plus a dedicated **Steps** lane on the timeline with numbered markers. |
| 9 | **Shouty empty lane:** "ADD BACKGROUND AUDIO" in caps inside a big dashed box. | Draws attention away from the work. | A compact "+ Add music" button on a labelled Music lane. |
| 10 | **Unexplained checkerboard** around the recording. | Looks like a rendering glitch. | Framing is shown as the real background (gradient/color) once chosen, with a "Frame" section in the Guide panel. |
| 11 | **Undo without redo**, no visible shortcuts. | Mistakes are costly. | Undo/redo in the top bar, ⌘Z / ⇧⌘Z, and a ⌘K command palette that lists every action with its shortcut. |

## Editor layout

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Waypost  ‹ Projects   Onboarding flow ▾   ↶ ↷      Preview   Export ▾   [Share]  │
├──────────────┬──────────────────────────────────────────────────┬──────────────────┤
│ STEPS  + Pin │ [Select|Pin|Callout|Arrow|Spot|Box|Zoom|Blur]    │ INSPECTOR        │
│              │                                                  │ Step 2           │
│ ┌──────────┐ │     ┌────────────────────────────────────┐       │ Title            │
│ │1 [thumb] │ │     │                                    │       │ [Click the gear] │
│ │Open Sett…│ │     │  recording on its background,      │       │ Note             │
│ └──────────┘ │     │  with annotations                  │       │ [              ] │
│ ┌──────────┐ │     │                                    │       │ Hold    2.5 s    │
│ │2 [thumb] │ │     └────────────────────────────────────┘       │ Zoom    on       │
│ │Click gear│ │                                                  │ Annotations      │
│ └──────────┘ │                                                  │  1 Click marker  │
│              │                                                  │  2 Callout       │
│              │                                                  │ Narration  TTS   │
├──────────────┴──────────────────────────────────────────────────┴──────────────────┤
│ 0:04.98 / 0:17.78   ⇤ step  ◀ frame  ▶ Play  frame ▶  step ⇥ Preview 1× ▾ zoom ─○─ │
│ 0s       2        4        6        8        10       12       14       16         │
│ Video  [ Clip 1 · 0:00–0:09 · 1×            ][ Clip 2 · 0:09–0:17 · 2×       ]     │
│ Steps          ①                    ②                       ③                      │
│ Blur   ▬▬▬▬▬▬▬▬▬▬▬▬                                                                │
│ Voice          ▭▭▭▭                 ▭▭▭▭▭                   ▭▭▭                    │
│ Music  + Add music                                                                 │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** app mark, back to Projects, editable project name, undo/redo, then Preview, an Export menu (MP4, PDF, Screenshots, Guide folder) and the primary **Share** button (publishes the guide and copies the embed snippet).
- **Step rail (left):** numbered step cards with thumbnail and title; drag to reorder in time; selecting a card jumps the playhead there. A small warning badge marks orphaned steps.
- **Canvas (centre):** a floating tool palette on top, with an **Edit / Viewer** switch beside it. *Edit* shows every annotation at once with handles and the dashed zoom box. *Viewer* shows the step exactly as the published guide does: the zoom eases in and annotations appear in their reveal order. Playback always uses the viewer rendering and stops on every pin until you click Continue, press Space or click the frame. The Pin tool (P) pins the current frame and drops a click marker where you click.
- **Inspector (right):** context-driven, in the style of DaVinci Resolve's inspector. The first tab is **Inspector** and shows collapsible groups for whatever is selected: Step, Annotation, Effect region, Narration, Music or Clip. Every value is a slider with a number box and a reset button (double-click a name to reset it), and times are typed as timecodes. An effect region has an Effects stack (any number of effects, applied in order, each switchable and reorderable), a Layer group (forward, backward, front, back), Timing (start, end, length, fades) and Position and size in pixels; Narration and Music have Timing, fades, volume, mute and ducking. The second tab, **Guide**, holds the project-wide options: Frame (background, padding, corners, shadow, aspect), Logo, Player (mode, controls, accent, CTA), Audio (original, voice, music) and Analytics.
- **Timeline (bottom):** transport and timecode on one row; ruler; labelled lanes for Video, Steps, Effects, Voice and Music. Teal playhead, which only the **ruler** moves; clicking in a lane never scrubs. Pins, blur bars, voice bars and the music bar drag to move, and the edges of blur, voice and music bars drag to trim (stretching a voice bar changes its speaking speed). The edges of a clip on the Video lane drag to trim it: with **ripple trim** on (the default, ⇧R toggles it) the clips ripple and everything after moves up; with it off, the trim leaves a hatched **gap** and nothing else moves (select a gap to resize or close it, and the last frame of the previous clip holds through it). Trimmed footage can be dragged back out, and a trim stops at any pinned step. A **magnet** button (N) turns on snapping: edges snap to the nearest edge on any lane, the playhead and the ends of the guide (clip trims snap to a pin's frame, a blur edge, another clip's edge or the playhead), with an amber guide line; holding Alt flips it for one drag. Split at playhead with R. Transport keys follow DaVinci Resolve's J K L: **L** plays forward (press again for 2×, then 4×), **J** plays backward the same way, **K** plays or pauses (like Space), and all of them stop at every pinned step. **⇧L** / **⇧J** jump to the next / previous edit (any cut, pin, or start or end of a blur, voice or music bar), **⌘,** plays from the very start, **⌘.** jumps to the very end, and **=** / **-** zoom the timeline in and out (1× to 8×, following the playhead). The lanes are resizable, and the timeline fits to width until you zoom.
- **Empty project:** the canvas becomes a drop zone ("Drop a screen recording: MP4, MOV, WebM, MKV", Browse…, Record screen) with a three-step hint: *1. Pin the moments that matter (P) · 2. Point things out · 3. Share*.

## Identity: "Coral & Graphite"

- **Graphite neutrals** with a slight blue tint. Calm and technical, so the recording is the star.
- **Coral** accent, the color of a map pin: steps, pins and the primary action.
- **Lagoon** teal for "where you are": playhead, selection, focus rings.
- Both light and dark themes. The default follows the system; FramePin appears to be dark-only.
- Shape language: generous radii, numbered pin markers, step cards with number badges.
- Distinct from FramePin's editor, which uses a blue accent and an orange playhead on near-black.

## Color tokens

All values live in `design/tokens.json`. A small build script turns them into CSS custom properties (`--wp-*`), Tailwind's `@theme`, and the player's stylesheet, so the editor and player can't drift apart.

### Neutrals (Graphite)

| Token | Hex | Typical use |
|---|---|---|
| `ink-950` | `#0E1116` | Dark-theme app background |
| `ink-900` | `#161A21` | Dark-theme panels |
| `ink-800` | `#1F242D` | Dark-theme raised surfaces, timeline lanes |
| `ink-700` | `#2B313C` | Dark-theme borders |
| `ink-600` | `#3B4250` | Disabled text (dark) |
| `ink-500` | `#5A6372` | Secondary text (light; 5.7:1 on `ink-50`) |
| `ink-400` | `#8A93A3` | Secondary text (dark; 5.6:1 on `ink-900`) |
| `ink-300` | `#B7BEC9` | Light-theme borders |
| `ink-200` | `#D9DDE4` | Light-theme dividers |
| `ink-100` | `#ECEFF3` | Light-theme app background (behind the panels) |
| `ink-50`  | `#F6F7F9` | Light-theme inputs, timeline lanes, hover fills |
| `white`   | `#FFFFFF` | Light-theme panels |

### Accent and secondary

| Token | Hex | Use |
|---|---|---|
| `coral-400` | `#FF7B71` | Accent text/links in the dark theme (6.9:1 on `ink-900`) |
| `coral-500` | `#FF5A4E` | Pins and step markers (dark theme), default annotation color |
| `coral-600` | `#D13A30` | Filled primary buttons with white text (4.8:1); pins in the light theme |
| `coral-100` | `#FFE3E0` | Selected step card tint (light) |
| `lagoon-500` | `#13B8A6` | Playhead, focus ring, selection outline (dark theme) |
| `lagoon-600` | `#0E8F81` | Same roles in the light theme; pressed secondary |

The light theme uses the `-600` shades for pins, the playhead and focus rings. The `-500` shades fall under the 3:1 non-text contrast minimum against `ink-50` (coral-500 ≈ 2.9:1, lagoon-500 ≈ 2.3:1), while `coral-600` (≈ 4.5:1) and `lagoon-600` (≈ 3.7:1) pass.

### Semantic

| Token | Hex |
|---|---|
| `success` | `#2BB673` |
| `warning` | `#FFB020` |
| `danger` | `#F0443A` |
| `info` | `#3B82F6` |

### Annotation palette

Annotations sit on top of arbitrary recordings, which are usually white web UIs, so they get their own high-visibility set. Every stroke gets a 2 px halo in the opposite tone so it reads on light and dark recordings.

| Swatch | Hex | Default for |
|---|---|---|
| Coral | `#FF5A4E` | Arrows, boxes, click markers |
| Marigold | `#FFB020` | Highlights |
| Lagoon | `#13B8A6` | Alternative arrows/boxes |
| Iris | `#6E6BFF` | Alternative |
| Snow | `#FFFFFF` | Strokes on dark recordings |
| Ink | `#0E1116` | Callout bubble background (white text) |

Spotlight dim: black at 55% with a 12 px feather. In published guides, the guide's accent color replaces Coral as the default.

### Framing presets (F18)

Four gradient backgrounds built from the palette, plus solid colors and custom images:
- **Dusk:** ink-900 → iris
- **Reef:** lagoon-600 → ink-800
- **Ember:** coral-600 → marigold
- **Paper:** ink-50 → ink-200

## Typography

- **Editor UI:** `system-ui` (San Francisco on Mac). Timecodes use `font-variant-numeric: tabular-nums` so numbers don't jitter while playing.
- **Rendered output** (annotations, captions, PDF, player) and the wordmark: **Figtree** (SIL Open Font License), bundled as WOFF2 so exports look identical on every machine. It's friendlier than the UI text most recordings show, so callouts read as separate from the app being demonstrated.
- **Scale:** 11 / 12 / 13 (base) / 15 / 18 / 22 / 28 px. Callout text: 600 weight, 15 px at 1080p, scaled with the output size.

## Spacing, radius, elevation, motion

- **Spacing (4 px base):** `2, 4, 8, 12, 16, 24, 32, 48`.
- **Radii:** `sm 6` (inputs, chips), `md 10` (buttons, step cards), `lg 14` (panels, popovers, callout bubbles), `pill 999` (badges, pins).
- **Elevation:** three levels via layered shadows in the light theme and lighter surfaces plus a hairline border in the dark theme. The floating tool palette uses a translucent blurred surface (`backdrop-filter`).
- **Motion:** 160 ms ease-out for UI; 450 ms ease-in-out for zoom. `prefers-reduced-motion` swaps scale and zoom for fades.

## PinKit components (`packages/ui`)

React components built on Radix primitives (for keyboard, focus and screen-reader behavior), styled with Tailwind classes that only reference our tokens. Every component documents its states (default, hover, pressed, focus-visible, disabled, selected) and has a light/dark story in a component gallery page (`/kit`, not linked from the editor).

### Foundations
- `tokens.css`: generated custom properties, light and dark sets.
- `Surface`: panel, raised and floating (blurred) surfaces.
- `Icon`: Lucide icons at fixed sizes (14/16/20) and stroke width.
- `KeyCap`: renders shortcut hints like ⌘ B.

### Controls
- `Button`: variants `primary` (coral), `secondary`, `ghost`, `danger`; sizes S/M/L; optional icon and shortcut.
- `IconButton` (tooltip required), `ToolbarGroup`.
- `SegmentedControl` (e.g. playback mode: Guided / Auto / Video).
- `Slider` with value label; `NumberField` with units (s, ×, px).
- `TextField`, `TextArea`, `TimecodeField` (mm:ss.mmm; ↑/↓ step one frame).
- `ColorSwatchPicker` (annotation palette plus custom color).
- `Switch`, `Select`, `DropdownMenu`, `ContextMenu`, `Tooltip`, `Popover`, `Dialog`.
- `CommandPalette` (⌘K): fuzzy search over every action, with shortcuts shown.

### Content
- `StepCard`: number badge, thumbnail, title, orphaned-step badge; drag handle; coral tint when selected.
- `InspectorSection`: collapsible titled group with aligned label/control rows.
- `EmptyState`: icon, headline, body, actions.
- `Badge`, `Chip`, `Toast` ("Exported 12 screenshots"), `ProgressDialog` (export/publish progress with cancel).

### Editor-specific
- `Timeline`: ruler with zoom, lanes, snapping.
  - `ClipBlock` (trim handles, readable label, speed badge), `StepMarker` (numbered coral pin, draggable), `EffectBar` (one row per layer), `VoiceBlock`, `MusicLane`, `Playhead` (teal, with grip).
- `CanvasStage`: composited frame plus a selection overlay (resize/rotate handles, snapping guides, click-marker placement).
- `ToolPalette`: Select, Pin, Callout, Arrow, Spotlight, Box, Zoom, Blur.
- `RevealOrderList`: reorderable reveal groups for the selected step.

### Player counterparts
The player has its own tiny CSS (no React) using the same tokens: `wp-stage`, `wp-controls`, `wp-progress` (with step markers), `wp-counter`, `wp-cta`, `wp-start` (the "Start guide" overlay). The guide's accent overrides `--wp-accent`.

## Accessibility checklist

- Text contrast at least 4.5:1, UI shapes at least 3:1, in both themes.
- Every action reachable by keyboard; visible teal focus ring (`lagoon-600` light, `lagoon-500` dark).
- Screen-reader labels on all icon buttons and timeline items ("Step 3, Choose a plan, at 0:42").
- Player: `aria-live` step titles, readable callout text, keyboard navigation, reduced-motion support.

## Keyboard shortcuts

Chosen to avoid the browser shortcuts a web page can't override (⌘T, ⌘W, ⌘N, ⌘Q) and Chrome's dev-tools shortcuts. Single-letter shortcuts are ignored while typing in a text field.

| Action | Shortcut |
|---|---|
| Play/pause | Space or K |
| Play forward (press again for 2×, then 4×) | L |
| Play backward (press again for 2×, then 4×) | J |
| Previous/next frame | ← / → |
| Jump 1 s | ⇧← / ⇧→ |
| Previous/next step | ⌥← / ⌥→ |
| Previous/next edit (any cut, pin, or start or end of a blur, voice or music bar) | ⇧J / ⇧L |
| Play from the very start / jump to the very end | ⌘, / ⌘. |
| Zoom the timeline in / out | = / - |
| Select the layer below / above | ⇧K / ⇧I |
| Pin step at playhead | ⇧P |
| Tools: select, pin, callout, arrow, spotlight, box, zoom, blur | V, P, C, A, S, B, Z, X |
| Split clip at playhead | R |
| Snapping on/off (hold Alt to flip it for one drag) | N |
| Ripple trim on/off | ⇧R |
| Delete selection | ⌫ |
| Undo / redo | ⌘Z / ⇧⌘Z |
| Command palette | ⌘K |
| Preview guide | ⌘↩ |
| Export menu | ⌘E |

L, J and K follow DaVinci Resolve and, like Space, stop at every pinned step. On Windows and Linux use Ctrl in place of ⌘. Some browsers keep ⌘, for their own settings; if yours does, use the command palette's "Play from the very start".
