import type { Draft } from 'immer';
import type { Command } from './history';
import { EFFECTS, compactLayers, dropOnLayer, freeLayer, layerRoom, moveLayer, type LayerMove } from './effects';
import { blurRectAt } from './geometry';
import {
  DEFAULT_FRAME,
  SCHEMA_VERSION,
  type Annotation,
  type Asset,
  type Blur,
  type Effect,
  type ClickAnnotation,
  type Frame,
  type Logo,
  type Point,
  type Project,
  type Rect,
  type Source,
  type Step,
} from './schema';
import { snapToFrame, srcToTl } from './time';

/* The edits made to a project, apart from timeline editing (clips.ts). Each is a named command (see history.ts). They take every id they need as an argument,
   so they are deterministic and easy to test. Callers check preconditions with the `can*` helpers first. */

/** The default annotation colour, coral-500 in docs/03-design-system.md. */
export const DEFAULT_COLOR = '#FF5A4E';

/** An effect region is at least this long, in source seconds. */
export const MIN_REGION = 0.1;

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
    timeline: [{ id: `c_${source.id}`, source: source.id, in: 0, out: source.duration, speed: 1, gap: 0, volume: 1, muted: false }],
    steps: [],
    blurs: [],
    assets: [],
    frame: { ...DEFAULT_FRAME, background: { type: 'none' } },
    logo: null,
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
          d.steps.push({ id: args.stepId, anchor: { source: args.source, time }, title: '', body: '', minHold: 2.5, zoom: null, annotations: m ? [m] : [] });
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

  setStepHold(stepId: string, seconds: number, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: 'Change pause',
      coalesceKey,
      run: d => {
        const step = findStep(d, stepId);
        const hold = Math.min(8, Math.max(1, seconds));
        if (step.minHold === hold) return;
        step.minHold = hold;
        touch(d, now);
      },
    };
  },

  /** Sets or removes (null) a step's zoom box. */
  setStepZoom(stepId: string, rect: Rect | null, now: number, label?: string, coalesceKey?: string): Command<Project> {
    return {
      label: label ?? (rect ? 'Change zoom' : 'Remove zoom'),
      coalesceKey,
      run: d => {
        const step = findStep(d, stepId);
        if (JSON.stringify(step.zoom?.rect ?? null) === JSON.stringify(rect)) return;
        step.zoom = rect ? { rect } : null;
        touch(d, now);
      },
    };
  },

  /** Adds an effect region on the lowest layer with room for it. */
  addBlur(blur: Blur, now: number): Command<Project> {
    return {
      label: 'Add effect region',
      run: d => {
        d.blurs.push({ ...blur, layer: freeLayer(d.blurs, blur.start, blur.end) });
        touch(d, now);
      },
    };
  },

  /** Changes a region's name, corner radius, opacity or fades. Timing, layer, effects and keyframes have their own commands. */
  updateBlur(blurId: string, patch: Partial<Pick<Blur, 'name' | 'radius' | 'opacity' | 'fadeIn' | 'fadeOut'>>, now: number, label = 'Edit effect region', coalesceKey?: string): Command<Project> {
    return {
      label,
      coalesceKey,
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        if (!blur) return;
        let changed = false;
        for (const [key, value] of Object.entries(patch)) {
          const target = blur as Record<string, unknown>;
          if (value === undefined || target[key] === value) continue;
          target[key] = key === 'name' ? String(value).slice(0, 60) : value;
          changed = true;
        }
        if (changed) touch(d, now);
      },
    };
  },

  /**
   * Places a region in time (source seconds) and, from a drag in the Effects lane, on a row: see `dropOnLayer`. Moving the whole
   * bar passes `shift`, which moves its keyframes with it so the motion moves too; trimming an edge leaves them where they are. On
   * its layer it stops at its neighbours, and it keeps at least `MIN_REGION`.
   */
  placeBlur(blurId: string, args: { start: number; end: number; shift: boolean; row?: number }, now: number, coalesceKey?: string): Command<Project> {
    return {
      label: args.shift || args.row !== undefined ? 'Move effect region' : 'Trim effect region',
      coalesceKey,
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        const source = blur && d.sources.find(s => s.id === blur.source);
        if (!blur || !source) return;
        const was = { start: blur.start, end: blur.end };
        const D = source.duration;
        let s: number, e: number;
        if (args.shift) {
          const length = Math.min(D, Math.max(MIN_REGION, was.end - was.start));
          s = Math.min(Math.max(0, args.start), D - length);
          e = s + length;
        } else {
          s = Math.min(Math.max(0, args.start), D);
          e = Math.min(Math.max(0, args.end), D);
          const leftMoved = Math.abs(s - was.start) > 1e-9;
          if (e - s < MIN_REGION) [s, e] = leftMoved ? [e - MIN_REGION, e] : [s, s + MIN_REGION];
        }
        blur.start = s;
        blur.end = e;
        const layers = d.blurs.map(b => b.layer).join();
        if (args.row !== undefined) dropOnLayer(d.blurs, blurId, args.row);
        if (d.blurs.map(b => b.layer).join() === layers) {
          /* still on its own layer: it stops at its neighbours there, judged from where it was */
          const room = layerRoom(d.blurs, blurId, was, { min: 0, max: D });
          if (args.shift) {
            const length = Math.min(e - s, room.max - room.min);
            if (s < room.min) [s, e] = [room.min, room.min + length];
            if (e > room.max) [s, e] = [room.max - length, room.max];
          } else {
            s = Math.max(s, room.min);
            e = Math.min(e, room.max);
          }
          blur.start = s;
          blur.end = e;
        }
        if (Math.abs(blur.start - was.start) < 1e-9 && Math.abs(blur.end - was.end) < 1e-9 && d.blurs.map(b => b.layer).join() === layers) return;
        if (args.shift) for (const k of blur.keyframes) k.time = Math.max(0, k.time + (blur.start - was.start));
        touch(d, now);
      },
    };
  },

  /** Bring forward, Send backward, Bring to front, Send to back. */
  moveBlurLayer(blurId: string, how: LayerMove, now: number): Command<Project> {
    const labels: Record<LayerMove, string> = { up: 'Bring forward', down: 'Send backward', front: 'Bring to front', back: 'Send to back' };
    return {
      label: labels[how],
      run: d => {
        if (moveLayer(d.blurs, blurId, how)) touch(d, now);
      },
    };
  },

  addEffect(blurId: string, effect: Effect, now: number): Command<Project> {
    return {
      label: `Add ${EFFECTS[effect.type].name.toLowerCase()}`,
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        if (!blur) return;
        blur.effects.push(effect);
        touch(d, now);
      },
    };
  },

  /** Switches an effect on or off, or changes its amount or colour. */
  updateEffect(blurId: string, effectId: string, patch: Partial<Pick<Effect, 'on' | 'amount' | 'color'>>, now: number, coalesceKey?: string): Command<Project> {
    const label = patch.on !== undefined ? (patch.on ? 'Switch effect on' : 'Switch effect off') : patch.color !== undefined ? 'Change effect colour' : 'Change effect';
    return {
      label,
      coalesceKey,
      run: d => {
        const effect = d.blurs.find(b => b.id === blurId)?.effects.find(e => e.id === effectId);
        if (!effect) return;
        let changed = false;
        if (patch.on !== undefined && patch.on !== effect.on) [effect.on, changed] = [patch.on, true];
        if (patch.amount !== undefined) {
          const amount = Math.min(100, Math.max(0, patch.amount));
          if (amount !== effect.amount) [effect.amount, changed] = [amount, true];
        }
        if (patch.color !== undefined && patch.color !== effect.color && effect.color !== undefined) [effect.color, changed] = [patch.color, true];
        if (changed) touch(d, now);
      },
    };
  },

  /** Moves an effect earlier (-1) or later (1) in its region's stack. */
  moveEffect(blurId: string, effectId: string, delta: -1 | 1, now: number): Command<Project> {
    return {
      label: delta < 0 ? 'Apply effect earlier' : 'Apply effect later',
      run: d => {
        const effects = d.blurs.find(b => b.id === blurId)?.effects;
        const i = effects?.findIndex(e => e.id === effectId) ?? -1;
        const j = i + delta;
        if (!effects || i < 0 || j < 0 || j >= effects.length) return;
        [effects[i], effects[j]] = [effects[j]!, effects[i]!];
        touch(d, now);
      },
    };
  },

  removeEffect(blurId: string, effectId: string, now: number): Command<Project> {
    return {
      label: 'Remove effect',
      run: d => {
        const effects = d.blurs.find(b => b.id === blurId)?.effects;
        const i = effects?.findIndex(e => e.id === effectId) ?? -1;
        if (!effects || i < 0) return;
        effects.splice(i, 1);
        touch(d, now);
      },
    };
  },

  /**
   * Puts a blur's rectangle at `rect` at a source time. A keyframe within `tolerance` of the time is moved; otherwise a new one
   * is added, so moving a blur after scrubbing makes it follow what it hides (F7).
   */
  setBlurRect(blurId: string, time: number, rect: Rect, tolerance: number, now: number, label = 'Move blur', coalesceKey?: string): Command<Project> {
    return {
      label,
      coalesceKey,
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        if (!blur) return;
        const existing = blur.keyframes.find(k => Math.abs(k.time - time) <= tolerance);
        if (existing) {
          if (JSON.stringify(existing.rect) === JSON.stringify(rect)) return;
          existing.rect = rect;
        } else {
          blur.keyframes.push({ time, rect });
          blur.keyframes.sort((a, b) => a.time - b.time);
        }
        touch(d, now);
      },
    };
  },

  removeBlurKeyframe(blurId: string, time: number, now: number): Command<Project> {
    return {
      label: 'Delete keyframe',
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        if (!blur || blur.keyframes.length < 2) return;
        const i = blur.keyframes.findIndex(k => k.time === time);
        if (i < 0) return;
        blur.keyframes.splice(i, 1);
        touch(d, now);
      },
    };
  },

  /** Drops every keyframe, keeping the blur where it is at `time` for its whole length. */
  flattenBlur(blurId: string, time: number, now: number): Command<Project> {
    return {
      label: 'Stop blur moving',
      run: d => {
        const blur = d.blurs.find(b => b.id === blurId);
        if (!blur || blur.keyframes.length < 2) return;
        const rect = blurRectAt(blur, time);
        blur.keyframes = [{ time: blur.start, rect }];
        touch(d, now);
      },
    };
  },

  removeBlur(blurId: string, now: number): Command<Project> {
    return {
      label: 'Delete effect region',
      run: d => {
        const i = d.blurs.findIndex(b => b.id === blurId);
        if (i < 0) return;
        d.blurs.splice(i, 1);
        compactLayers(d.blurs);
        touch(d, now);
      },
    };
  },

  setFrame(patch: Partial<Frame>, now: number, label = 'Change framing', coalesceKey?: string): Command<Project> {
    return {
      label,
      coalesceKey,
      run: d => {
        const next = { ...d.frame, ...patch };
        if (JSON.stringify(next) === JSON.stringify(d.frame)) return;
        d.frame = next as Frame;
        touch(d, now);
      },
    };
  },

  setLogo(logo: Logo | null, now: number, label?: string, coalesceKey?: string): Command<Project> {
    return {
      label: label ?? (logo ? 'Change logo' : 'Remove logo'),
      coalesceKey,
      run: d => {
        if (JSON.stringify(d.logo) === JSON.stringify(logo)) return;
        d.logo = logo;
        touch(d, now);
      },
    };
  },

  /** Adds a file (a logo or background image) and, in the same undo step, puts it to use. */
  addAsset(asset: Asset, use: { logo?: Logo; background?: true }, now: number): Command<Project> {
    return {
      label: use.logo ? 'Add logo' : 'Add background image',
      run: d => {
        if (!d.assets.some(a => a.id === asset.id)) d.assets.push(asset);
        if (use.logo) d.logo = use.logo;
        if (use.background) d.frame.background = { type: 'image', asset: asset.id };
        touch(d, now);
      },
    };
  },
};

/** Snaps a pin to the nearest frame when the source has a constant frame rate. */
export function pinTime(time: number, fps: number): number {
  return snapToFrame(time, fps);
}
