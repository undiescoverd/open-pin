import { newEffect, outroFrom, outroLength, topLayer, type Blur, stepIntro, stepShown, type Annotation, type Project, type Step, type StepLook } from '@waypost/core';
import { getEditor, selectProject, setView, stepAtPlayhead, type EditorState } from '../state/store';

/* What the canvas shows right now (docs/03-design-system.md, "Editor layout"): Edit shows the step's annotations with handles;
   Viewer, and any stop during playback, shows the step as the guide will, easing into its zoom and revealing its groups in order;
   playing shows the recording with its framing and blur only. Leaving the Viewer's step eases back out the way the guide does:
   the zoom returns to the whole frame and the annotations fade, instead of cutting. */

export interface Presentation {
  /** the pinned step on the frame, while paused */
  step: Step | undefined;
  annotations: readonly Annotation[];
  /** zoom and reveal progress; null draws every annotation, unzoomed (the Edit view) */
  look: StepLook | null;
  /** viewer rendering: no handles, and a click on the frame carries on */
  viewer: boolean;
}

export function isViewer(state: Pick<EditorState, 'view' | 'playback'>): boolean {
  return state.view === 'viewer' || state.playback.stoppedAt !== null;
}

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A step that is easing out of the Viewer: where its look was when it started leaving, and the playhead it was on. */
interface Leaving {
  step: Step;
  from: StepLook;
  startedAt: number;
  playhead: number;
}
let leaving: Leaving | null = null;
/** The Viewer look last drawn on a paused frame, which is what an exit starts from. */
let lastViewer: { step: Step; look: StepLook; playhead: number } | null = null;

/** Notes what a draw showed, so a later exit can start from it. Called by the canvas after every draw. */
export function rememberViewer(shown: Presentation): void {
  const state = getEditor();
  lastViewer = !leaving && shown.viewer && shown.step && shown.look && state.playback.rate === 0 ? { step: shown.step, look: shown.look, playhead: state.playhead } : null;
}

/**
 * Call just before the state changes to `next`. If that stops showing the step on a paused frame the Viewer's way, with the
 * playhead still on it (Continue, Space or Play, or switching back to Edit), the step eases out. Moving the playhead somewhere
 * else (seeking, scrubbing, stepping) cuts, as it should.
 */
export function easeOutOf(next: Pick<EditorState, 'view' | 'playback'>): void {
  const state = getEditor();
  if (!lastViewer || reducedMotion() || state.playhead !== lastViewer.playhead) return;
  if (isViewer(next) && next.playback.rate === 0) return;
  leaving = { step: lastViewer.step, from: lastViewer.look, playhead: lastViewer.playhead, startedAt: performance.now() };
  lastViewer = null;
}

/** When the exit now running finishes (a `performance.now()` time), or 0 if none is. */
export function leavingUntil(): number {
  return leaving ? leaving.startedAt + outroLength(leaving.step) * 1000 : 0;
}

/** Edit or Viewer, easing out of the step if the Viewer was showing one. */
export function switchView(view: EditorState['view']): void {
  easeOutOf({ view, playback: getEditor().playback });
  setView(view);
}

/** `elapsed` is the seconds since the playhead arrived on this frame, for the Viewer entrance. */
export function presentation(elapsed: number): Presentation {
  const state = getEditor();
  const project = selectProject(state);
  const viewer = isViewer(state);
  if (leaving && project) {
    const t = (performance.now() - leaving.startedAt) / 1000;
    /* it ends with its time, or when playback stops somewhere else (paused part of the way into a Continue) */
    if (t < outroLength(leaving.step) && (state.playback.rate !== 0 || state.playhead === leaving.playhead)) {
      return { step: leaving.step, annotations: leaving.step.annotations, look: outroFrom(leaving.from, leaving.step, t), viewer: true };
    }
    leaving = null;
  }
  if (!project || state.playback.rate !== 0) return { step: undefined, annotations: [], look: null, viewer };
  const step = stepAtPlayhead(project, state.playhead);
  if (!step) return { step, annotations: [], look: null, viewer };
  if (viewer) return { step, annotations: step.annotations, look: reducedMotion() ? stepShown(step) : stepIntro(step, elapsed), viewer };
  const { draft } = state;
  const annotations =
    !draft || draft.stepId !== step.id
      ? step.annotations
      : step.annotations.some(a => a.id === draft.annotation.id)
        ? step.annotations.map(a => (a.id === draft.annotation.id ? draft.annotation : a))
        : [...step.annotations, draft.annotation];
  return { step, annotations, look: null, viewer };
}

/** The project as the canvas should draw it: a blur being drawn or dragged shows where the pointer has it. */
export function projectForDrawing(project: Project, state: Pick<EditorState, 'shapeDraft'>): Project {
  const d = state.shapeDraft;
  if (d?.kind !== 'blur') return project;
  const source = project.sources[0]!;
  if (d.blurId === 'new') {
    const preview: Blur = { id: 'new', name: '', source: source.id, start: 0, end: source.duration, layer: topLayer(project.blurs) + 1, effects: [newEffect('pixelate', 'new')], radius: 4, opacity: 1, fadeIn: 0, fadeOut: 0, keyframes: [{ time: 0, rect: d.rect }] };
    return { ...project, blurs: [...project.blurs, preview] };
  }
  return { ...project, blurs: project.blurs.map(b => (b.id === d.blurId ? { ...b, keyframes: [{ time: b.start, rect: d.rect }] } : b)) };
}
