import {
  apply,
  canDeleteClip,
  canPinAt,
  canRedo,
  canSplit,
  canUndo,
  clipCommands,
  commands,
  newId,
  redo as redoHistory,
  spotAt,
  srcToTl,
  stepAtTime,
  timelineDuration,
  trimLimits,
  undo as undoHistory,
  zoomBox,
  type Annotation,
  type Blur,
  type ClipEdge,
  type Command,
  type Frame,
  type History,
  type Logo,
  type Point,
  type Project,
  type Rect,
  type Step,
} from '@waypost/core';
import type { MediaHandle } from '@waypost/media';
import { create } from 'zustand';
import { currentPlayback } from '../engine/session';
import type { PlaybackState } from '../engine/playback';
import type { ToolId } from '../editor/tools';

export type Selection =
  | { kind: 'step'; stepId: string }
  | { kind: 'annotation'; stepId: string; id: string }
  | { kind: 'zoom'; stepId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'gap'; clipId: string }
  | { kind: 'blur'; blurId: string }
  | null;

export interface Message {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

/** An annotation being dragged: drawn from here until the pointer is released, then committed as one undo step. */
export interface Draft {
  stepId: string;
  annotation: Annotation;
}

/** A blur or zoom box being drawn or dragged on the frame. A blur draft with id 'new' is one being drawn. */
export type ShapeDraft = { kind: 'blur'; blurId: string; rect: Rect } | { kind: 'zoom'; stepId: string; rect: Rect };

/** A long export in progress: what it says, how far along (0 to 1), and how to stop it. */
export interface ExportProgress {
  label: string;
  progress: number;
  detail: string;
  cancel: () => void;
}

export interface EditorState {
  phase: 'empty' | 'loading' | 'ready';
  /** shown over the stage while something slow runs ("Importing…") */
  busy: string | null;
  exporting: ExportProgress | null;
  history: History<Project> | null;
  media: MediaHandle | null;
  videoUrl: string | null;
  /** decoded logo and background images, by asset id */
  assetImages: ReadonlyMap<string, ImageBitmap>;
  /** timeline seconds */
  playhead: number;
  playback: PlaybackState;
  selection: Selection;
  draft: Draft | null;
  shapeDraft: ShapeDraft | null;
  tool: ToolId;
  /** Edit shows every annotation with handles; Viewer shows a step as the guide will (zoom eased in, groups revealed in order) */
  view: 'edit' | 'viewer';
  snap: boolean;
  ripple: boolean;
  /** timeline zoom, 1 (fit) to 8 */
  zoom: number;
  muted: boolean;
  message: Message | null;
  save: 'idle' | 'saving' | 'saved' | 'error';
  projectsOpen: boolean;
  exportOpen: boolean;
}

const INITIAL: EditorState = {
  phase: 'empty',
  busy: null,
  exporting: null,
  history: null,
  media: null,
  videoUrl: null,
  assetImages: new Map(),
  playhead: 0,
  playback: { rate: 0, stoppedAt: null },
  selection: null,
  draft: null,
  shapeDraft: null,
  tool: 'select',
  view: 'edit',
  snap: true,
  ripple: true,
  zoom: 1,
  muted: false,
  message: null,
  save: 'idle',
  projectsOpen: false,
  exportOpen: false,
};

export const useEditor = create<EditorState>(() => INITIAL);
export const getEditor = useEditor.getState;
const set = useEditor.setState;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_FACTOR = 1.5;
/** A new zoom box covers half the frame (2×). */
const DEFAULT_ZOOM_SIZE = 0.5;

// ----- selectors ------------------------------------------------------------------------------------------------------

export const selectProject = (s: EditorState): Project | null => s.history?.present ?? null;

export function totalDuration(project: Project): number {
  return timelineDuration(project.timeline);
}

/** The recording time under the playhead, or null in a gap. */
export function sourceAt(project: Project, playhead: number): { source: string; time: number } | null {
  const spot = spotAt(project.timeline, playhead);
  if (!spot || spot.kind === 'gap') return null;
  return { source: project.timeline[spot.index]!.source, time: spot.time };
}

/** The recording time under the playhead; in a gap, the frame held there. */
export function sourceTimeAt(project: Project, playhead: number): number {
  const spot = spotAt(project.timeline, playhead);
  if (!spot) return 0;
  if (spot.kind === 'clip') return spot.time;
  const before = project.timeline[spot.index - 1];
  return before ? before.out : project.timeline[spot.index]!.in;
}

/** The step pinned on the frame showing now, if any. */
export function stepAtPlayhead(project: Project, playhead: number): Step | undefined {
  const pos = sourceAt(project, playhead);
  return pos ? stepAtTime(project, pos.source, pos.time) : undefined;
}

export function timelineTimeOf(project: Project, step: Step): number {
  return srcToTl(project.timeline, step.anchor.source, step.anchor.time);
}

/** The step a selection belongs to, if any. */
export function selectionStepId(selection: Selection): string | undefined {
  return selection && 'stepId' in selection ? selection.stepId : undefined;
}

export function selectedStep(project: Project | null, selection: Selection): Step | undefined {
  const id = selectionStepId(selection);
  return id ? project?.steps.find(s => s.id === id) : undefined;
}

export function selectedAnnotation(project: Project | null, selection: Selection): Annotation | undefined {
  if (selection?.kind !== 'annotation') return undefined;
  return selectedStep(project, selection)?.annotations.find(a => a.id === selection.id);
}

export function selectedBlur(project: Project | null, selection: Selection): Blur | undefined {
  return selection?.kind === 'blur' ? project?.blurs.find(b => b.id === selection.blurId) : undefined;
}

/** Half a frame of the recording: how close two times must be to count as the same frame. */
export function halfFrame(): number {
  return 0.5 / (getEditor().media?.info.fps ?? 30);
}

// ----- messages -------------------------------------------------------------------------------------------------------

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

/** A short status under the canvas. Announced to screen readers. */
export function notify(text: string, tone: Message['tone'] = 'info'): void {
  const id = ++messageId;
  set({ message: { id, text, tone } });
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    if (getEditor().message?.id === id) set({ message: null });
  }, tone === 'error' ? 8000 : 4500);
}

