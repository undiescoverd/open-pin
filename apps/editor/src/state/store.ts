import {
  apply,
  canPinAt,
  canRedo,
  canUndo,
  commands,
  newId,
  redo as redoHistory,
  srcToTl,
  stepAtTime,
  timelineDuration,
  tlToSrc,
  undo as undoHistory,
  type Annotation,
  type Command,
  type History,
  type Point,
  type Project,
  type Step,
} from '@waypost/core';
import type { MediaHandle } from '@waypost/media';
import { create } from 'zustand';
import { currentPlayback } from '../engine/session';
import type { PlaybackState } from '../engine/playback';
import type { ToolId } from '../editor/tools';

export type Selection = { kind: 'step'; stepId: string } | { kind: 'annotation'; stepId: string; id: string } | null;

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

export interface EditorState {
  phase: 'empty' | 'loading' | 'ready';
  /** shown over the stage while something slow runs ("Importing…") */
  busy: string | null;
  history: History<Project> | null;
  media: MediaHandle | null;
  videoUrl: string | null;
  /** timeline seconds */
  playhead: number;
  playback: PlaybackState;
  selection: Selection;
  draft: Draft | null;
  tool: ToolId;
  snap: boolean;
  ripple: boolean;
  /** timeline zoom, 1 (fit) to 8 */
  zoom: number;
  muted: boolean;
  message: Message | null;
  save: 'idle' | 'saving' | 'saved' | 'error';
  projectsOpen: boolean;
}

const INITIAL: EditorState = {
  phase: 'empty',
  busy: null,
  history: null,
  media: null,
  videoUrl: null,
  playhead: 0,
  playback: { rate: 0, stoppedAt: null },
  selection: null,
  draft: null,
  tool: 'select',
  snap: true,
  ripple: true,
  zoom: 1,
  muted: false,
  message: null,
  save: 'idle',
  projectsOpen: false,
};

export const useEditor = create<EditorState>(() => INITIAL);
export const getEditor = useEditor.getState;
const set = useEditor.setState;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_FACTOR = 1.5;

// ----- selectors ------------------------------------------------------------------------------------------------------

export const selectProject = (s: EditorState): Project | null => s.history?.present ?? null;

export function totalDuration(project: Project): number {
  return timelineDuration(project.timeline);
}

/** The recording time under the playhead. */
export function sourceTimeAt(project: Project, playhead: number): number {
  return tlToSrc(project.timeline, playhead)?.time ?? 0;
}

/** The step pinned on the frame showing now, if any. */
export function stepAtPlayhead(project: Project, playhead: number): Step | undefined {
  const pos = tlToSrc(project.timeline, playhead);
  return pos ? stepAtTime(project, pos.source, pos.time) : undefined;
}

export function timelineTimeOf(project: Project, step: Step): number {
  return srcToTl(project.timeline, step.anchor.source, step.anchor.time);
}

export function selectedStep(project: Project | null, selection: Selection): Step | undefined {
  return selection ? project?.steps.find(s => s.id === selection.stepId) : undefined;
}

export function selectedAnnotation(project: Project | null, selection: Selection): Annotation | undefined {
  if (selection?.kind !== 'annotation') return undefined;
  return selectedStep(project, selection)?.annotations.find(a => a.id === selection.id);
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
  const step = project.steps.find(s => s.id === selection.stepId);
  if (!step) return null;
  if (selection.kind === 'annotation' && !step.annotations.some(a => a.id === selection.id)) return { kind: 'step', stepId: step.id };
  return selection;
}

export function undo(): void {
  set(s => {
    if (!s.history || !canUndo(s.history)) return s;
    const history = undoHistory(s.history);
    return { history, selection: validSelection(history.present, s.selection) };
  });
}

export function redo(): void {
  set(s => {
    if (!s.history || !canRedo(s.history)) return s;
    const history = redoHistory(s.history);
    return { history, selection: validSelection(history.present, s.selection) };
  });
}

export function setTool(tool: ToolId): void {
  set({ tool });
}

