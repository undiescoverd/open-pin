import { DEFAULT_COLOR, blurAlphaAt, blurRectAt, zoomBox, type Annotation, type Blur, type Point, type Rect } from '@waypost/core';
import { annotationBox, hits, hitTest, type Ctx } from '@waypost/render';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { currentPlayback } from '../engine/session';
import {
  CURSORS,
  DRAW_THRESHOLD,
  createAnnotation,
  defaultRect,
  dragHandle,
  handlePositions,
  inRect,
  moveAnnotation,
  moveRect,
  onOutline,
  rectBetween,
  rectHandles,
  resizeRect,
  resizeZoom,
  zoomBetween,
  type Handle,
  type RectHandle,
} from './annotationEdit';
import {
  addAnnotationAtPlayhead,
  addBlurAtPlayhead,
  clearSelection,
  getEditor,
  notify,
  pinAtPlayhead,
  selectAnnotation,
  selectBlur,
  selectProject,
  selectStep,
  selectZoom,
  setBlurRectHere,
  setDraft,
  setShapeDraft,
  setStepZoom,
  setTool,
  sourceTimeAt,
  stepAtPlayhead,
  updateAnnotation,
  useEditor,
} from '../state/store';
import { releaseFocus } from './keyboard';
import { isViewer } from './visible';

/* The layer over the recording that turns pointer gestures into edits (docs/05-editor-interactions.md, section 5): the Pin tool,
   the drawing tools, blur and zoom, and the Select tool with its handles. Coordinates are normalised to the recording frame, and
   sizes in the SVG are in canvas pixels so the handles scale with the picture. In the Viewer view (and when playback stopped at
   a step) the frame shows the step as the guide will, so a click carries on instead of editing. */

