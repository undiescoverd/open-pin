import type { Project } from '@waypost/core';

/**
 * The next-step hint under the frame (docs/06-simplify-plan.md, "Other decisions"): one quiet suggestion of the next useful thing,
 * and nothing once the guide is ready. `looked` is whether the guide has been previewed, or Export opened, since the project opened.
 */
export function nextHint(project: Project, looked: boolean): string {
  if (project.steps.length === 0) return 'Press Add step where the viewer should click';
  const untitled = project.steps.findIndex(s => !s.title.trim());
  if (untitled >= 0) return `Give step ${untitled + 1} a title`;
  return looked ? '' : 'Preview it, then Export';
}
