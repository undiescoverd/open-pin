import type { Annotation } from '@waypost/core';
import { getEditor, selectProject, stepAtPlayhead } from '../state/store';

/** The annotations to draw right now: the pinned step's, but only while paused on its frame, plus any shape being dragged. */
export function visibleAnnotations(): readonly Annotation[] {
  const state = getEditor();
  const project = selectProject(state);
  if (!project || state.playback.rate !== 0) return [];
  const step = stepAtPlayhead(project, state.playhead);
  if (!step) return [];
  const { draft } = state;
  if (!draft || draft.stepId !== step.id) return step.annotations;
  return step.annotations.some(a => a.id === draft.annotation.id)
    ? step.annotations.map(a => (a.id === draft.annotation.id ? draft.annotation : a))
    : [...step.annotations, draft.annotation];
}