let measureCtx: Ctx | null = null;
function measure(): Ctx {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

type Gesture =
  | { kind: 'draw'; tool: 'callout' | 'arrow' | 'spotlight' | 'box'; start: Point; stepId: string }
  | { kind: 'move'; stepId: string; original: Annotation; start: Point; moved: boolean; label: string }
  | { kind: 'handle'; stepId: string; original: Annotation; handle: Handle; start: Point; moved: boolean }
  | { kind: 'draw-blur'; start: Point }
  | { kind: 'blur'; blurId: string; original: Rect; handle: RectHandle | null; start: Point; moved: boolean }
  | { kind: 'draw-zoom'; start: Point; stepId: string }
  | { kind: 'zoom'; stepId: string; original: Rect; handle: RectHandle | null; start: Point; moved: boolean };

const DRAG_PIXELS = 3;
const SEL = '#13B8A6';

interface OverlayProps {
  /** canvas pixels covered by the recording */
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
  const shapeDraft = useEditor(s => s.shapeDraft);
  const viewer = useEditor(isViewer);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const size = { width, height };
  const k = width / Math.max(1, cssWidth); /* canvas pixels per screen pixel */
  const paused = rate === 0;
  const step = project && paused ? stepAtPlayhead(project, playhead) : undefined;
  const sourceTime = project ? sourceTimeAt(project, playhead) : 0;
  const shown: Annotation[] = !step
    ? []
    : draft && draft.stepId === step.id
      ? step.annotations.some(a => a.id === draft.annotation.id)
        ? step.annotations.map(a => (a.id === draft.annotation.id ? draft.annotation : a))
        : [...step.annotations, draft.annotation]
      : step.annotations;
  const selected = selection?.kind === 'annotation' && selection.stepId === step?.id ? shown.find(a => a.id === selection.id) : undefined;

  /** blurs showing on this frame, with where they are now (a dragged one where the pointer has it) */
  const visibleBlurs: Array<{ blur: Blur; rect: Rect }> =
    project && paused
      ? project.blurs
          .filter(b => blurAlphaAt({ ...b, opacity: 1 }, sourceTime) > 0 || (shapeDraft?.kind === 'blur' && shapeDraft.blurId === b.id))
          .map(b => ({ blur: b, rect: shapeDraft?.kind === 'blur' && shapeDraft.blurId === b.id ? shapeDraft.rect : blurRectAt(b, sourceTime) }))
      : [];
  const selectedBlur = selection?.kind === 'blur' ? visibleBlurs.find(v => v.blur.id === selection.blurId) : undefined;
  const zoomRect: Rect | null = step ? (shapeDraft?.kind === 'zoom' && shapeDraft.stepId === step.id ? shapeDraft.rect : (step.zoom?.rect ?? null)) : null;
  const zoomSelected = !!step && selection?.kind === 'zoom' && selection.stepId === step.id;

  const toNorm = (e: ReactPointerEvent): Point => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const toPx = (p: Point): Point => [p[0] * width, p[1] * height];
  /** the handle near a canvas-pixel point, among handles at normalised positions */
  const nearHandle = <H extends string>(list: Array<{ handle: H; at: Point }>, px: Point): H | null => {
    const reach = 11 * k;
    for (const h of list) {
      const [hx, hy] = handleCentre(h.at, 8 * k, size);
      if (Math.abs(px[0] - hx) <= reach && Math.abs(px[1] - hy) <= reach) return h.handle;
    }
    return null;
  };
  /** the outline band for an unselected zoom box, normalised per axis */
  const band: [number, number] = [(8 * k) / width, (8 * k) / height];

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !project) return;
    e.preventDefault();
    releaseFocus();
    const p = toNorm(e);
    origin.current = { x: e.clientX, y: e.clientY };
    ref.current!.setPointerCapture(e.pointerId);

    if (viewer && tool === 'select') {
      /* the frame shows the step as the guide will: a click carries on, like the Continue button */
      if (getEditor().playback.stoppedAt) currentPlayback()?.toggle();
      return;
    }
    if (tool === 'pin') {
      pinAtPlayhead(p);
      return;
    }
    if (tool === 'blur') {
      if (!paused) return;
      gesture.current = { kind: 'draw-blur', start: p };
      setShapeDraft({ kind: 'blur', blurId: 'new', rect: defaultRect(p, [0.16, 0.08]) });
      return;
    }
    if (tool === 'callout' || tool === 'arrow' || tool === 'spotlight' || tool === 'box' || tool === 'zoom') {
      const target = stepAtPlayhead(project, getEditor().playhead);
      if (!target || !paused) {
        notify(`Pin this frame first (P), then ${tool === 'zoom' ? 'zoom into it' : 'add annotations to it'}.`, 'error');
        return;
      }
      if (tool === 'zoom') {
        gesture.current = { kind: 'draw-zoom', start: p, stepId: target.id };
        setShapeDraft({ kind: 'zoom', stepId: target.id, rect: zoomBox(p, 0.5) });
        return;
      }
      gesture.current = { kind: 'draw', tool, start: p, stepId: target.id };
      setDraft({ stepId: target.id, annotation: { ...createAnnotation(tool, p, p, DEFAULT_COLOR), id: 'draft' } });
      return;
    }
    if (tool !== 'select' || !paused) return;
    const px = toPx(p);

    /* 1. a handle of the selected object */
    if (selected) {
      const handle = nearHandle(handlePositions(selected), px);
      if (handle) {
        gesture.current = { kind: 'handle', stepId: step!.id, original: selected, handle, start: p, moved: false };
        return;
      }
    }
    if (zoomSelected && zoomRect) {
      const handle = nearHandle(rectHandles(zoomRect), px);
      if (handle) {
        gesture.current = { kind: 'zoom', stepId: step!.id, original: zoomRect, handle, start: p, moved: false };
        return;
      }
    }
    if (selectedBlur) {
      const handle = nearHandle(rectHandles(selectedBlur.rect), px);
      if (handle) {
        gesture.current = { kind: 'blur', blurId: selectedBlur.blur.id, original: selectedBlur.rect, handle, start: p, moved: false };
        return;
      }
    }
    /* 2. anywhere inside the selected object: it owns its whole area, even under other annotations */
    if (selected && hits(measure(), selected, px, size, true)) {
      gesture.current = { kind: 'move', stepId: step!.id, original: selected, start: p, moved: false, label: `Move ${selected.type}` };
      return;
    }
    if (zoomSelected && zoomRect && inRect(p, zoomRect)) {
      gesture.current = { kind: 'zoom', stepId: step!.id, original: zoomRect, handle: null, start: p, moved: false };
      return;
    }
    if (selectedBlur && inRect(p, selectedBlur.rect)) {
      gesture.current = { kind: 'blur', blurId: selectedBlur.blur.id, original: selectedBlur.rect, handle: null, start: p, moved: false };
      return;
    }
    /* 3. whatever is under the pointer: a zoom box's outline, an annotation, a blur, then empty space */
    if (step && zoomRect && onOutline(p, zoomRect, band)) {
      selectZoom(step.id);
      gesture.current = { kind: 'zoom', stepId: step.id, original: zoomRect, handle: null, start: p, moved: false };
      return;
    }
    const hit = step ? hitTest(measure(), shown, px, size, selection?.kind === 'annotation' ? selection.id : undefined) : null;
    if (step && hit) {
      selectAnnotation(step.id, hit.id);
      gesture.current = { kind: 'move', stepId: step.id, original: hit, start: p, moved: false, label: `Move ${hit.type}` };
      return;
    }
    const blurHit = [...visibleBlurs].reverse().find(v => inRect(p, v.rect));
    if (blurHit) {
      selectBlur(blurHit.blur.id);
      gesture.current = { kind: 'blur', blurId: blurHit.blur.id, original: blurHit.rect, handle: null, start: p, moved: false };
      return;
    }
    if (step) selectStep(step.id, { seek: false });
    else clearSelection();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    const p = toNorm(e);
    if (!g) {
      /* only for the cursor: what would a press here grab? */
      if (tool === 'select' && paused && !viewer) {
        const px = toPx(p);
        const handle =
          (selected && nearHandle(handlePositions(selected), px)) ||
          (zoomSelected && zoomRect && nearHandle(rectHandles(zoomRect), px)) ||
          (selectedBlur && nearHandle(rectHandles(selectedBlur.rect), px)) ||
          null;
        const over =
          hitTest(measure(), shown, px, size, selected?.id) ||
          (zoomRect && (zoomSelected ? inRect(p, zoomRect) : onOutline(p, zoomRect, band))) ||
          visibleBlurs.some(v => inRect(p, v.rect));
        setHover(handle ?? (over ? 'move' : null));
      }
      return;
    }
    const far = origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) >= DRAG_PIXELS;
    if (g.kind === 'draw') {
      setDraft({ stepId: g.stepId, annotation: { ...createAnnotation(g.tool, g.start, p, DEFAULT_COLOR), id: 'draft' } });
      return;
    }
    if (g.kind === 'draw-blur') {
      if (far) setShapeDraft({ kind: 'blur', blurId: 'new', rect: rectBetween(g.start, p) });
      return;
    }
    if (g.kind === 'draw-zoom') {
      if (far) setShapeDraft({ kind: 'zoom', stepId: g.stepId, rect: zoomBetween(g.start, p) });
      return;
    }
    if (!far && !g.moved) return;
    g.moved = true;
    const [dx, dy] = [p[0] - g.start[0], p[1] - g.start[1]];
    if (g.kind === 'blur') {
      setShapeDraft({ kind: 'blur', blurId: g.blurId, rect: g.handle ? resizeRect(g.original, g.handle, dx, dy, size) : moveRect(g.original, dx, dy) });
      return;
    }
    if (g.kind === 'zoom') {
      setShapeDraft({ kind: 'zoom', stepId: g.stepId, rect: g.handle ? resizeZoom(g.original, g.handle, p) : moveRect(g.original, dx, dy) });
      return;
    }
    const next = g.kind === 'move' ? moveAnnotation(g.original, dx, dy) : dragHandle(g.original, g.handle, dx, dy, size);
    setDraft({ stepId: g.stepId, annotation: next });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    const final = getEditor().draft;
    const shape = getEditor().shapeDraft;
    setDraft(null);
    setShapeDraft(null);
    const end = toNorm(e);
    const dragged = Math.hypot(end[0] - g.start[0], end[1] - g.start[1]) >= DRAW_THRESHOLD;
    switch (g.kind) {
      case 'draw':
        addAnnotationAtPlayhead(createAnnotation(g.tool, g.start, end, DEFAULT_COLOR));
        return;
      case 'draw-blur':
        addBlurAtPlayhead(dragged && shape?.kind === 'blur' ? shape.rect : defaultRect(g.start, [0.16, 0.08]));
        return;
      case 'draw-zoom':
        setStepZoom(g.stepId, dragged && shape?.kind === 'zoom' ? shape.rect : zoomBox(g.start, 0.5), 'Add zoom');
        setTool('select');
        return;
      case 'blur':
        if (g.moved && shape?.kind === 'blur') setBlurRectHere(g.blurId, shape.rect, g.handle ? 'Resize blur' : 'Move blur');
        return;
      case 'zoom':
        if (g.moved && shape?.kind === 'zoom') setStepZoom(g.stepId, shape.rect, g.handle ? 'Resize zoom' : 'Move zoom');
        return;
      default:
        if (g.moved && final && final.annotation.id === g.original.id) {
          const patch = Object.fromEntries(Object.entries(final.annotation).filter(([key]) => key !== 'id' && key !== 'type')) as Partial<Annotation>;
          updateAnnotation(g.stepId, g.original.id, patch, g.kind === 'move' ? g.label : `Resize ${g.original.type}`);
        }
    }
  };

  const cursor = viewer && tool === 'select' ? 'pointer' : tool === 'select' ? (hover && hover !== 'move' ? CURSORS[hover as Handle] : hover === 'move' ? 'move' : 'default') : 'crosshair';
  const newBlur = shapeDraft?.kind === 'blur' && shapeDraft.blurId === 'new' ? shapeDraft.rect : null;

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
      {!viewer && (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          {visibleBlurs.map(v => (
            <RectOutline key={v.blur.id} rect={v.rect} size={size} k={k} selected={selectedBlur?.blur.id === v.blur.id} testId={`blur-outline-${v.blur.id}`} faint />
          ))}
          {newBlur && <RectOutline rect={newBlur} size={size} k={k} selected={false} />}
          {zoomRect && <RectOutline rect={zoomRect} size={size} k={k} selected={zoomSelected} label={`Zoom ${Math.round((1 / zoomRect[2]) * 100) / 100}×`} testId="zoom-box" />}
          {selected && <SelectionOutline annotation={selected} size={size} k={k} />}
        </svg>
      )}
    </div>
  );
}

