import type { Annotation, Point } from '@waypost/core';
import { DEFAULT_COLOR } from '@waypost/core';
import { annotationBox, hits, hitTest, type Ctx } from '@waypost/render';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CURSORS,
  createAnnotation,
  dragHandle,
  handlePositions,
  moveAnnotation,
  type Handle,
} from './annotationEdit';
import {
  addAnnotationAtPlayhead,
  clearSelection,
  getEditor,
  notify,
  pinAtPlayhead,
  selectAnnotation,
  selectProject,
  selectStep,
  setDraft,
  stepAtPlayhead,
  updateAnnotation,
  useEditor,
} from '../state/store';

/* The layer over the canvas that turns pointer gestures into edits (docs/05-editor-interactions.md, section 5): the Pin tool,
   the drawing tools, and the Select tool with its handles. Coordinates are normalised to the recording frame, and sizes in the
   SVG are in canvas pixels so the handles scale with the picture. */

let measureCtx: Ctx | null = null;
function measure(): Ctx {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

type Gesture =
  | { kind: 'draw'; tool: 'callout' | 'arrow' | 'spotlight' | 'box'; start: Point; stepId: string }
  | { kind: 'move'; stepId: string; original: Annotation; start: Point; moved: boolean; label: string }
  | { kind: 'handle'; stepId: string; original: Annotation; handle: Handle; start: Point; moved: boolean };

const DRAG_PIXELS = 3;

interface OverlayProps {
  /** canvas pixels */
  width: number;
  height: number;
  /** pixels on screen */
  cssWidth: number;
}

export function AnnotationOverlay({ width, height, cssWidth }: OverlayProps) {
  const tool = useEditor(s => s.tool);
  const selection = useEditor(s => s.selection);
  const project = useEditor(selectProject);
  const playhead = useEditor(s => s.playhead);
  const rate = useEditor(s => s.playback.rate);
  const draft = useEditor(s => s.draft);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const size = { width, height };
  const k = width / cssWidth; /* canvas pixels per screen pixel */
  const step = project && rate === 0 ? stepAtPlayhead(project, playhead) : undefined;
  const shown: Annotation[] = !step
    ? []
    : draft && draft.stepId === step.id
      ? step.annotations.some(a => a.id === draft.annotation.id)
        ? step.annotations.map(a => (a.id === draft.annotation.id ? draft.annotation : a))
        : [...step.annotations, draft.annotation]
      : step.annotations;
  const selected = selection?.kind === 'annotation' && selection.stepId === step?.id ? shown.find(a => a.id === selection.id) : undefined;

  const toNorm = (e: ReactPointerEvent): Point => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const toPx = (p: Point): Point => [p[0] * width, p[1] * height];

  /** the handle of the selected annotation under a canvas-pixel point, if any */
  const handleAt = (a: Annotation, px: Point): Handle | null => {
    const reach = 11 * k;
    for (const h of handlePositions(a)) {
      const [hx, hy] = handleCentre(h.at, 8 * k, size);
      if (Math.abs(px[0] - hx) <= reach && Math.abs(px[1] - hy) <= reach) return h.handle;
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !project) return;
    e.preventDefault();
    const p = toNorm(e);
    origin.current = { x: e.clientX, y: e.clientY };
    ref.current!.setPointerCapture(e.pointerId);

    if (tool === 'pin') {
      pinAtPlayhead(p);
      return;
    }
    if (tool === 'callout' || tool === 'arrow' || tool === 'spotlight' || tool === 'box') {
      const target = stepAtPlayhead(project, getEditor().playhead);
      if (!target || getEditor().playback.rate !== 0) {
        notify('Pin this frame first (P), then add annotations to it.', 'error');
        return;
      }
      gesture.current = { kind: 'draw', tool, start: p, stepId: target.id };
      setDraft({ stepId: target.id, annotation: { ...createAnnotation(tool, p, p, DEFAULT_COLOR), id: 'draft' } });
      return;
    }
    if (tool !== 'select') return;

    if (!step) {
      clearSelection();
      return;
    }
    const px = toPx(p);
    if (selected) {
      const handle = handleAt(selected, px);
      if (handle) {
        gesture.current = { kind: 'handle', stepId: step.id, original: selected, handle, start: p, moved: false };
        return;
      }
      /* the selected object owns its whole area, even under other annotations */
      if (hits(measure(), selected, px, size, true)) {
        gesture.current = { kind: 'move', stepId: step.id, original: selected, start: p, moved: false, label: `Move ${selected.type}` };
        return;
      }
    }
    const hit = hitTest(measure(), shown, px, size, selection?.kind === 'annotation' ? selection.id : undefined);
    if (hit) {
      selectAnnotation(step.id, hit.id);
      gesture.current = { kind: 'move', stepId: step.id, original: hit, start: p, moved: false, label: `Move ${hit.type}` };
    } else {
      selectStep(step.id, { seek: false });
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    const p = toNorm(e);
    if (!g) {
      /* only for the cursor: what would a press here grab? */
      if (tool === 'select' && step) {
        const px = toPx(p);
        const handle = selected && handleAt(selected, px);
        setHover(handle ?? (hitTest(measure(), shown, px, size, selected?.id) ? 'move' : null));
      }
      return;
    }
    const far = origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) >= DRAG_PIXELS;
    if (g.kind === 'draw') {
      setDraft({ stepId: g.stepId, annotation: { ...createAnnotation(g.tool, g.start, p, DEFAULT_COLOR), id: 'draft' } });
      return;
    }
    if (!far && !g.moved) return;
    g.moved = true;
    const [dx, dy] = [p[0] - g.start[0], p[1] - g.start[1]];
    const next = g.kind === 'move' ? moveAnnotation(g.original, dx, dy) : dragHandle(g.original, g.handle, dx, dy, size);
    setDraft({ stepId: g.stepId, annotation: next });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    const final = getEditor().draft;
    setDraft(null);
    if (g.kind === 'draw') {
      addAnnotationAtPlayhead(createAnnotation(g.tool, g.start, toNorm(e), DEFAULT_COLOR));
      return;
    }
    if (g.moved && final && final.annotation.id === g.original.id) {
      const patch = Object.fromEntries(Object.entries(final.annotation).filter(([key]) => key !== 'id' && key !== 'type')) as Partial<Annotation>;
      updateAnnotation(g.stepId, g.original.id, patch, g.kind === 'move' ? g.label : `Resize ${g.original.type}`);
    }
  };

  const cursor =
    tool === 'select' ? (hover && hover !== 'move' ? CURSORS[hover as Handle] : hover === 'move' ? 'move' : 'default') : 'crosshair';

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="annotation-overlay"
      className="absolute inset-0 touch-none select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      {selected && (
        <svg className="pointer-events-none absolute inset-0" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          <SelectionOutline annotation={selected} size={size} k={k} />
        </svg>
      )}
    </div>
  );
}

