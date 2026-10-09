# 03 — Design system: PinKit

OpenPin should feel familiar to anyone who has used a video or guide editor (a three-pane layout with a timeline), but look clearly like its own product. This doc defines the visual identity and the **PinKit** component library: a Swift package for the Mac app plus matching CSS variables for the web player.

> **Check before locking this in:** FramePin's site couldn't be loaded while writing this, so its palette wasn't compared. Open framepin.com and look at its accent color. If it's a coral or red-orange, shift our accent hue (the Lagoon teal below works as a primary too).

## Identity: "Coral & Graphite"

- **Graphite neutrals** with a slight blue tint. Calm, technical, and the recording stays the star.
- **Coral** accent, the color of a map pin. Used for pins, the primary action and default annotations.
- **Lagoon** teal as the secondary: playhead, selection and focus rings. It separates "where I am" (teal) from "what I pinned" (coral). Each has a darker shade for light mode (see contrast note below).
- Shape language: generous corner radii, pin-shaped step markers on the timeline, step cards with a number badge.

## Color tokens

All values live in `design/tokens.json` and are generated into a Swift asset catalog / `Color` extensions and CSS custom properties, so the app and player can't drift apart.

### Neutrals (Graphite)

| Token | Hex | Typical use |
|---|---|---|
| `ink-950` | `#0E1116` | Dark-mode window background |
| `ink-900` | `#161A21` | Dark-mode panels |
| `ink-800` | `#1F242D` | Dark-mode raised surfaces, timeline track |
| `ink-700` | `#2B313C` | Dark-mode borders |
| `ink-600` | `#3B4250` | Disabled text (dark) |
| `ink-500` | `#5A6372` | Secondary text (light) |
| `ink-400` | `#8A93A3` | Secondary text (dark), placeholder |
| `ink-300` | `#B7BEC9` | Light-mode borders |
| `ink-200` | `#D9DDE4` | Light-mode dividers |
| `ink-100` | `#ECEFF3` | Light-mode panels |
| `ink-50`  | `#F6F7F9` | Light-mode window background |

### Accent and secondary

| Token | Hex | Use |
|---|---|---|
| `coral-400` | `#FF7B71` | Accent text/links in dark mode (6.9:1 on `ink-900`) |
| `coral-500` | `#FF5A4E` | Pins, default annotation color, large accents |
| `coral-600` | `#D13A30` | Filled primary buttons with white text (4.8:1, passes WCAG AA) |
| `coral-100` | `#FFE3E0` | Selected step card tint (light) |
| `lagoon-500` | `#13B8A6` | Playhead, focus ring, selection outline (dark mode) |
| `lagoon-600` | `#0E8F81` | Same roles in light mode; pressed/active secondary |

Light mode uses the `-600` shades for pins, the playhead and focus rings. The `-500` shades fall under the 3:1 non-text contrast minimum against the light `ink-50` background (coral-500 ≈ 2.9:1, lagoon-500 ≈ 2.3:1), while `coral-600` (≈ 4.5:1) and `lagoon-600` (≈ 3.7:1) pass.

### Semantic

| Token | Hex |
|---|---|
| `success` | `#2BB673` |
| `warning` | `#FFB020` |
| `danger` | `#F0443A` |
| `info` | `#3B82F6` |

### Annotation palette

Annotations sit on top of arbitrary screenshots, which are usually white web UIs, so they have their own high-visibility set. Every stroke gets a 2 px halo in the opposite tone so it reads on both light and dark recordings.

| Swatch | Hex | Default for |
|---|---|---|
| Coral | `#FF5A4E` | Arrows, boxes, click ripples |
| Marigold | `#FFB020` | Highlights |
| Lagoon | `#13B8A6` | Alternative arrows/boxes |
| Iris | `#6E6BFF` | Alternative |
| Snow | `#FFFFFF` | Strokes on dark recordings |
| Ink | `#0E1116` | Callout bubble background (white text) |

Spotlight dim: black at 55% with a 12 px feather. The guide's `accent` (branding) replaces Coral as the default annotation color in published guides.

## Typography

- **App:** the system font (SF Pro) through SwiftUI text styles, so Dynamic Type and accessibility settings just work. Timecodes use `.monospacedDigit()` so numbers don't jitter while playing.
- **Player:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Apple's SF fonts can't be bundled on the web. An optional Inter (OFL) build for a consistent cross-platform look can come later.
- **Callout text:** semibold, 15 pt at 1080p output, scaled with the output size.

## Spacing, radius, elevation