// ----- editing --------------------------------------------------------------------------------------------------------

/** Applies a command to the open project. */
export function run(command: Command<Project>): void {
  set(s => (s.history ? { history: apply(s.history, command) } : s));
}

/** Drops a selection that points at something an undo, redo or delete removed. */
function validSelection(project: Project | null, selection: Selection): Selection {
  if (!project || !selection) return null;
  switch (selection.kind) {
    case 'clip':
      return project.timeline.some(c => c.id === selection.clipId) ? selection : null;
    case 'gap':
      return project.timeline.some(c => c.id === selection.clipId && c.gap > 0) ? selection : null;
    case 'blur':
      return project.blurs.some(b => b.id === selection.blurId) ? selection : null;
    default: {
      const step = project.steps.find(s => s.id === selection.stepId);
      if (!step) return null;
      if (selection.kind === 'annotation' && !step.annotations.some(a => a.id === selection.id)) return { kind: 'step', stepId: step.id };
      if (selection.kind === 'zoom' && !step.zoom) return { kind: 'step', stepId: step.id };
      return selection;
    }
  }
}

/** Re-checks the selection after an edit that may have removed what it points at. */
function revalidate(): void {
  set(s => ({ selection: validSelection(selectProject(s), s.selection) }));
}

/** After the clips change, the playhead keeps its timeline time and the frame there is drawn again. */
function refreshPlayhead(): void {
  const playback = currentPlayback();
  if (playback && playback.state.rate === 0) playback.seek(Math.min(getEditor().playhead, totalDuration(selectProject(getEditor())!)));
}

export function undo(): void {
  set(s => {
    if (!s.history || !canUndo(s.history)) return s;
    const history = undoHistory(s.history);
    return { history, selection: validSelection(history.present, s.selection) };
  });
  refreshPlayhead();
}

