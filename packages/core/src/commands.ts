import type { Draft } from 'immer';
import type { Command } from './history';
import {
  SCHEMA_VERSION,
  type Annotation,
  type ClickAnnotation,
  type Point,
  type Project,
  type Source,
  type Step,
} from './schema';
import { snapToFrame, srcToTl } from './time';

/* The edits Phase 1 makes to a project. Each is a named command (see history.ts). They take every id they need as an argument,
   so they are deterministic and easy to test. Callers check preconditions with the `can*` helpers first. */

/** The default annotation colour, coral-500 in docs/03-design-system.md. */
export const DEFAULT_COLOR = '#FF5A4E';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** A new project around one recording, with one clip covering all of it. */
export function createProject(args: { id: string; name: string; source: Source; now: number }): Project {
  const { source } = args;
  return {
    schema: SCHEMA_VERSION,
    id: args.id,
    name: args.name,
    createdAt: args.now,
    updatedAt: args.now,
    sources: [source],
    timeline: [{ id: `c_${source.id}`, source: source.id, in: 0, out: source.duration, speed: 1, gap: 0 }],
    steps: [],
  };
}

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const clampPoint = ([x, y]: Point): Point => [clamp01(x), clamp01(y)];

/** Two pins on the same frame would be indistinguishable, so a pin needs at least half a frame to itself. */
function sameFrame(a: number, b: number, fps: number): boolean {
  return Math.abs(a - b) < 0.5 / fps;
}

function sourceOf(project: Project, id: string): Source | undefined {
  return project.sources.find(s => s.id === id);
}

/** The step already pinned on this frame, if any. */
export function stepAtTime(project: Project, source: string, time: number): Step | undefined {
  const fps = sourceOf(project, source)?.fps ?? 30;
  return project.steps.find(s => s.anchor.source === source && sameFrame(s.anchor.time, time, fps));
}

/** Pinning is possible on any frame the clips play. */
export function canPinAt(project: Project, source: string, time: number): boolean {
  return project.timeline.some(c => c.source === source && time >= c.in && time <= c.out);
}

function sortSteps(draft: Draft<Project>): void {
  const timeline = draft.timeline;
  draft.steps.sort((a, b) => srcToTl(timeline, a.anchor.source, a.anchor.time) - srcToTl(timeline, b.anchor.source, b.anchor.time));
}

function touch(draft: Draft<Project>, now: number): void {
  draft.updatedAt = now;
}

export function stepIndex(project: Project, stepId: string): number {
  return project.steps.findIndex(s => s.id === stepId);
}

function findStep(draft: Draft<Project>, stepId: string): Draft<Step> {
  const step = draft.steps.find(s => s.id === stepId);
  if (!step) throw new Error(`No step ${stepId}`);
  return step;
}

export const commands = {
  renameProject(name: string, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: 'Rename guide',
      coalesceKey,
      run: d => {
        d.name = name.slice(0, 90);
        touch(d, now);
      },
    };
  },

  /**
   * Pins the frame at `time` and gives it a click marker at `at` (normalised). If a step already sits on that frame, its click
   * marker moves (or is added) instead of a second step appearing.
   */
  pinStep(args: { stepId: string; annotationId: string; source: string; time: number; at?: Point; now: number }): Command<Project> {
    return {
      label: 'Pin step',
      run: d => {
        const src = d.sources.find(s => s.id === args.source);
        if (!src) throw new Error(`No source ${args.source}`);
        const time = Math.min(Math.max(0, args.time), src.duration);
        const existing = d.steps.find(s => s.anchor.source === args.source && sameFrame(s.anchor.time, time, src.fps));
        const marker = (): ClickAnnotation | null =>
          args.at ? { id: args.annotationId, type: 'click', at: clampPoint(args.at), color: DEFAULT_COLOR, reveal: 0 } : null;
        if (existing) {
          const click = existing.annotations.find(a => a.type === 'click');
          if (click && click.type === 'click' && args.at) click.at = clampPoint(args.at);
          else {
            const m = marker();
            if (m) existing.annotations.unshift(m);
          }
        } else {
          const m = marker();
          d.steps.push({ id: args.stepId, anchor: { source: args.source, time }, title: '', body: '', minHold: 2.5, annotations: m ? [m] : [] });
          sortSteps(d);
        }
        touch(d, args.now);
      },
    };
  },

  /** Moves a step to another frame. Refused (no change) if another step sits there, so a drag stops at the last free spot. */
  moveStep(stepId: string, time: number, now: number): Command<Project> {
    return {
      label: 'Move step',
      run: d => {
        const step = findStep(d, stepId);
        const src = d.sources.find(s => s.id === step.anchor.source);
        if (!src) return;
        const t = Math.min(Math.max(0, time), src.duration);
        if (d.steps.some(s => s.id !== stepId && s.anchor.source === step.anchor.source && sameFrame(s.anchor.time, t, src.fps))) return;
        if (step.anchor.time === t) return;
        step.anchor.time = t;
        sortSteps(d);
        touch(d, now);
      },
    };
  },

  setStepText(stepId: string, text: { title?: string; body?: string }, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: text.title !== undefined ? 'Edit title' : 'Edit note',
      coalesceKey,
      run: d => {
        const step = findStep(d, stepId);
        const title = text.title?.slice(0, 120) ?? step.title;
        const body = text.body?.slice(0, 2000) ?? step.body;
        if (title === step.title && body === step.body) return;
        step.title = title;
        step.body = body;
        touch(d, now);
      },
    };
  },

  removeStep(stepId: string, now: number): Command<Project> {
    return {
      label: 'Delete step',
      run: d => {
        const i = d.steps.findIndex(s => s.id === stepId);
        if (i < 0) return;
        d.steps.splice(i, 1);
        touch(d, now);
      },
    };
  },

  addAnnotation(stepId: string, annotation: Annotation, now: number): Command<Project> {
    return {
      label: `Add ${annotation.type}`,
      run: d => {
        findStep(d, stepId).annotations.push(annotation);
        touch(d, now);
      },
    };
  },

  /** Replaces an annotation's fields; the caller passes the whole new geometry, already clamped. */
  updateAnnotation(stepId: string, annotationId: string, patch: Partial<Annotation>, now: number, label = 'Edit annotation', coalesceKey?: string): Command<Project> {
    return {
      label,
      coalesceKey,
      run: d => {
        const a = findStep(d, stepId).annotations.find(x => x.id === annotationId);
        if (!a) return;
        let changed = false;
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'id' || key === 'type') continue;
          const target = a as Record<string, unknown>;
          if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
          target[key] = value;
          changed = true;
        }
        if (changed) touch(d, now);
      },
    };
  },

  removeAnnotation(stepId: string, annotationId: string, now: number): Command<Project> {
    return {
      label: 'Delete annotation',
      run: d => {
        const step = findStep(d, stepId);
        const i = step.annotations.findIndex(a => a.id === annotationId);
        if (i < 0) return;
        step.annotations.splice(i, 1);
        touch(d, now);
      },
    };
  },
};

/** Snaps a pin to the nearest frame when the source has a constant frame rate. */
export function pinTime(time: number, fps: number): number {
  return snapToFrame(time, fps);
}
