import { REVEAL_FADE, REVEAL_INTERVAL, ZOOM_IN, stepIntro, stepShown, usedGroups, type Annotation, type Project, type Step, type StepLook } from '@waypost/core';
import { getEditor, selectProject, stepAtPlayhead, type EditorState } from '../state/store';

/* What the canvas shows right now (docs/03-design-system.md, "Editor layout"): Edit shows the step's annotations with handles;
   Viewer, and any stop during playback, shows the step as the guide will, easing into its zoom and revealing its groups in order;
   playing shows the recording with its framing and blur only. */

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

/** How long a step's entrance takes, so the canvas knows when to stop animating. */
export function introLength(step: Step): number {
  const groups = usedGroups(step).length;
  return (step.zoom ? ZOOM_IN : 0) + Math.max(0, groups - 1) * REVEAL_INTERVAL + REVEAL_FADE + 0.05;
}

/** `elapsed` is the seconds since the playhead arrived on this frame, for the Viewer entrance. */
export function presentation(elapsed: number): Presentation {
  const state = getEditor();
  const project = selectProject(state);
  const viewer = isViewer(state);
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
    const preview = { id: 'new', name: '', source: source.id, start: 0, end: source.duration, style: 'pixelate' as const, amount: 45, radius: 4, opacity: 1, fadeIn: 0, fadeOut: 0, fill: 'ink' as const, keyframes: [{ time: 0, rect: d.rect }] };
    return { ...project, blurs: [...project.blurs, preview] };
  }
  return { ...project, blurs: project.blurs.map(b => (b.id === d.blurId ? { ...b, keyframes: [{ time: b.start, rect: d.rect }] } : b)) };
}