export function redo(): void {
  set(s => {
    if (!s.history || !canRedo(s.history)) return s;
    const history = redoHistory(s.history);
    return { history, selection: validSelection(history.present, s.selection) };
  });
  refreshPlayhead();
}

export function setTool(tool: ToolId): void {
  set({ tool });
}

export function toggleSnap(): void {
  set(s => ({ snap: !s.snap }));
}
export function toggleRipple(): void {
  set(s => ({ ripple: !s.ripple }));
  notify(getEditor().ripple ? 'Ripple trim on: trims close up the space.' : 'Ripple trim off: trims leave a gap.');
}
export function toggleMuted(): void {
  set(s => ({ muted: !s.muted }));
}
export function setView(view: EditorState['view']): void {
  set({ view });
}
export function setProjectsOpen(open: boolean): void {
  set({ projectsOpen: open });
}
export function setExportOpen(open: boolean): void {
  set({ exportOpen: open });
}

export function setZoom(zoom: number): void {
  set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) });
}
export function zoomBy(factor: number): void {
  setZoom(getEditor().zoom * factor);
}

export function setDraft(draft: Draft | null): void {
  set({ draft });
}
export function setShapeDraft(shapeDraft: ShapeDraft | null): void {
  set({ shapeDraft });
}

export function renameProject(name: string, coalesceKey?: string): void {
  run(commands.renameProject(name, Date.now(), coalesceKey));
}

// ----- selection ------------------------------------------------------------------------------------------------------

/** Selects a step and, by default, moves the playhead to its frame. */
export function selectStep(stepId: string, options: { seek?: boolean } = {}): void {
  const project = selectProject(getEditor());
  const step = project?.steps.find(s => s.id === stepId);
  if (!project || !step) return;
  set({ selection: { kind: 'step', stepId } });
  if (options.seek ?? true) seekSource(step.anchor.time);
}

export function selectAnnotation(stepId: string, id: string): void {
  set({ selection: { kind: 'annotation', stepId, id } });
}

export function selectZoom(stepId: string): void {
  set({ selection: { kind: 'zoom', stepId } });
}

export function selectClip(clipId: string): void {
  set({ selection: { kind: 'clip', clipId } });
}

export function selectGap(clipId: string): void {
  set({ selection: { kind: 'gap', clipId } });
}

/** Selects a blur; from the timeline it also moves the playhead into the blur if it was outside it. */
export function selectBlur(blurId: string, options: { seek?: boolean } = {}): void {
  const project = selectProject(getEditor());
  const blur = project?.blurs.find(b => b.id === blurId);
  if (!project || !blur) return;
  set({ selection: { kind: 'blur', blurId } });
  if (options.seek) {
    const now = sourceTimeAt(project, getEditor().playhead);
    if (now < blur.start - 1e-6 || now > blur.end + 1e-6) seekSource(blur.start);
  }
}

export function clearSelection(): void {
  set({ selection: null });
}

/** Esc steps an annotation or zoom selection back up to its step, then clears it. */
export function escapeSelection(): void {
  const { selection } = getEditor();
  if (selection?.kind === 'annotation' || selection?.kind === 'zoom') set({ selection: { kind: 'step', stepId: selection.stepId } });
  else set({ selection: null });
}

// ----- the playhead ---------------------------------------------------------------------------------------------------

/** Moves to the frame showing at a recording time. */
export function seekSource(time: number): void {
  const project = selectProject(getEditor());
  const source = project?.sources[0];
  if (project && source) seekTimeline(srcToTl(project.timeline, source.id, time));
}

/** Moves to a timeline time (scrubbing the ruler). */
export function seekTimeline(time: number): void {
  const project = selectProject(getEditor());
  if (!project) return;
  const t = Math.min(Math.max(0, time), totalDuration(project));
  const playback = currentPlayback();
  if (playback) playback.seek(t);
  else set({ playhead: t });
}