- Spacing scale (4 pt base): `2, 4, 8, 12, 16, 24, 32, 48`.
- Radii: `sm 6` (inputs, chips), `md 10` (buttons, step cards), `lg 14` (panels, sheets, callout bubbles), `pill 999` (badges, pins).
- Elevation: three levels. On macOS 14–15 use materials (`.regularMaterial`, `.thickMaterial`). On macOS 26+ the floating toolbars use Liquid Glass (`.glassEffect`), behind `#available`.
- Motion: 160 ms ease-out for UI; 450 ms ease-in-out for zoom. Respect Reduce Motion (cross-fade instead of scale/zoom).

## Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ Toolbar: project name · Undo/Redo · Pin (P) · Tools · Preview · Export │
├──────────────┬────────────────────────────────────────┬───────────────┤
│ Step list    │                                        │ Inspector     │
│ (sidebar)    │           Canvas (video frame +        │ (context:     │
│ ① Open…      │           annotation overlay)          │  step /       │
│ ② Click…     │                                        │  annotation / │
│ ③ Choose…    │   ◀◀  ◀  ▶  ▶  ▶▶   00:12.48 / 01:34   │  blur / guide)│
├──────────────┴────────────────────────────────────────┴───────────────┤
│ Timeline: filmstrip · clips (split/trim/speed) · ◆ step pins · blur   │
│ bars · narration waveform · teal playhead                             │
└───────────────────────────────────────────────────────────────────────┘
```

`NavigationSplitView` handles the sidebar, `.inspector` the right pane (macOS 14+), and the timeline is a custom view in a resizable bottom split.

## PinKit components

Each component documents its states (default, hover, pressed, focused, disabled, selected) and has a SwiftUI preview in light and dark mode.

### Foundations
- `PKTokens`: generated colors, spacing, radii and motion constants.
- `PKSurface`: background/material/glass wrapper that picks Liquid Glass on 26+, material otherwise.
- `PKIcon`: SF Symbols with consistent sizing and weight.

### Controls
- `PKButton` (`.primary` coral, `.secondary`, `.ghost`, `.destructive`; sizes S/M/L; optional shortcut hint).
- `PKIconButton`, `PKToolbarGroup` (grouped tool buttons with a shared background).
- `PKSegmented` (e.g. playback mode: Guided / Auto / Video).
- `PKSlider` with value label, `PKStepper`.
- `PKTextField`, `PKTextArea` (step title and body), `PKTimecodeField` (mm:ss.ff with frame stepping on ↑/↓).
- `PKColorSwatchPicker` (annotation palette plus custom).
- `PKToggleRow`, `PKMenuButton`.
- `PKKeyCap` (renders ⌘ P style shortcut hints).

### Content
- `PKStepCard`: number badge, thumbnail, title, warning badge for orphaned steps; drag to reorder; selected state uses the coral tint.
- `PKInspectorSection`: collapsible titled group with consistent label/control alignment.
- `PKEmptyState`: icon, headline, body, action (e.g. "Drop a screen recording here").
- `PKBadge` / `PKChip`.
- `PKToast`: transient confirmations ("Exported 12 screenshots").
- `PKProgressSheet`: export/publish progress with cancel.

### Editor-specific
- `PKTimeline`: container with zoomable time ruler.
  - `PKFilmstripTrack`, `PKClipView` (trim handles, speed label), `PKStepPin` (coral pin marker, draggable), `PKBlurBar`, `PKWaveformTrack`, `PKPlayhead` (teal).
- `PKCanvasOverlay`: selection, resize/rotate handles, snapping guides, drawn above the video.
- `PKAnnotationToolPalette`: callout, arrow, spotlight, box, click ripple, zoom, blur.
- `PKRevealOrderList`: reorderable reveal groups for the selected step.

### Player (web) counterparts
The player has its own small CSS component set with the same tokens: `op-stage`, `op-controls`, `op-progress` (with step pins), `op-counter`, `op-callout`, `op-cta`, `op-start-overlay`. The guide's accent overrides `--op-accent`.

## Accessibility checklist

- Text contrast at least 4.5:1 (AA); UI component contrast at least 3:1.
- Every toolbar and timeline action reachable by keyboard; visible teal focus ring (`lagoon-600` in light mode, `lagoon-500` in dark).
- VoiceOver labels on all icon buttons and timeline items ("Step 3, Choose a plan, at 0:42").
- Player: `aria-live` step titles, real-text callouts, keyboard navigation, Reduce Motion support.

## Keyboard shortcuts (initial set)

| Action | Shortcut |
|---|---|
| Play/pause | Space |
| Previous/next frame | ← / → |
| Jump 1 s | ⇧← / ⇧→ |
| Previous/next step | ⌥← / ⌥→ |
| Pin current frame as step | P |
| Split clip at playhead | ⌘B |
| Delete selection | ⌫ |
| Tools: select, callout, arrow, spotlight, box, blur, zoom | V, C, A, S, R, B, Z |
| Preview guide | ⌘↩ |
| Export | ⌘E |
