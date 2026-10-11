# 03 — Design system and editor UI

Waypost should be immediately familiar to anyone who has used a video or guide editor, but look like its own product and be much easier to use than FramePin's editor. This doc covers what's wrong with FramePin's UI, the redesigned editor layout, and **PinKit**, our React component library and design tokens.

**Design canvas:** "Waypost simple editor" on claude.ai (boards 1 to 5, light and dark, drawn at 1440×900) is the visual reference for the layout below: https://claude.ai/artifact/BUeKy3swhxrWXYrDdfaGgy (private to its owner). [06 — Simplify plan](06-simplify-plan.md) describes every screen in words.

**The clickable mockup** ([`design/mockup/editor.html`](../design/mockup/editor.html)) shows the layout from before Phase 4 (lanes always open, a tool palette under the frame, Share and an Export menu). It is retired as the layout reference. It stays in the repository only because it is still the working reference for narration and music, which aren't built yet ([05](05-editor-interactions.md), sections 2 and 6).

## Lessons from FramePin's editor

From the editor screenshot (described in [01-feature-analysis.md](01-feature-analysis.md#what-the-editor-screenshot-shows)):

| # | Problem | Effect | Waypost fix |
|---|---|---|---|
| 1 | **Three stacked navigation layers** in the left panel: header buttons (Export/Widget), a button group (Settings/Blur Info/Voice Over), then tabs (Frames/Background/Logo). | You can't tell which are modes, which are panels and what "Settings" means. | One **context inspector** on the right that shows the properties of whatever is selected. Project-wide options live in one "Guide" panel with clear sections. Blur and voice become tools and timeline lanes, not modes. |
| 2 | **The main action is hidden.** You create a step by "clicking on the screen", explained only in an empty state; the blue pin button has no label. | New users don't know how to start. | **+ Add step** (⇧P) at the top of the Steps list, a labelled **Click** button (P) among the Add buttons, and a quiet next-step hint under the frame that says what to do next. |
| 3 | **Wasted space.** The left panel is almost empty; black gutters around the canvas; the clip fills half the timeline and the rest is dead space. | The video is smaller than it needs to be, and the timeline is hard to read. | The canvas fits the available space. The timeline **fits to width** by default with a zoom slider. The step list shows real content (thumbnails and titles). |
| 4 | **Low contrast.** Grey-on-near-black text, barely visible tracks, faint disabled buttons. | Hard to read, especially on a laptop in daylight. | Tokens checked against WCAG AA: 4.5:1 for text, 3:1 for UI shapes. |
| 5 | **Cryptic labels.** A clip labelled `0 [17.775]`; speed buttons `x5 x2 1 1/2 1/3` with no hint whether they change preview or clip speed; look-alike icon-only transport buttons. | Guesswork. | Readable clip labels ("Clip 1 · 0:00–0:09 · 1×"). Clip speed lives in the clip's inspector; preview speed is a separate, labelled dropdown. Every icon button has a tooltip with its shortcut. |
| 6 | **Two unrelated accents:** blue for buttons and tabs, orange for the playhead, with no meaning behind either. | Visual noise. | Colors have jobs: **coral = steps and the primary action**, **teal = "where you are"** (playhead, selection, focus). Nothing else is colored. |
| 7 | **Outputs in the wrong place.** Export and Widget sit in the left sidebar header. | The most important finishing actions are hard to find. | A top bar with **Preview** and one primary **Export** button on the right, where people expect them. Export opens one dialog for the guide, the video, the PDF and the images. |
| 8 | **Steps aren't visible as steps.** No list of pinned frames with titles, and no step markers on the timeline. | Hard to see the guide's structure. | A Steps list with numbered rows that open into a step card, plus numbered pins above the filmstrip (and a dedicated **Steps** lane in the full timeline). |
| 9 | **Shouty empty lane:** "ADD BACKGROUND AUDIO" in caps inside a big dashed box. | Draws attention away from the work. | A compact "+ Add music" button on a labelled Music lane. |
| 10 | **Unexplained checkerboard** around the recording. | Looks like a rendering glitch. | A new project starts on a gradient, and the editor draws exactly what every export draws, so there is never a see-through checkerboard. The canvas controls are a bar above the frame and a Canvas tab. |
| 11 | **Undo without redo**, no visible shortcuts. | Mistakes are costly. | Undo/redo in the top bar, ⌘Z / ⇧⌘Z, and a ⌘K command palette that lists every action with its shortcut. |

## Editor layout

Phase 4 made the editor simple by default ([06 — Simplify plan](06-simplify-plan.md)): steps are the unit of work, adding is always in one place, and precise controls sit in a collapsed **Advanced** section at the end of each panel. Nothing was removed from the engine; the full timeline is one click away behind **Trim & edit video**.

### First run

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Waypost                                                              ‹ Projects  ◐   │
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│ ╎                                                                                    ╎ │
│ ╎                                       (film)                                       ╎ │
│ ╎                            Drop a screen recording here                            ╎ │
│ ╎      MP4, MOV, WebM or MKV, from QuickTime, Loom, OBS or any other recorder.       ╎ │
│ ╎                   [Choose a recording…]  [Open a project file…]                    ╎ │
│ ╎                                                                                    ╎ │
│ ╎                  ① Add steps     ② Explain each one     ③ Export                   ╎ │
│ ╎             Your recording stays in this browser. Nothing is uploaded.             ╎ │
│ ╎                                                                                    ╎ │
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Until there is a recording, the whole window is one drop zone (a file dropped anywhere opens too). Only the logo, **Projects** (projects saved in this browser) and the theme button sit above it. A recording the browser can't open says what to do ("Open it in QuickTime Player, choose File › Export As › 1080p…").

### Editing a step

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Waypost ‹Projects  Onboarding flow  Saved    ↶ ↷ ◐  [Preview] [Export]               │
├─────────────────┬───────────────────────────────────────────────┬──────────────────────┤
│ STEPS 3  [+Add] │ [Original|16:9|4:3|1:1|4:5]  [● Style]        │ Inspector │ Canvas   │
│ ┌─────────────┐ │ ┌───────────────────────────────────────────┐ │ ADD TO STEP 2        │
│ │1 [thumb]    │ │ │   recording on its background,            │ │ [Callout] [Arrow]    │
│ │Open the menu│ │ │   with annotations and handles            │ │ [Highlight][Zoom]    │
│ └─────────────┘ │ │                                           │ │ [Hide]    [Click]    │
│ ┌─────────────┐ │ │      ◎ ┌───────────────────────────────┐  │ │ ──────────────────── │
│ │2 [thumb]    │ │ │        │Add callout·Highlight·Zoom here│  │ │ Callout · Step 2     │
│ │Title  [____]│ │ │        └───────────────────────────────┘  │ │ Words  [_______]     │
│ │Note   [____]│ │ │                                           │ │ Colour ● ● ● ●       │
│ │On this step │ │ └───────────────────────────────────────────┘ │ › Advanced           │
│ │[Click][Call]│ │            Give step 3 a title                │ Remove callout       │
│ │Waits for a  │ │                                               │                      │
│ │click…  [Dup]│ │                                               │                      │
│ │› Advanced   │ │                                               │                      │
│ └─────────────┘ │                                               │                      │
├─────────────────┴───────────────────────────────────────────────┴──────────────────────┤
│ 0:04.98 / 0:17.78    ⇤ ◀ ▶ ▶ ⇥    Playback stops at every step [Trim & edit video]     │
│        ①              ②                   ③                                            │
│ ▕[ the whole recording as one strip    ▒▒ Hidden during step 2 ▒▒           ]▏         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** app mark, back to Projects, the editable project name and "Saved", then undo and redo, the theme, and **Preview** and **Export** (primary). That's all.
- **Steps (left):** **+ Add step** (⇧P) at the top, then one row per step (thumbnail, number, title, and a one-line summary such as "Click marker · Callout"). The selected step opens in place as the **step card**: **Title**; **Note** (optional, the body text of the PDF and the guide); **On this step**, chips for what's on it (Click marker, Callout, Zoom…) that select it on the frame; a footer saying how the step behaves in words ("Waits for a click, or 2.5 s in a video") with **Duplicate** (⌘D, which copies the step onto the frame at the playhead); and **Advanced**: exact time, pause and appearing order.
- **Canvas bar (above the frame):** directly above the frame, as wide as it, always in view: the shape as one-click buttons (**Original, 16:9, 4:3, 1:1, 4:5**) and a **Style** button, which shows the Canvas tab. See "The canvas" below.
- **Frame (centre):** the picture, under the canvas bar and taking the height that is left. Click a thing to select it and drag it to move it. Under the frame is one line, as wide as the frame and always the same height: what the canvas is waiting for or what just happened ("Stopped at step 2" with **Continue**), and otherwise the **next-step hint**, one quiet suggestion ("Press Add step where the viewer should click", "Give step 2 a title", "Preview it, then Export") that says nothing once the guide has been previewed or Export opened. While paused, the frame shows every annotation with handles and the dashed zoom box. Playback shows each step as the viewer sees it (the zoom eases in, annotations appear in their order) and stops at every step until Continue, Space or a click on the frame.
- **Quick actions:** right after a click marker drops (the Click button or the P tool), a small bar next to it offers **Add callout · Highlight · Zoom here**, each placed around the click. It goes away as soon as you do anything else.
- **Right panel: Add, then adjust.** It always starts with **Add to step N** (or *Add to a new step* on a frame without one): six large labelled buttons, **Callout, Arrow, Highlight, Zoom, Hide** and **Click**. One click puts the item on the frame, selected, around the step's click when there is one and otherwise in the middle. The keys (C, A, H, Z, X, P) pick the matching tool instead, to draw the item exactly where you click or drag, and show in each button's tooltip. Below the buttons the panel shows only the selected item's few simple controls, then its **Advanced**, then **Remove**:

  | Item | Simple controls | Under Advanced |
  |---|---|---|
  | Callout | The step's title and note, or your own words; colour | Side, exact position, when it appears |
  | Arrow | Colour | Exact ends, when it appears |
  | Highlight | Spotlight or outline | Exact box, when it appears |
  | Zoom | How close (1.25× to 4×) | Exact area, centre on the click |
  | Hide | Look (Cover, Pixelate or Blur; Cover by default), strength, how long (*This step only*, *From here to the end*, *The whole video*) | Name, the effect stack, opacity, layers, timing and fades, exact position and size, keyframes for following a moving thing |
  | Click | Nothing (drag it) | Position, colour, when it appears |
  | Clip, gap (full timeline only) | Trim (In, Out, Plays for), speed, volume and mute; a gap's length | — |

  The panel's second tab, **Canvas**, holds the look of the picture (see below), then the recording and where the project is saved. How the guide plays, the end button and the player's look are in Export.
- **Filmstrip (bottom):** the timecode, the transport and "Playback stops at every step" in one header row with **Trim & edit video** at the right; under it one strip of the whole recording with the numbered pins above it. Click a pin to go to its step and drag it to move it in time; click the strip to move the playhead; trim handles sit at both ends. Hidden areas show as tinted bars on the strip ("Hidden during step 2").
- **Trim & edit video** swaps the filmstrip for the full timeline, and **Done** comes back; the choice is remembered per project. The full timeline has the ruler and labelled lanes for Steps, Video, Effects, Voice and Music (Steps always on top, picture over sound, Music always last). Teal playhead, which only the **ruler** moves; clicking in a lane never scrubs. Pins and effect bars drag to move, and their edges drag to trim. The edges of a clip on the Video lane drag to trim it: with **ripple trim** on (the default, ⇧R toggles it) everything after moves up; with it off, the trim leaves a hatched **gap** (the last frame holds through it). A trim stops at any pinned step. A **magnet** button (N) turns on snapping to every edge, the playhead and the ends, with an amber guide line; holding Alt flips it for one drag. Split at the playhead with R. J K L shuttle as in DaVinci Resolve (and stop at every step), ⇧L / ⇧J jump between edits, and = / - zoom the timeline. These keys work in both views, but only the full timeline shows the controls they drive; [05](05-editor-interactions.md) has the exact behaviour.
- **Preview** (⌘↩) opens the guide in the real player **at the selected step** (on the start card when nothing is selected). Esc closes it and selects the step it was showing.
- **Export** opens one dialog: **What to export** (*Interactive guide*, *Video*, *PDF*, *Images*), then only what matters for it: how the guide plays (*Viewer clicks Next*, *Plays by itself*, *Plain video*) and its button at the end; the video's size, captions and sound (with a plain note about which parts are silent); the PDF's page size; the images' format. Its **Advanced**, for the interactive guide only, holds the end button's timing, the player's accent, colours and controls, and folder or zip with a PDF copy. A video, PDF or set of images has no Advanced. Nothing about the canvas is in Export: whatever the frame shows is what every export draws. After an interactive guide is saved, it shows the link and the embed code, with plain-words help for GitHub Pages, Netlify and Cloudflare Pages. "Publish online, coming later" sits at the bottom.

### The canvas

The canvas is the picture every step, the preview and every export is drawn on: the recording, framed on a background. It is chosen where it can be seen, never in Export.

- **A new project starts 16:9 on a gradient** (Dusk), with no padding, so a 16:9 recording fills the canvas and any other shape sits on the gradient with rounded corners and a shadow. Projects saved before this keep the frame they had.
- **The shape** is one click in the bar above the frame (Original keeps the recording's own shape). Picking one changes the frame at once and is one undo step.
- **The Canvas tab** (right panel, beside the frame so a change can be watched as it is made) holds, in order: **Background** (the four gradients, six colours or an image), **Frame** (padding 0 to 25%, corner radius, shadow), **Annotations** (the guide's annotation colour: new arrows, outlines and click markers take it, and changing it recolours those still in the old colour, in one undo step), **Logo** (corner, size, margin, opacity), then the **Recording** and **Saving** sections. A new project, and any project with no steps yet, opens on this tab so the look can be chosen first; selecting or adding something shows the Inspector, and **Style** (or the tab) brings the canvas back.
- **No see-through canvas.** Where there is no background (older projects), the editor draws the same dark the video and the guide use, so bars never show a checkerboard, and image exports are opaque too.

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
- **Elevation:** three levels via layered shadows in the light theme and lighter surfaces plus a hairline border in the dark theme. Floating surfaces (popovers, menus) use a translucent blurred surface (`backdrop-filter`).
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
- `Advanced`: collapsed disclosure at the end of a panel; closed it is one line saying what's inside ("Advanced · Exact position, size"), open it shows the precise controls. The house pattern for anything rarely needed (see 06-simplify-plan.md).
- `EmptyState`: icon, headline, body, actions.
- `Badge`, `Chip`, `Toast` ("Exported 12 screenshots"), `ProgressDialog` (export/publish progress with cancel).

### Editor-specific (in `apps/editor/src/editor`)
- `FirstRun`: the full-window drop zone before there is a recording.
- `StepRail`: the Steps list, with the selected step open as its step card.
- `CanvasView` and `AnnotationOverlay`: the composited frame plus the selection overlay (handles, drawing, click-marker placement); `QuickActions` is the bar after a pin; `Dock` is the line under the frame (status, or the next-step hint).
- `AddPanel` and `Inspector`: the Add buttons, then the selected item's simple controls, its Advanced and Remove.
- `Filmstrip`: the default view of time (pins, hidden-area bars, trim handles).
- `Timeline`: the full timeline behind Trim & edit video: ruler with zoom, lanes, snapping, clip blocks with trim handles and speed badges, numbered step markers, effect bars (one row per layer), the Voice and Music lanes, the teal playhead.
- `ExportDialog` and `PreviewDialog`.

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
| Add step at playhead | ⇧P |
| Duplicate the selected step onto the frame at the playhead | ⌘D |
| Tools: select, click (pin), callout, arrow, highlight, zoom, hide | V, P, C, A, H, Z, X (S and B pick the spotlight and outline highlights) |
| Split clip at playhead | R |
| Snapping on/off (hold Alt to flip it for one drag) | N |
| Ripple trim on/off | ⇧R |
| Delete selection | ⌫ |
| Undo / redo | ⌘Z / ⇧⌘Z |
| Command palette (not built yet; its top-bar button is disabled) | ⌘K |
| Preview guide, at the selected step | ⌘↩ |

L, J and K follow DaVinci Resolve and, like Space, stop at every pinned step. On Windows and Linux use Ctrl in place of ⌘. Some browsers keep ⌘, for their own settings. There is no Export shortcut: ⌘E was the old Export menu, and the Export button replaced it.