export function stepFrames(count: number): void {
  currentPlayback()?.stepFrames(count);
}

export function jumpSeconds(seconds: number): void {
  const project = selectProject(getEditor());
  if (project) seekTimeline(getEditor().playhead + seconds);
}

/** Previous or next pinned step. */
export function jumpStep(direction: 1 | -1): void {
  const state = getEditor();
  const project = selectProject(state);
  if (!project) return;
  const times = project.steps.map(s => ({ id: s.id, tl: timelineTimeOf(project, s) }));
  const frame = halfFrame();
  const target = direction > 0 ? times.find(t => t.tl > state.playhead + frame) : [...times].reverse().find(t => t.tl < state.playhead - frame);
  if (!target) {
    notify(direction > 0 ? 'No more steps ahead.' : 'No steps before this.');
    return;
  }
  set({ selection: { kind: 'step', stepId: target.id } });
  seekTimeline(target.tl);
}

export function jumpToStart(play = false): void {
  seekTimeline(0);
  if (play) void currentPlayback()?.play(1);
}
export function jumpToEnd(): void {
  const project = selectProject(getEditor());
  if (project) seekTimeline(totalDuration(project));
}

// ----- steps ----------------------------------------------------------------------------------------------------------

/**
 * Pins the frame at the playhead. With `at` (the Pin tool's click) the step gets a click marker there; the "+ Pin step" button
 * and ⇧P pin without one. Returns the step's id.
 */
export function pinAtPlayhead(at?: Point): string | null {
  const playback = currentPlayback();
  const state = getEditor();
  const project = selectProject(state);
  if (!project || !playback) return null;
  playback.pause();
  const pos = sourceAt(project, playback.time);
  if (!pos || !canPinAt(project, pos.source, pos.time)) {
    notify("There's no frame of the recording here (it's a gap), so it can't be pinned.", 'error');
    return null;
  }
  const existing = stepAtTime(project, pos.source, pos.time);
  const stepId = existing?.id ?? newId('s');
  run(commands.pinStep({ stepId, annotationId: newId('a'), source: pos.source, time: pos.time, at, now: Date.now() }));
  set({ selection: { kind: 'step', stepId } });
  if (!existing) notify(`Pinned step at ${formatSeconds(playback.time)}.`);
  return stepId;
}

function formatSeconds(t: number): string {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}

export function moveStep(stepId: string, sourceTime: number): void {
  run(commands.moveStep(stepId, sourceTime, Date.now()));
}

export function setStepText(stepId: string, text: { title?: string; body?: string }, coalesceKey?: string): void {
  run(commands.setStepText(stepId, text, Date.now(), coalesceKey));
}

export function removeStep(stepId: string): void {
  run(commands.removeStep(stepId, Date.now()));
  revalidate();
}

export function setStepHold(stepId: string, seconds: number, coalesceKey?: string): void {
  run(commands.setStepHold(stepId, seconds, Date.now(), coalesceKey));
}

// ----- zoom (F5) ------------------------------------------------------------------------------------------------------

/** Sets the step's zoom box; a new one is centred on the step's click marker if it has one. */
export function setStepZoom(stepId: string, rect: Rect | null, label?: string, coalesceKey?: string): void {
  run(commands.setStepZoom(stepId, rect, Date.now(), label, coalesceKey));
  if (rect) set({ selection: { kind: 'zoom', stepId } });
  else revalidate();
}

export function addZoom(stepId: string): void {
  const step = selectProject(getEditor())?.steps.find(s => s.id === stepId);
  if (!step) return;
  const click = step.annotations.find(a => a.type === 'click');
  setStepZoom(stepId, zoomBox(click?.type === 'click' ? click.at : [0.5, 0.5], DEFAULT_ZOOM_SIZE), 'Add zoom');
}

// ----- annotations ----------------------------------------------------------------------------------------------------