/** Handles are kept fully inside the frame, so an object flush with the edge can still be grabbed. */
function handleCentre(at: Point, half: number, size: { width: number; height: number }): Point {
  return [Math.min(Math.max(at[0] * size.width, half), size.width - half), Math.min(Math.max(at[1] * size.height, half), size.height - half)];
}

function Handles({ list, size, k, round }: { list: Array<{ handle: string; at: Point }>; size: { width: number; height: number }; k: number; round?: boolean }) {
  const half = 8 * k;
  return (
    <>
      {list.map(({ handle, at }) => {
        const [cx, cy] = handleCentre(at, half, size);
        return round ? (
          <circle key={handle} cx={cx} cy={cy} r={10 * k} fill="#FFFFFF" stroke={SEL} strokeWidth={3 * k} />
        ) : (
          <rect key={handle} x={cx - half} y={cy - half} width={half * 2} height={half * 2} rx={3 * k} fill="#FFFFFF" stroke={SEL} strokeWidth={3 * k} />
        );
      })}
    </>
  );
}

/** A blur region or zoom box: a dashed outline, with handles when selected. */
function RectOutline({ rect, size, k, selected, label, testId, faint }: { rect: Rect; size: { width: number; height: number }; k: number; selected: boolean; label?: string; testId?: string; faint?: boolean }) {
  const [x, y, w, h] = [rect[0] * size.width, rect[1] * size.height, rect[2] * size.width, rect[3] * size.height];
  return (
    <g data-testid={testId} data-selected={selected}>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={selected ? SEL : '#FFFFFF'} strokeOpacity={selected || !faint ? 1 : 0.7} strokeWidth={(selected ? 3 : 2) * k} strokeDasharray={`${9 * k} ${6 * k}`} />
      {label && (
        <text x={x + 8 * k} y={y + 22 * k} fill="#FFFFFF" stroke="#0E1116" strokeWidth={3 * k} paintOrder="stroke" fontSize={15 * k} fontWeight={600} fontFamily="Figtree, system-ui, sans-serif">
          {label}
        </text>
      )}
      {selected && <Handles list={rectHandles(rect)} size={size} k={k} />}
    </g>
  );
}

function SelectionOutline({ annotation, size, k }: { annotation: Annotation; size: { width: number; height: number }; k: number }) {
  const [x, y, w, h] = annotationBox(measure(), annotation, size);
  const pad = annotation.type === 'box' || annotation.type === 'spotlight' ? 0 : 6 * k;
  return (
    <g>
      <rect x={x - pad} y={y - pad} width={w + 2 * pad} height={h + 2 * pad} rx={6 * k} fill="none" stroke={SEL} strokeWidth={3 * k} strokeDasharray={`${9 * k} ${6 * k}`} />
      <Handles list={handlePositions(annotation)} size={size} k={k} round={annotation.type === 'arrow'} />
    </g>
  );
}
