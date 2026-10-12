import { commands, newId } from '@waypost/core';
import { getEditor, notify, patchEditor, run, selectProject } from '../state/store';
import { getCapture, patchCapture, type Review } from './state';

/* The two ways out of the review list: Add steps, or Skip. Either closes it; only Add steps changes the project. */

export interface Choice {
  keep: boolean;
  /** fold this click into the step above instead of making its own */
  merge: boolean;
  title: string;
}

export function skipReview(): void {
  if (!getCapture().review) return;
  patchCapture({ review: null });
  notify('Recording ready. Press P, then click the frame where viewers should click.');
}

/** Adds a step for each kept click, in one undo step. A merged click becomes a further marker on the step above it. */
export function acceptReview(review: Review, choices: readonly Choice[]): void {
  const state = getEditor();
  const project = selectProject(state);
  patchCapture({ review: null });
  if (!project || project.sources[0]?.id !== review.source) return;
  const snap = (time: number): number => state.media?.index.snap(time) ?? time;
  const steps: { stepId: string; annotationIds: string[]; time: number; at: [number, number]; title: string; more: [number, number][] }[] = [];
  review.steps.forEach((proposed, i) => {
    const choice = choices[i];
    if (!choice?.keep) return;
    const last = steps[steps.length - 1];
    if (choice.merge && last) {
      last.more.push(proposed.at);
      last.annotationIds.push(newId('a'));
      return;
    }
    steps.push({ stepId: newId('s'), annotationIds: [newId('a')], time: snap(proposed.time), at: proposed.at, title: choice.title.trim(), more: [] });
  });
  if (steps.length === 0) {
    notify('No steps added. Press P, then click the frame where viewers should click.');
    return;
  }
  run(commands.addClickSteps({ source: review.source, steps, now: Date.now() }));
  patchEditor({ selection: { kind: 'step', stepId: steps[0]!.stepId } });
  notify(steps.length === 1 ? 'Added a step. Move it, retitle it or delete it as you like.' : `Added ${steps.length} steps. Move them, retitle them or delete them as you like.`);
}