/** Adds an annotation to the step on the current frame. Returns false (with a message) if the frame isn't pinned. */
export function addAnnotationAtPlayhead(annotation: Annotation): boolean {
  const state = getEditor();
  const project = selectProject(state);
  const step = project && stepAtPlayhead(project, state.playhead);
  if (!step) {
    notify('Pin this frame first (P), then add annotations to it.', 'error');
    return false;
  }
  run(commands.addAnnotation(step.id, annotation, Date.now()));
  set({ selection: { kind: 'annotation', stepId: step.id, id: annotation.id }, tool: 'select' });
  return true;
}

export function updateAnnotation(stepId: string, id: string, patch: Partial<Annotation>, label?: string, coalesceKey?: string): void {
  run(commands.updateAnnotation(stepId, id, patch, Date.now(), label, coalesceKey));
}

export function removeAnnotation(stepId: string, id: string): void {
  run(commands.removeAnnotation(stepId, id, Date.now()));
  revalidate();
}

// ----- clips (F2) -----------------------------------------------------------------------------------------------------

/** R: splits the clip under the playhead at the frame showing. */
export function splitAtPlayhead(): void {
  const state = getEditor();
  const project = selectProject(state);
  if (!project) return;
  currentPlayback()?.pause();
  const spot = spotAt(project.timeline, getEditor().playhead);
  if (!spot || spot.kind === 'gap') {
    notify('Move the playhead onto a clip to split it.', 'error');
    return;
  }
  const clip = project.timeline[spot.index]!;
  const ok = canSplit(project, clip.id, spot.time);
  if (ok !== true) {
    notify(ok, 'error');
    return;
  }
  const id = newId('c');
  run(clipCommands.splitClip(clip.id, spot.time, id, Date.now()));
  set({ selection: { kind: 'clip', clipId: id } });
  notify('Split the clip. Drag an edge to trim, or set its speed in the Inspector.');
}

/**
 * Moves a clip edge (source seconds). Returns a message when a pinned step stopped it, so the timeline can say why. A drag passes
 * one coalesce key, so the whole drag is one undo step.
 */
export function trimClip(clipId: string, edge: ClipEdge, value: number, coalesceKey?: string): string | null {
  const state = getEditor();
  const project = selectProject(state);
  if (!project) return null;
  const limits = trimLimits(project, clipId, edge, state.ripple);
  if (!limits) return null;
  run(clipCommands.trimClip(clipId, edge, value, state.ripple, Date.now(), coalesceKey));
  if ((limits.pinAtMax && value > limits.max + 1e-6) || (limits.pinAtMin && value < limits.min - 1e-6)) return 'A pinned step is in the way. Move or delete the step to trim past it.';
  return null;
}

export function setClipSpeed(clipId: string, speed: number, coalesceKey?: string): void {
  run(clipCommands.setClipSpeed(clipId, speed, Date.now(), coalesceKey));
  refreshPlayhead();
}

export function setClipAudio(clipId: string, audio: { volume?: number; muted?: boolean }, coalesceKey?: string): void {
  run(clipCommands.setClipAudio(clipId, audio, Date.now(), coalesceKey));
}

export function setGap(clipId: string, seconds: number, coalesceKey?: string): void {
  run(clipCommands.setGap(clipId, seconds, Date.now(), coalesceKey));
  revalidate();
  refreshPlayhead();
}

export function deleteClip(clipId: string): void {
  const project = selectProject(getEditor());
  if (!project) return;
  const ok = canDeleteClip(project, clipId);
  if (ok !== true) {
    notify(ok, 'error');
    return;
  }
  run(clipCommands.deleteClip(clipId, getEditor().ripple, Date.now()));
  revalidate();
  refreshPlayhead();
}

// ----- blur (F7) ------------------------------------------------------------------------------------------------------

const BLUR_MIN_LENGTH = 0.1;