export function toggleSnap(): void {
  set(s => ({ snap: !s.snap }));
}
export function toggleRipple(): void {
  set(s => ({ ripple: !s.ripple }));
}
export function toggleMuted(): void {
  set(s => ({ muted: !s.muted }));
}
export function setProjectsOpen(open: boolean): void {
  set({ projectsOpen: open });
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

export function clearSelection(): void {
  set({ selection: null });
}

/** Esc steps an annotation selection back up to its step, then clears it. */
export function escapeSelection(): void {
  const { selection } = getEditor();
  if (selection?.kind === 'annotation') set({ selection: { kind: 'step', stepId: selection.stepId } });
  else set({ selection: null });
}

// ----- the playhead ---------------------------------------------------------------------------------------------------

/** Moves to the frame showing at a recording time. */
export function seekSource(time: number): void {
  const playback = currentPlayback();
  if (playback) playback.seek(time);
  else {
    const project = selectProject(getEditor());
    const source = project?.sources[0];
    if (project && source) set({ playhead: srcToTl(project.timeline, source.id, time) });
  }
}

/** Moves to a timeline time (scrubbing the ruler). */
export function seekTimeline(time: number): void {
  const project = selectProject(getEditor());
  if (!project) return;
  const pos = tlToSrc(project.timeline, Math.min(Math.max(0, time), totalDuration(project)));
  if (pos) seekSource(pos.time);
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
  const times = project.steps.map(s => ({ id: s.id, tl: timelineTimeOf(project, s), src: s.anchor.time }));
  const frame = 0.5 / (state.media?.info.fps ?? 30);
  const target = direction > 0 ? times.find(t => t.tl > state.playhead + frame) : [...times].reverse().find(t => t.tl < state.playhead - frame);
  if (!target) {
    notify(direction > 0 ? 'No more steps ahead.' : 'No steps before this.');
    return;
  }
  set({ selection: { kind: 'step', stepId: target.id } });
  seekSource(target.src);
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
  const source = project?.sources[0];
  if (!project || !source || !playback) return null;
  playback.pause();
  const time = playback.time;
  if (!canPinAt(project, source.id, time)) {
    notify("That frame isn't in the edited guide, so it can't be pinned.", 'error');
    return null;
  }
  const existing = stepAtTime(project, source.id, time);
  const stepId = existing?.id ?? newId('s');
  run(commands.pinStep({ stepId, annotationId: newId('a'), source: source.id, time, at, now: Date.now() }));
  set({ selection: { kind: 'step', stepId } });
  if (!existing) notify(`Pinned step at ${formatSeconds(time)}.`);
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
  set(s => ({ selection: validSelection(selectProject(s), s.selection) }));
}

export function setStepHold(stepId: string, seconds: number, coalesceKey?: string): void {
  const hold = Math.min(8, Math.max(1, seconds));
  run({
    label: 'Change pause',
    coalesceKey,
    run: d => {
      const step = d.steps.find(s => s.id === stepId);
      if (step && step.minHold !== hold) {
        step.minHold = hold;
        d.updatedAt = Date.now();
      }
    },
  });
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
  set(s => ({ selection: validSelection(selectProject(s), s.selection) }));
}

/** Delete: removes the selected annotation, or the selected step. */
export function deleteSelection(): void {
  const { selection } = getEditor();
  if (!selection) return;
  if (selection.kind === 'annotation') removeAnnotation(selection.stepId, selection.id);
  else removeStep(selection.stepId);
}

// ----- playback callbacks ---------------------------------------------------------------------------------------------

export function setPlaybackState(playback: PlaybackState): void {
  set({ playback });
}

/** The playback moved to a recording time. */
export function setSourceTime(time: number): void {
  const project = selectProject(getEditor());
  const source = project?.sources[0];
  if (project && source) set({ playhead: srcToTl(project.timeline, source.id, time) });
}

export function resetEditor(): void {
  set({ ...INITIAL, tool: getEditor().tool, snap: getEditor().snap, ripple: getEditor().ripple, muted: getEditor().muted, zoom: 1 });
}

export { INITIAL as INITIAL_EDITOR_STATE };
export const patchEditor = set;
