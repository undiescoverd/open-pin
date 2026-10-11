import type { Draft } from 'immer';
import type { Project } from './schema';

/* Helpers the commands share; not part of the package's API. */

/** Marks the project as changed at `now`. */
export function touch(draft: Draft<Project>, now: number): void {
  draft.updatedAt = now;
}