/** The Blur tool: a new region drawn at the playhead, lasting to the end of the recording. */
export function addBlurAtPlayhead(rect: Rect): void {
  const state = getEditor();
  const project = selectProject(state);
  const source = project?.sources[0];
  if (!project || !source) return;
  const start = Math.min(sourceTimeAt(project, state.playhead), source.duration - BLUR_MIN_LENGTH);
  const blur: Blur = {
    id: newId('b'),
    name: `Blur ${project.blurs.length + 1}`,
    source: source.id,
    start,
    end: source.duration,
    style: 'pixelate',
    amount: 45,
    radius: 4,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    fill: 'ink',
    keyframes: [{ time: start, rect }],
  };
  run(commands.addBlur(blur, Date.now()));
  set({ selection: { kind: 'blur', blurId: blur.id }, tool: 'select' });
  notify('Blurred. Scrub to where it moves and drag it there: it follows with a keyframe.');
}

export function updateBlur(blurId: string, patch: Parameters<typeof commands.updateBlur>[1], label?: string, coalesceKey?: string): void {
  run(commands.updateBlur(blurId, patch, Date.now(), label, coalesceKey));
}

export function setBlurTiming(blurId: string, start: number, end: number, shift: boolean, coalesceKey?: string): void {
  run(commands.setBlurTiming(blurId, start, end, shift, Date.now(), coalesceKey));
}

/** Places the blur at the frame showing, adding a keyframe if there isn't one on this frame. */
export function setBlurRectHere(blurId: string, rect: Rect, label?: string, coalesceKey?: string): void {
  const state = getEditor();
  const project = selectProject(state);
  const blur = project?.blurs.find(b => b.id === blurId);
  if (!project || !blur) return;
  const time = Math.min(blur.end, Math.max(blur.start, sourceTimeAt(project, state.playhead)));
  const before = blur.keyframes.length;
  run(commands.setBlurRect(blurId, time, rect, halfFrame(), Date.now(), label, coalesceKey));
  const after = selectProject(getEditor())?.blurs.find(b => b.id === blurId)?.keyframes.length ?? before;
  if (after > before) notify(`Added a keyframe at ${formatSeconds(time)}. The blur now moves between its keyframes.`);
}

export function removeBlur(blurId: string): void {
  run(commands.removeBlur(blurId, Date.now()));
  revalidate();
}

// ----- framing and logo (F18, F19) ------------------------------------------------------------------------------------

export function setFrame(patch: Partial<Frame>, label?: string, coalesceKey?: string): void {
  run(commands.setFrame(patch, Date.now(), label, coalesceKey));
}

export function setLogo(logo: Logo | null, label?: string, coalesceKey?: string): void {
  run(commands.setLogo(logo, Date.now(), label, coalesceKey));
}

export function setAssetImage(id: string, image: ImageBitmap): void {
  set(s => ({ assetImages: new Map(s.assetImages).set(id, image) }));
}

// ----- delete ---------------------------------------------------------------------------------------------------------

/** Delete: removes whatever is selected. A gap is closed; a zoom is removed from its step. */
export function deleteSelection(): void {
  const { selection } = getEditor();
  if (!selection) return;
  switch (selection.kind) {
    case 'annotation':
      return removeAnnotation(selection.stepId, selection.id);
    case 'zoom':
      return setStepZoom(selection.stepId, null);
    case 'step':
      return removeStep(selection.stepId);
    case 'clip':
      return deleteClip(selection.clipId);
    case 'gap':
      return setGap(selection.clipId, 0);
    case 'blur':
      return removeBlur(selection.blurId);
  }
}

// ----- playback callbacks ---------------------------------------------------------------------------------------------

export function setPlaybackState(playback: PlaybackState): void {
  set({ playback });
}

/** The playback moved, in timeline seconds. */
export function setPlayhead(time: number): void {
  set({ playhead: time });
}

export function resetEditor(): void {
  const s = getEditor();
  for (const image of s.assetImages.values()) image.close();
  set({ ...INITIAL, assetImages: new Map(), tool: s.tool, snap: s.snap, ripple: s.ripple, muted: s.muted, view: s.view, zoom: 1 });
}

export { INITIAL as INITIAL_EDITOR_STATE };
export const patchEditor = set;