/** Handles are kept fully inside the frame, so an object flush with the edge can still be grabbed. */
function handleCentre(at: Point, half: number, size: { width: number; height: number }): Point {
  return [Math.min(Math.max(at[0] * size.width, half), size.width - half), Math.min(Math.max(at[1] * size.height, half), size.height - half)];
}

function SelectionOutline({ annotation, size, k }: { annotation: Annotation; size: { width: number; height: number }; k: number }) {
  const [x, y, w, h] = annotationBox(measure(), annotation, size);
  const pad = annotation.type === 'box' || annotation.type === 'spotlight' ? 0 : 6 * k;
  const half = 8 * k;
  return (
    <g>
      <rect x={x - pad} y={y - pad} width={w + 2 * pad} height={h + 2 * pad} rx={6 * k} fill="none" stroke="#13B8A6" strokeWidth={3 * k} strokeDasharray={`${9 * k} ${6 * k}`} />
      {handlePositions(annotation).map(({ handle, at }) => {
        const [cx, cy] = handleCentre(at, half, size);
        return annotation.type === 'arrow' ? (
          <circle key={handle} cx={cx} cy={cy} r={10 * k} fill="#FFFFFF" stroke="#13B8A6" strokeWidth={3 * k} />
        ) : (
          <rect key={handle} x={cx - half} y={cy - half} width={half * 2} height={half * 2} rx={3 * k} fill="#FFFFFF" stroke="#13B8A6" strokeWidth={3 * k} />
        );
      })}
    </g>
  );
}
