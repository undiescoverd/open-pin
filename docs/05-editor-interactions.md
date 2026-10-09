# 05 — Editor interactions

The exact behaviour of the editor's timeline, canvas, Inspector and keyboard, as proven in the clickable mockup ([`design/mockup/editor.html`](../design/mockup/editor.html), landed in #1). The real editor (`apps/editor`, `packages/core`) should reproduce it. [03 — Design system](03-design-system.md) says what the editor looks like; this doc says how it behaves.

"Must" marks behaviour the mockup was tested against. Numbers (8 px, 0.2 s, 4×) are the tested values, not arbitrary: change them on purpose, not by accident. The mockup simplifies a few things; those are listed under [Gaps](#gaps-the-mockup-does-not-cover).

## 1. Time model

Everything else depends on this.

- **Source time** is a position in the original recording, in seconds (the sample is 18.2 s). **Timeline time** is a position in the edited result.
- **Frame rate:** the mockup uses 30 fps. A pin's source time is always rounded to a whole frame.
- **Clips** play in order. Each has `in` and `out` (source seconds), `speed` and an optional `gap`: empty timeline seconds *before* the clip.
  - Timeline length = the sum of `gap + (out - in) / speed` over all clips.
  - `srcToTl` adds each clip's `gap` as it walks the list. A source time that falls between clips maps to the start of the next clip.
  - `tlToSrc` inside a gap returns the previous clip's `out` (the last frame holds); a leading gap returns the first clip's `in`.
- **What is anchored where**

  | Item | Anchored in | Why |
  |---|---|---|
  | Step (pin) and everything attached to it (annotations, zoom) | source time | A step must stay on its exact frame when clips are trimmed, split or sped up |
  | Blur region (`from`, `to`) | source time | It must keep covering the same pixels of the recording |
  | Voice (narration) | timeline time, as an `offset` from its pin | It follows the pin |
  | Music | timeline time (`start`, `end`; `end: null` means "to the end of the guide") | It belongs to the final edit |

- A step must never be orphaned: no edit may cut away the frame a step is pinned to (see [clip trimming](#43-clip-trimming)).

## 2. Items and their properties

Defaults and ranges are the tested ones. Units: s = seconds, % = percent, px = pixels of the 1280×800 recording.

| Item | Property | Default | Range |
|---|---|---|---|
| **Clip** | speed | 1× | 0.25–8× (presets ⅓, ½, 1, 2, 5) |
| | volume / mute | 100% / off | 0–150% |
| | gap | 0 s | ≥ 0 |
| **Step** | pause ("hold") | 2.5 s | 1–8 s |
| | zoom | none | square box, 25–80% of the frame (4× down to 1.25×) |
| **Blur** | style | pixelate | pixelate, blur (gaussian), solid |
| | amount | 45 | 0–100 (block size for pixelate) |
| | corner radius | 4 px | 0–40 |
| | opacity | 100% | 10–100 |
| | fade in / out | 0 s | 0–3 s (source seconds) |
| | solid fill | ink | ink, gray, white |
| | rectangle | drawn | X, Y, width, height in px; at least 8 px each |
| **Voice** | offset from pin | 0 s | −10 to +10 s, and never starts before 0:00 |
| | speaking speed | 1× | 0.5–2× |
| | volume / mute | 100% / off | 0–150% |
| | fade in / out | 0 s | 0–3 s |
| **Music** | start / end | 0 / end of guide | at least 0.5 s long |
| | volume / mute | 25% / off | 0–100% |
| | fade in / out | 0 s | 0–10 s |
| | lower under narration | on, to 35% | 0–100% |

Narration length in the mockup is an estimate (TTS: 0.6 s + 0.38 s per word of the title; recorded: 2.4 s), divided by speaking speed. The real app uses the real audio length. A step's effective pause is `max(hold, voice offset (if > 0) + voice length + 0.4 s)`.

## 3. Selection

- **Kinds:** step, annotation, zoom box, clip, gap, blur, voice, music. One thing is selected at a time. The Inspector always shows the selection.
- **Selecting from the timeline** also moves the playhead where that makes the selection visible: a pin moves it to the pin; a blur moves it into the blur if it was outside.
- **Clicking empty space in a timeline lane** selects the step at the playhead (or nothing). It never moves the playhead.
- **Esc**, in order: leave a drawing tool, then clear the "stopped at a step" state, then leave the Viewer view, then step an annotation or zoom selection back up to its step.
- **Delete** removes the selection: a zoom (removes the zoom), an annotation, a step, a blur, narration (sets it to none), music, or a gap (closes it).
- **Select the layer below / above (`⇧K` / `⇧I`):** the lanes are Video, Steps, Blur, Voice, Music. Take the middle of the selected item in time; in the next lane that has items, pick the item that covers that time, or the nearest one. Empty lanes are skipped. With nothing selected, `⇧K` picks the top lane and `⇧I` the bottom. Pauses playback. Stops at the ends.

## 4. Timeline

### 4.1 Lanes and the playhead

- Lanes, top to bottom: ruler, Video, Steps, Blur, Voice, Music. Blur and Voice stack into extra rows when items overlap in time.
- **Only the ruler moves the playhead.** Click or drag on the ruler to scrub. Clicking or dragging anywhere in a lane must not.
- Scrubbing snaps (see [snapping](#44-snapping)).

### 4.2 Moving and trimming items

| Item | Drag the body | Drag an edge |
|---|---|---|
| Pin | Moves the step in time. The playhead follows it. It can't land on another pin's frame (it stays at the last free position). | none |
| Blur bar | Moves it, keeping its length. | Trims start or end. Minimum 0.1 s. |
| Voice bar | Changes the offset from the pin. | **Retimes the speech**: the other edge stays fixed and the speaking speed becomes `natural length ÷ new length`, clamped to 0.5–2×. |
| Music bar | Moves it. | Trims start or end. Minimum 0.5 s. An end within 0.02 s of the end of the guide becomes "to the end". |
| Clip | not draggable | Trims (see 4.3). |

- Items stay inside 0 to the end of the guide.
- A drag must produce exactly **one** undo step, created when the pointer is released and only if it moved at least 3 px.
- A bar that is muted draws dimmed. Fades draw as a diagonal shading at the bar's ends.

### 4.3 Clip trimming

Drag the left or right edge of a clip. **Ripple trim** is a toggle (`⇧R`), on by default.

- **Always:**
  - The edge can't cross its neighbour's footage and can't leave less than 0.2 s of source in the clip.
  - It can't pass a **pinned step**: the trim stops at that step's frame and a message says "move or delete the step to trim past it".
  - Trimmed footage is kept: dragging the edge back out recovers it, up to the neighbour's footage or the end of the recording.
  - The timeline scale is **frozen while dragging** so the edge stays under the pointer, then refits on release.
- **Ripple on:** everything after the edge moves to close the gap, and the timeline gets shorter or longer. Dragging a left edge leaves that edge where it is and shrinks the clip from the right.
- **Ripple off:** nothing else moves.
  - Trimming a right edge adds the removed time to the **next** clip's `gap`. Trimming the last clip just shortens the guide.
  - Trimming a left edge adds the removed time to **that clip's own** `gap` (a leading gap, if it is the first clip). The edge follows the pointer.
  - An edge can only grow back into room that is already free: the neighbouring gap, not a neighbour's footage.
- **Gaps** show hatched on the Video lane and are selectable. The Inspector sets a gap's length or **Close gap** (Delete does the same, rippling later items up). A gap holds the previous clip's last frame on screen.
- **Typed In, Out and "Plays for"** in the Inspector obey the same limits and the same ripple setting, and are refused with a message when they don't fit.

### 4.4 Snapping

A toggle (`N`, on by default). Holding **Alt** flips it for the drag in progress.

- **Threshold:** 8 screen pixels, so it feels the same at every zoom level.
- **Targets:** the start and end of the guide, the playhead (not when scrubbing it), clip boundaries and gap edges, pin times, voice start and end, blur start and end, music start and end.
- **Never snaps to itself:** the dragged item's own edges are excluded. Dragging a pin also excludes its own voice; trimming a clip excludes that clip.
- **Feedback:** a vertical amber line at the snapped position while the drag is in progress.
- Applies to: scrubbing the playhead, moving or trimming blur, voice and music bars, moving pins, and trimming clips.
- **Clip trims** are snapped in *source* time when ripple is on (pins, blur edges, other clips' edges, the ends of the recording, the playhead's frame), because the timeline shifts under the pointer as you trim. With ripple off nothing shifts, so they snap in *timeline* time and can also hit voice and music edges.

### 4.5 Zoom

`=` or `+` zooms in and `-` zooms out, by a factor of 1.5 per press, from 1× (fit to width) to 8×, with a slider for the same range. Zooming keeps the playhead at the same place on screen (centred if it was off screen). While zoomed in, **the timeline follows the playhead**: if the playhead leaves the visible area (playing, jumping, stepping) the view scrolls to centre it, except while the user is scrubbing or dragging.

## 5. Canvas

### 5.1 Tools

Select (`V`), Pin (`P`), Callout (`C`), Arrow (`A`), Spotlight (`S`), Box (`B`), Zoom (`Z`), Blur (`X`). `Esc` returns to Select.

- **Pin:** click the frame. Creates a step at the playhead frame (or moves that step's click marker if one is already there) and gives it a click marker.
- **Callout, Arrow, Spotlight, Box, Zoom:** need a step at the playhead; otherwise a message says to pin the frame first. A drag of at least 1.5% of the frame draws the shape; a plain click makes a default-size one. A zoom box is always the frame's shape.
- **Blur:** doesn't need a step. It starts at the playhead and lasts to the end of the guide.
- After drawing, the tool returns to Select with the new item selected.

### 5.2 Select tool: who gets the drag

Decided in this order:

1. A **handle** of the selected object (resize or move a point). Handles are kept fully inside the frame so an object flush with the edge can still be grabbed.
2. Anywhere **inside the selected object** (zoom box, a Box or Spotlight, a visible blur): the drag moves *that* object, even if another annotation is drawn on top of it or underneath. This is deliberate: the selected object owns its area. To pick something underneath, deselect first (click outside, or `Esc`).
3. Otherwise the thing under the pointer: a zoom box outline, an annotation, a blur, and finally empty space, which selects the step.

Handles by type:

| Object | Handles |
|---|---|
| Zoom box | 4 corners and 4 edges. The box always keeps the frame's shape: dragging an edge resizes the whole box, keeping the opposite edge fixed and staying centred on the other axis. Size is limited to 25–80% of the frame. |
| Box, Spotlight | 8 handles (corners and edges), minimum 8 px. |
| Arrow | Two draggable points: start and tip. |
| Blur | 8 handles, minimum 8 px. |
| Click marker, callout | Move only (no handles). |

An unselected zoom box is selected by its dashed outline only, so it never blocks the annotations inside it.

### 5.3 Other canvas rules

- Dragging on the canvas, the timeline or the step rail must never select text. The Inspector's fields stay selectable.
- **Edit** view shows every annotation with handles; **Viewer** view shows the step as the published guide would (zoom eased in, annotations revealing in group order). Timeline editing works in both. Playing always uses viewer rendering.

## 6. Playback and transport

- **Space or `K`:** play from the playhead, or pause. Uses the "Preview" speed menu (½×, 1×, 2×).
- **`L` plays forward, `J` plays backward.** First press: 1×. Each further press in the same direction: 2×, then 4× (stays at 4×). The other direction restarts at 1×. These ignore the Preview menu. Holding a key must not ramp the speed (auto-repeat is ignored).
- **Everything stops at every pinned step**, at any speed and in either direction. It then waits ("Stopped at step N"). Pressing the same direction key carries on at the **remembered speed** and the other direction starts at 1×. The Continue button, or clicking the frame, resumes the way you were going ("Keep rewinding" after a backward stop); Space and `K` continue forward. Any explicit pause or scrub resets the speed to 1×.
- **Ends:** forward at the end restarts from 0:00; backward at 0:00 does nothing; reaching either end pauses.
- **Jumps:** `⌥←` / `⌥→` previous / next **step**. `⇧J` / `⇧L` previous / next **edit**: the nearest of every snap target listed in 4.4 (pins, cuts, gap edges, voice, blur and music starts and ends, the ends). `⌘,` plays from the very start; `⌘.` pauses at the very end. `←` / `→` step one frame; `⇧←` / `⇧→` jump one second.
- The status chip reads "Playing 2×" or "Rewinding 4×" while shuttling.

## 7. Inspector

Two tabs: **Inspector** (the selection) and **Guide** (project-wide settings). The Inspector is a stack of collapsible groups; whether a group is collapsed is remembered while you work. Selecting something new scrolls the panel to the top.

### 7.1 Parameter rows

Every numeric value is one row: **label, reset button, slider, number box with its unit**.

- Slider and number box stay in sync. Typing clamps to the range (the box is only tidied when you leave it, so you can type freely).
- **Reset** returns to the default; **double-clicking the label** does the same. A row with no default has no reset.
- **One undo step per editing session** on a field: the first change after it gains focus.
- **Time fields** show `m:ss.ff` and accept `3`, `3.5`, `0:03`, `0:03.50`, with an optional trailing `s`. Enter commits and leaves the field (so ⌘Z then undoes the edit). A value that is invalid or doesn't fit (before the start, past the end, into a neighbour, past a pin) is refused with a message and the field reverts.
- **The panel must never rebuild under the pointer.** A field's `change` fires on the mousedown of whatever you click next; rebuilding then would swallow that click. So while a pointer is down, a rebuild waits until it is released.

### 7.2 Panels

| Selection | Groups |
|---|---|
| Step | Title, note, **position** (typed timeline time), pause, zoom on/off and amount, annotation list with reveal order, narration |
| Annotation | Text or curve, colour, **position and size** in px, reveal group |
| Zoom | Amount, centre on the click, preview zoomed, remove |
| Clip | **Trim** (In, Out, Plays for), **Speed** (presets and a number), **Audio** (volume, mute), split at playhead |
| Gap | Length, close gap |
| Blur | Name, **Timing** (start, end, length, start/end at playhead, fades), **Position and size**, **Effect** (style, amount, fill, opacity) |
| Narration | Voice, **Timing** (start, offset, speaking speed, fades), **Audio** (volume, mute) |
| Music | **Timing** (start, end, length, start/end at playhead, play to the end, fades), **Audio** (volume, mute, lower under narration and by how much) |

## 8. Undo and redo

The whole project is snapshotted before each change; 80 steps deep; a new edit clears redo. One step per: committed Inspector action (button, switch, selection of an option), field editing session, canvas drag, timeline drag, typed time. Undo and redo are `⌘Z` / `⇧⌘Z` and the top-bar buttons, and are ignored while typing in a text field (the browser's own text undo applies there).

## 9. Keyboard

No shortcut fires while a dialog is open. Typing in a text, number or text-area field, or a `select` having focus, blocks all of them. While any other form control has focus (a slider, a checkbox), only the transport keys (`J` `K` `L`, `⇧J` `⇧L`, `=` `+` `-`) still work, so they keep working after you drag an Inspector slider; the rest wait until focus moves. `⌘` means Ctrl on Windows and Linux.

| Keys | Action |
|---|---|
| `Space`, `K` | Play or pause |
| `L`, `J` | Play forward, play backward (repeat for 2×, 4×) |
| `←` `→`, `⇧←` `⇧→` | Frame back or forward; one second back or forward |
| `⌥←` `⌥→` | Previous or next step |
| `⇧J` `⇧L` | Previous or next edit |
| `⌘,` `⌘.` | Play from the very start; jump to the very end |
| `=` `+` `-` | Zoom the timeline in, in, out |
| `⇧K` `⇧I` | Select the layer below, above |
| `V` `P` `C` `A` `S` `B` `Z` `X` | Tools |
| `⇧P` | Pin a step at the playhead |
| `R` | Split the clip at the playhead |
| `N` | Snapping on or off (hold `Alt` to flip it for one drag) |
| `⇧R` | Ripple trim on or off |
| `Delete` | Delete the selection |
| `Esc` | See section 3 |
| `⌘Z` `⇧⌘Z` | Undo, redo |
| `⌘K` | Command palette (lists every action with its key) |
| `⌘↩` `⌘E` | Preview guide; export menu |

Keys are matched case-insensitively, so they also work with Caps Lock on. `⌘,` is Settings in Chrome and Safari; a page may not be able to claim it, which is why every shortcut is also in the command palette.

## 10. Acceptance checks

Written so each can become an automated test in the real editor. The sample project has four steps (timeline times 0:02.10, 0:05.80, 0:10.30, 0:13.90), two clips, two blur regions and narration on every step.

1. Clicking in the Video, Steps, Blur, Voice or Music lane leaves the playhead where it was; clicking the ruler moves it.
2. Dragging a blur bar's left edge changes only its start; dragging its body moves both edges.
3. With snapping on, dragging a bar's edge to within 8 px of a pin makes it equal that pin's time exactly and shows the amber line; with `Alt` held it does not snap.
4. Dragging a voice bar's right edge changes the speaking speed and keeps the start; the left edge keeps the end.
5. Trimming the end of the last clip stops at the last pinned step, with a message; dragging the edge back out restores the footage.
6. With ripple on, trimming the end of clip 1 makes the guide shorter and moves pins; with ripple off, the guide length and every pin stay the same and a gap appears.
7. With ripple off, an edge can't grow past the gap it opened; closing the gap shortens the guide.
8. Dragging inside a selected zoom box that has a click marker inside it moves the zoom box and does not move or select the marker.
9. Dragging the right edge of the zoom box shrinks it, keeps its left edge and its 16:10 shape, and updates the zoom amount.
10. Dragging on the frame or the timeline selects no text.
11. `L` then `L` then `L` advances about 4× faster than `L`; `J` from step 3 stops at step 2 and shows "Stopped at step 2"; pressing `J` again resumes at the same speed.
12. From 0:00, `⇧L` visits 1.30, 2.10, 2.25, 3.46, 5.80, 5.95, 7.54, 10.30, 12.80, 13.90, 15.64, 16.90 in order and then stays; `⇧J` retraces them.
13. `⌘.` lands on the end and stays paused; `⌘,` lands on 0:00 and plays.
14. `=` zooms in by 1.5, `-` out, never beyond 1× to 8×, and the playhead stays on screen.
15. Typing `jkl=-` into a text field changes only the field.
16. Typing 3 into a blur's Start field and pressing Enter sets 0:03.00; ⌘Z reverts it; typing a start after the end is refused and the field reverts.
17. Editing a number, then immediately clicking a segmented button, applies both.
18. `R` splits at the playhead; `⌘B` does nothing; `B` selects Box and `X` selects Blur.

## Gaps the mockup does not cover

- **No audio.** Volume, fades, mute and ducking are stored and shown but not played, and narration length is an estimate.
- **The preview player ignores gaps.** It steps between pinned steps rather than playing the timeline, so gaps and speed changes don't show there yet; exports must honour them.
- **Blur is approximated** with a CSS backdrop filter. It must be a true, irreversible redaction in the renderer and in every export, and blur regions should get keyframes (F7).
- **No clip reordering**, no ripple delete of a range, and no keyboard nudging of timeline items (the Inspector's typed fields are the keyboard route).
- **Orphaned steps are prevented**, not warned about: a trim stops at a pin. The roadmap's "orphaned-step warning" remains an option if freer trimming is wanted.
- **Timeline bars are pointer-first.** The Inspector fields give a keyboard route, but bars and handles still need proper roles, focus and screen-reader labels.
- **No automated tests are committed.** The checks in section 10 were run as throwaway scripts against the mockup.
