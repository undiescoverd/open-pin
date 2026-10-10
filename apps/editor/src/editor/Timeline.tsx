import {
  clipLength,
  clipStarts,
  effectSummary,
  formatTimecode,
  srcToTl,
  tlToSrc,
  topLayer,
  type Blur,
  type ClipEdge,
  type Project,
  type Step,
} from '@waypost/core';
import { Icon, IconButton, Surface, Tooltip, cx, focusRing } from '@waypost/ui';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Grid3x3,
  Magnet,
  MapPin,
  Mic,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  StretchHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { currentPlayback } from '../engine/session';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_FACTOR,
  addBlurInMiddle,
  clearSelection,
  getEditor,
  jumpStep,
  moveStep,
  notify,
  placeBlur,
  removeStep,
  seekSource,
  seekTimeline,
  selectBlur,
  selectClip,
  selectGap,
  selectProject,
  selectStep,
  setZoom,
  stepAtPlayhead,
  stepFrames,
  timelineTimeOf,
  toggleRipple,
  toggleSnap,
  totalDuration,
  trimClip,
  useEditor,
  zoomBy,
  type Selection,
} from '../state/store';
import { releaseFocus } from './keyboard';
import { nearestEdge, timelineEdges } from './snapping';
import { ToolPalette, ViewSwitch } from './ToolPalette';

/* The timeline (docs/05-editor-interactions.md, section 4). Lanes top to bottom: Steps, Video, Effects (one row per layer, the top
   layer in the top row), Voice, Music; picture over sound, as in DaVinci Resolve. Only the ruler moves the playhead. Dragging a
   bar edits the project live, with one coalesce key per drag, so the canvas follows and the whole drag is one undo step. */

const LABEL_W = 96;
/** Height of one row in a lane with many rows (Effects), and how many show before the lane scrolls. */
const ROW_H = 26;
const MAX_ROWS = 4;
const SNAP_PIXELS = 8;
const DRAG_PIXELS = 3;

/** A readable tick spacing for the ruler: the smallest "nice" step that leaves 70 px between labels. */
function tickStep(pixelsPerSecond: number): number {
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find(s => s * pixelsPerSecond >= 70) ?? 600;
}

function tickLabel(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${(Number.isInteger(s) ? s.toFixed(0) : s.toFixed(2)).padStart(Number.isInteger(s) ? 2 : 5, '0')}`;
}

function speedLabel(speed: number): string {
  if (Math.abs(speed - 1 / 3) < 1e-6) return '⅓×';
  if (Math.abs(speed - 0.5) < 1e-6) return '½×';
  return `${Math.round(speed * 100) / 100}×`;
}

function Readout() {
  const playhead = useEditor(s => s.playhead);
  const project = useEditor(selectProject);
  const duration = project ? totalDuration(project) : 0;
  return (
    <output className="font-mono text-sm tabular-nums text-fg" aria-label="Playhead position and length">
      {formatTimecode(playhead, 3)} <span className="text-fg-muted">/ {formatTimecode(duration, 3)}</span>
    </output>
  );
}

function Transport() {
  const phase = useEditor(s => s.phase);
  const playing = useEditor(s => s.playback.rate !== 0);
  const off = phase !== 'ready';
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Transport">
      <IconButton label="Previous step" shortcut={['alt', 'left']} icon={<Icon icon={SkipBack} />} disabled={off} onClick={() => jumpStep(-1)} />
      <IconButton label="Previous frame" shortcut={['left']} icon={<Icon icon={ChevronLeft} />} disabled={off} onClick={() => stepFrames(-1)} />
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        shortcut={['space']}
        variant="secondary"
        icon={<Icon icon={playing ? Pause : Play} />}
        disabled={off}
        onClick={() => currentPlayback()?.toggle()}
        className="rounded-pill"
      />
      <IconButton label="Next frame" shortcut={['right']} icon={<Icon icon={ChevronRight} />} disabled={off} onClick={() => stepFrames(1)} />
      <IconButton label="Next step" shortcut={['alt', 'right']} icon={<Icon icon={SkipForward} />} disabled={off} onClick={() => jumpStep(1)} />
    </div>
  );
}

/** What every lane needs to place things and read the pointer. */
export interface Geometry {
  /** timeline seconds to lane pixels */
  x: (t: number) => number;
  /** lane pixels per timeline second */
  pps: number;
  /** a pointer's clientX as timeline seconds, unclamped */
  timeAtClient: (clientX: number) => number;
  /** snaps a timeline time to the nearest of `targets` within 8 px when snapping is wanted, and shows the amber line */
  snap: (t: number, targets: readonly number[], altKey: boolean) => { t: number; hit: boolean };
  /** the amber line, at a timeline time or hidden */
  showSnap: (t: number | null) => void;
  /** a drag in progress: the view stops following the playhead, and a clip trim freezes the scale */
  setDragging: (on: boolean, freeze?: boolean) => void;
}

let dragCounter = 0;

/**
 * Follows a pointer from a press on a bar until it is released. `move` gets the horizontal distance in pixels once the pointer
 * has moved at least 3 px (or 6 px up or down); `end` says whether it ever did. Window listeners, so a bar that re-renders
 * elsewhere (another layer) keeps the drag.
 */
function follow(e: ReactPointerEvent, handlers: { move: (dx: number, ev: PointerEvent) => void; end: (moved: boolean) => void }): void {
  releaseFocus();
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientX - x0) < DRAG_PIXELS && Math.abs(ev.clientY - y0) < 6) return;
    moved = true;
    handlers.move(ev.clientX - x0, ev);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    handlers.end(moved);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** Clicking empty space in a lane selects the step at the playhead, or nothing. It never moves the playhead. */
function onEmptyLane(e: ReactPointerEvent): void {
  if (e.button !== 0 || e.target !== e.currentTarget) return;
  releaseFocus();
  const state = getEditor();
  const project = selectProject(state);
  const step = project && stepAtPlayhead(project, state.playhead);
  if (step) selectStep(step.id, { seek: false });
  else clearSelection();
}

export function Timeline() {
  const project = useEditor(selectProject);
  const snap = useEditor(s => s.snap);
  const ripple = useEditor(s => s.ripple);
  const zoom = useEditor(s => s.zoom);
  const phase = useEditor(s => s.phase);
  const duration = project ? totalDuration(project) : 0;

  const scroller = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [frozen, setFrozen] = useState<number | null>(null);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const dragging = useRef(false);
  const trackW = Math.max(1, viewW * zoom);
  /* while a clip edge is dragged the scale stays put, so the edge stays under the pointer */
  const scale = frozen ?? duration;
  const pps = scale > 0 ? trackW / scale : 1;
  const x = (t: number) => t * pps;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewW(Math.max(0, el.clientWidth - LABEL_W - 12));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* zooming keeps the playhead where it is on screen (centred if it was off screen) */
  const previous = useRef({ trackW: 1, scroll: 0 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || scale <= 0) return;
    const before = previous.current;
    if (before.trackW !== trackW && frozen === null) {
      const frac = getEditor().playhead / scale;
      const oldViewX = frac * before.trackW - before.scroll;
      const viewX = oldViewX >= 0 && oldViewX <= viewW ? oldViewX : viewW / 2;
      el.scrollLeft = frac * trackW - viewX;
    }
    previous.current = { trackW, scroll: el.scrollLeft };
  }, [trackW, scale, viewW, frozen]);

  /* while zoomed in, the view follows the playhead unless the person is scrubbing or dragging */
  const playhead = useEditor(s => s.playhead);
  useEffect(() => {
    const el = scroller.current;
    if (!el || zoom <= 1 || dragging.current || scale <= 0) return;
    const px = x(playhead);
    if (px < el.scrollLeft || px > el.scrollLeft + viewW) el.scrollLeft = px - viewW / 2;
    previous.current.scroll = el.scrollLeft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, zoom]);

  const geometry: Geometry = {
    x,
    pps,
    timeAtClient: clientX => {
      const el = scroller.current!;
      const px = clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
      return px / pps;
    },
    snap: (t, targets, altKey) => {
      const wants = getEditor().snap !== altKey; /* Alt flips snapping for this drag */
      const best = wants ? nearestEdge(t, targets, pps, SNAP_PIXELS) : null;
      setSnapAt(best);
      return best === null ? { t, hit: false } : { t: best, hit: true };
    },
    showSnap: setSnapAt,
    setDragging: (on, freeze) => {
      dragging.current = on;
      setFrozen(on && freeze ? totalDuration(selectProject(getEditor())!) : null);
      if (!on) setSnapAt(null);
    },
  };

  const scrub = (e: ReactPointerEvent, first: boolean) => {
    const p = selectProject(getEditor());
    if (!p) return;
    const t = Math.min(duration, Math.max(0, geometry.timeAtClient(e.clientX)));
    seekTimeline(geometry.snap(t, timelineEdges(p), e.altKey).t);
    if (first) dragging.current = true;
  };
  const onRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || phase !== 'ready') return;
    e.preventDefault();
    releaseFocus();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub(e, true);
  };
  const onRulerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current && e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e, false);
  };
  const onRulerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    setSnapAt(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const tick = tickStep(pps);
  const ticks: number[] = [];
  if (scale > 0) for (let t = 0; t <= scale + 1e-9; t += tick) ticks.push(Math.round(t * 1000) / 1000);

  return (
    <Surface as="section" aria-label="Timeline" className="flex min-w-0 flex-col overflow-hidden [grid-area:tl]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
        <ToolPalette />
        <ViewSwitch />
        <span className="h-5 w-px bg-line" aria-hidden="true" />
        <Transport />
        <Readout />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Snapping" shortcut={['n']} size="sm" icon={<Icon icon={Magnet} />} pressed={snap} onClick={toggleSnap} />
          <IconButton label="Ripple trim" shortcut={['shift', 'r']} size="sm" icon={<Icon icon={StretchHorizontal} />} pressed={ripple} onClick={toggleRipple} />
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <IconButton label="Zoom timeline out" shortcut={['-']} size="sm" icon={<Icon icon={Minus} />} disabled={phase !== 'ready' || zoom <= MIN_ZOOM} onClick={() => zoomBy(1 / ZOOM_FACTOR)} />
          <input
            type="range"
            aria-label="Timeline zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={phase !== 'ready'}
            onChange={e => setZoom(Number(e.target.value))}
            className={cx('h-4 w-20 accent-[var(--wp-sel)]', focusRing)}
          />
          <IconButton label="Zoom timeline in" shortcut={['=']} size="sm" icon={<Icon icon={Plus} />} disabled={phase !== 'ready' || zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_FACTOR)} />
        </div>
      </div>
      <div ref={scroller} className="relative min-w-0 overflow-x-auto overflow-y-hidden select-none">
        <div className="relative flex flex-col gap-1 py-2 pr-3" style={{ width: LABEL_W + trackW + 12 }}>
          <Row label={null}>
            <div
              aria-label="Ruler"
              className="relative h-5 cursor-col-resize touch-none rounded-sm bg-raised"
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
              onPointerUp={onRulerUp}
              onPointerCancel={onRulerUp}
            >
              {ticks.map(t => (
                <span key={t} className="pointer-events-none absolute top-0 h-full border-l border-line-strong pl-1 font-mono text-xs leading-5 text-fg-muted" style={{ left: x(t) }}>
                  {tickLabel(t)}
                </span>
              ))}
            </div>
          </Row>
          <Row label="Steps" icon={MapPin}>
            <StepsLane project={project} geometry={geometry} />
          </Row>
          <Row label="Video" icon={Film}>
            <VideoLane project={project} geometry={geometry} />
          </Row>
          <EffectsRow project={project} geometry={geometry} />
          <Row label="Voice" icon={Mic}>
            <EmptyLane label="Voice" note="Narration arrives in the audio phase" />
          </Row>
          <Row label="Music" icon={Music}>
            <EmptyLane label="Music" note="Background music arrives in the audio phase" />
          </Row>
          {snapAt !== null && <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-snap" style={{ left: LABEL_W + x(snapAt) }} data-testid="snap-line" />}
          <PlayheadLine x={x} />
        </div>
      </div>
    </Surface>
  );
}

/** A lane with its label, which stays put while the lanes scroll sideways. */
function Row({ label, icon, extra, children }: { label: string | null; icon?: LucideIcon; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start">
      <div className="sticky left-0 z-30 flex shrink-0 items-center gap-1.5 bg-panel pr-2 pl-3 text-sm text-fg-muted" style={{ width: LABEL_W, minHeight: label ? 28 : 20 }}>
        {icon && <Icon icon={icon} size={14} />}
        {label && <span aria-hidden="true">{label}</span>}
        {extra}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EmptyLane({ label, note }: { label: string; note: string }) {
  return (
    <div aria-label={`${label} lane, empty`} className="flex h-7 items-center rounded-sm bg-raised px-2 text-xs text-fg-muted" onPointerDown={onEmptyLane}>
      <span className="pointer-events-none sticky left-[104px]">{note}</span>
    </div>
  );
}

function PlayheadLine({ x }: { x: (t: number) => number }) {
  const playhead = useEditor(s => s.playhead);
  return (
    <div className="pointer-events-none absolute inset-y-0 z-20 w-0" style={{ left: LABEL_W + x(playhead) }} data-testid="playhead">
      <div className="absolute top-1 -left-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-sel" />
      <div className="absolute inset-y-1 -left-px w-0.5 bg-sel" />
    </div>
  );
}

const isSelected = (selection: Selection, kind: 'clip' | 'gap' | 'blur', id: string): boolean =>
  selection !== null && selection.kind === kind && (kind === 'blur' ? 'blurId' in selection && selection.blurId === id : 'clipId' in selection && selection.clipId === id);

/** Trim handles at both ends of a bar. */
function Edges({ onDown }: { onDown: (e: ReactPointerEvent, edge: 'l' | 'r') => void }) {
  return (
    <>
      {(['l', 'r'] as const).map(edge => (
        <span
          key={edge}
          aria-hidden="true"
          data-edge={edge}
          onPointerDown={e => onDown(e, edge)}
          className={cx(
            'absolute inset-y-0 z-10 w-2.5 cursor-ew-resize after:absolute after:inset-y-1 after:w-[3px] after:rounded-sm after:bg-current after:opacity-0 hover:after:opacity-80 group-hover:after:opacity-40',
            edge === 'l' ? 'left-0 after:left-0.5' : 'right-0 after:right-0.5',
          )}
        />
      ))}
    </>
  );
}

// ----- Steps ----------------------------------------------------------------------------------------------------------

function StepsLane({ project, geometry }: { project: Project | null; geometry: Geometry }) {
  const selection = useEditor(s => s.selection);
  const media = useEditor(s => s.media);
  const [drag, setDrag] = useState<{ id: string; tl: number } | null>(null);

  const down = (e: ReactPointerEvent<HTMLButtonElement>, step: Step) => {
    if (e.button !== 0 || !project || !media) return;
    e.preventDefault();
    selectStep(step.id);
    const start = timelineTimeOf(project, step);
    let last = step.anchor.time;
    follow(e, {
      move: (dx, ev) => {
        geometry.setDragging(true);
        const p = selectProject(getEditor())!;
        const targets = timelineEdges(p, { skipStep: step.id });
        const tl = geometry.snap(Math.min(totalDuration(p), Math.max(0, start + dx / geometry.pps)), targets, ev.altKey).t;
        const pos = tlToSrc(p.timeline, tl);
        if (!pos) return;
        const frameTime = media.index.snap(pos.time);
        const taken = p.steps.some(s => s.id !== step.id && Math.abs(s.anchor.time - frameTime) < 0.5 / media.info.fps);
        if (taken) return; /* it stays at the last free frame */
        last = frameTime;
        setDrag({ id: step.id, tl: srcToTl(p.timeline, pos.source, frameTime) });
        seekSource(frameTime);
      },
      end: moved => {
        geometry.setDragging(false);
        setDrag(null);
        if (moved) moveStep(step.id, last); /* one undo step for the whole drag */
      },
    });
  };
  const key = (e: React.KeyboardEvent, step: Step) => {
    if (!media) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const time = media.index.step(step.anchor.time, e.key === 'ArrowRight' ? 1 : -1);
      moveStep(step.id, time);
      seekSource(selectProject(getEditor())?.steps.find(s => s.id === step.id)?.anchor.time ?? step.anchor.time);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      removeStep(step.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      selectStep(step.id);
    }
  };

  return (
    <div aria-label={project?.steps.length ? 'Steps lane' : 'Steps lane, empty'} className="relative h-7 rounded-sm bg-raised" onPointerDown={onEmptyLane}>
      {project?.steps.map((step, i) => {
        const tl = drag?.id === step.id ? drag.tl : timelineTimeOf(project, step);
        const active = selection !== null && 'stepId' in selection && selection.stepId === step.id;
        return (
          <button
            key={step.id}
            type="button"
            aria-label={`Step ${i + 1}${step.title ? `, ${step.title}` : ''}, at ${formatTimecode(tl)}`}
            aria-pressed={active}
            data-step-marker={step.id}
            onPointerDown={e => down(e, step)}
            onKeyDown={e => key(e, step)}
            className={cx(
              'absolute top-0.5 z-10 grid size-6 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-pill border-2 text-xs font-semibold',
              active ? 'border-sel bg-pin text-on-pin' : 'border-transparent bg-pin text-on-pin hover:border-pin-line',
              focusRing,
            )}
            style={{ left: geometry.x(tl) }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

// ----- Video ----------------------------------------------------------------------------------------------------------

/** Where a clip edge would snap in source time while ripple trimming: pins, effect edges, other clips' edges, the recording's ends, the playhead's frame. */
function sourceTargets(project: Project, clipId: string): number[] {
  const src = project.sources[0];
  const targets = [0, src?.duration ?? 0];
  for (const s of project.steps) targets.push(s.anchor.time);
  for (const b of project.blurs) targets.push(b.start, b.end);
  for (const c of project.timeline) if (c.id !== clipId) targets.push(c.in, c.out);
  const playhead = tlToSrc(project.timeline, getEditor().playhead);
  if (playhead) targets.push(playhead.time);
  return targets;
}

function VideoLane({ project, geometry }: { project: Project | null; geometry: Geometry }) {
  const selection = useEditor(s => s.selection);
  const clips = project?.timeline ?? [];
  const starts = clipStarts(clips);

  const trim = (e: ReactPointerEvent, clipId: string, side: 'l' | 'r') => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectClip(clipId);
    const p0 = selectProject(getEditor())!;
    const i = p0.timeline.findIndex(c => c.id === clipId);
    const clip = p0.timeline[i]!;
    const edge: ClipEdge = side === 'l' ? 'in' : 'out';
    const from = clip[edge];
    const pps = geometry.pps;
    const key = `trim-${++dragCounter}`;
    let blocked: string | null = null;
    follow(e, {
      move: (dx, ev) => {
        geometry.setDragging(true, true);
        const state = getEditor();
        const p = selectProject(state)!;
        let value = from + (dx / pps) * clip.speed;
        const wants = state.snap !== ev.altKey;
        if (wants && state.ripple) {
          /* the timeline shifts under the pointer as you ripple trim, so snap in source time */
          const best = nearestEdge(value, sourceTargets(p, clipId), pps / clip.speed, SNAP_PIXELS);
          if (best !== null) value = best;
          geometry.showSnap(null);
          blocked = trimClip(clipId, edge, value, key) ?? blocked;
          if (best !== null) {
            const after = selectProject(getEditor())!;
            const k = after.timeline.findIndex(c => c.id === clipId);
            const c = after.timeline[k];
            if (c) geometry.showSnap(clipStarts(after.timeline)[k]! + (edge === 'in' ? 0 : clipLength(c)));
          }
          return;
        }
        if (wants) {
          /* nothing shifts with ripple off: snap in timeline time, to anything but this clip's own edges */
          const edgeTl = (side === 'l' ? starts[i]! : starts[i]! + clipLength(clip)) + dx / pps;
          const own = new Set([starts[i]!, starts[i]! + clipLength(clip)].map(t => Math.round(t * 1e6) / 1e6));
          const targets = timelineEdges(p, { playhead: state.playhead }).filter(t => !own.has(t));
          const snapped = geometry.snap(edgeTl, targets, ev.altKey);
          value = from + (snapped.t - (side === 'l' ? starts[i]! : starts[i]! + clipLength(clip))) * clip.speed;
        } else geometry.showSnap(null);
        blocked = trimClip(clipId, edge, value, key) ?? blocked;
      },
      end: moved => {
        geometry.setDragging(false);
        if (moved && blocked) notify(blocked);
        const p = selectProject(getEditor());
        if (moved && p && getEditor().playhead > totalDuration(p)) seekTimeline(totalDuration(p));
      },
    });
  };

  return (
    <div aria-label={project ? 'Video lane' : 'Video lane, empty'} className="relative h-7 rounded-sm bg-raised" onPointerDown={onEmptyLane}>
      {clips.map((clip, i) => {
        const left = geometry.x(starts[i]!);
        const width = Math.max(4, geometry.x(starts[i]! + clipLength(clip)) - left);
        const selected = isSelected(selection, 'clip', clip.id);
        const gapSelected = isSelected(selection, 'gap', clip.id);
        return (
          <div key={clip.id} className="contents">
            {clip.gap > 0 && (
              <button
                type="button"
                aria-label={`Gap of ${clip.gap.toFixed(2)} s before clip ${i + 1}`}
                aria-pressed={gapSelected}
                data-gap={clip.id}
                onPointerDown={e => {
                  if (e.button === 0) selectGap(clip.id);
                }}
                onClick={e => e.detail === 0 && selectGap(clip.id)}
                className={cx(
                  'absolute inset-y-0.5 grid place-items-center overflow-hidden rounded-sm border border-dashed border-line-strong text-xs text-fg-muted tabular-nums',
                  '[background:repeating-linear-gradient(135deg,var(--wp-hatch)_0_4px,transparent_4px_8px)]',
                  gapSelected && 'border-solid border-sel ring-2 ring-sel',
                  focusRing,
                )}
                style={{ left: geometry.x(starts[i]! - clip.gap), width: Math.max(4, geometry.x(clip.gap)) }}
              >
                {geometry.x(clip.gap) > 40 ? `${clip.gap.toFixed(1)} s` : ''}
              </button>
            )}
            <div
              role="button"
              tabIndex={0}
              aria-label={`Clip ${i + 1}, ${formatTimecode(clip.in)} to ${formatTimecode(clip.out)} of the recording, ${speedLabel(clip.speed)}${clip.muted ? ', muted' : ''}`}
              aria-pressed={selected}
              data-clip={clip.id}
              onPointerDown={e => {
                if (e.button === 0 && !(e.target as HTMLElement).dataset.edge) selectClip(clip.id);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectClip(clip.id);
                }
              }}
              className={cx(
                'group absolute inset-y-0.5 flex items-center gap-1.5 overflow-hidden rounded-sm border border-clip-line bg-clip px-2.5 text-xs whitespace-nowrap text-fg',
                selected && 'border-sel ring-2 ring-sel',
                clip.muted && 'opacity-70',
                focusRing,
              )}
              style={{ left, width }}
            >
              <span className="pointer-events-none truncate">Clip {i + 1}</span>
              {clip.speed !== 1 && <span className="pointer-events-none rounded-sm bg-panel px-1 font-semibold">{speedLabel(clip.speed)}</span>}
              <Edges onDown={(e, side) => trim(e, clip.id, side)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----- Effects --------------------------------------------------------------------------------------------------------

function EffectsRow({ project, geometry }: { project: Project | null; geometry: Geometry }) {
  const blurs = project?.blurs ?? [];
  const layers = topLayer(blurs) + 1;
  const scrolls = layers > MAX_ROWS;
  const phase = useEditor(s => s.phase);
  return (
    <Row
      label="Effects"
      icon={Grid3x3}
      extra={
        <span className="ml-auto flex items-center gap-1">
          {scrolls && (
            <span className="text-xs" aria-label={`${blurs.length} effects, scroll for more layers`}>
              {blurs.length}↕
            </span>
          )}
          <Tooltip content="Add an effect region at the playhead (or press X and drag over the frame)">
            <button
              type="button"
              aria-label="Add an effect region at the playhead"
              disabled={phase !== 'ready'}
              onClick={addBlurInMiddle}
              className={cx('grid size-5 place-items-center rounded-sm border border-line bg-panel text-fg-muted hover:text-fg disabled:opacity-50', focusRing)}
            >
              <Icon icon={Plus} size={14} />
            </button>
          </Tooltip>
        </span>
      }
    >
      <EffectsLane blurs={blurs} layers={layers} geometry={geometry} />
    </Row>
  );
}

function EffectsLane({ blurs, layers, geometry }: { blurs: readonly Blur[]; layers: number; geometry: Geometry }) {
  const selection = useEditor(s => s.selection);
  const project = useEditor(selectProject);
  const lane = useRef<HTMLDivElement>(null);
  const rows = Math.max(1, layers);
  const height = Math.min(rows, MAX_ROWS) * ROW_H + 4;
  const top = (layer: number) => (layers - 1 - layer) * ROW_H + 2;
  const tl = (time: number) => (project ? srcToTl(project.timeline, project.sources[0]!.id, time) : 0);

  /* a selected bar scrolled out of view scrolls into view */
  const selectedId = selection?.kind === 'blur' ? selection.blurId : null;
  const selectedLayer = blurs.find(b => b.id === selectedId)?.layer;
  useEffect(() => {
    const el = lane.current;
    if (!el || selectedLayer === undefined) return;
    const y = top(selectedLayer);
    if (y < el.scrollTop) el.scrollTop = y - 2;
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight + 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedLayer, layers]);

  /** The layer under the pointer: a row, or above the top row (a new top layer) or below the bottom one (a new bottom layer). */
  const layerAt = (clientY: number): number => {
    const el = lane.current!;
    const n = topLayer(selectProject(getEditor())!.blurs) + 1;
    const row = Math.floor((clientY - el.getBoundingClientRect().top + el.scrollTop - 2) / ROW_H);
    if (row < 0) return n;
    if (row >= n) return -1;
    return n - 1 - row;
  };

  const down = (e: ReactPointerEvent, blur: Blur, mode: 'move' | 'l' | 'r') => {
    if (e.button !== 0 || !project) return;
    e.preventDefault();
    e.stopPropagation();
    selectBlur(blur.id, { seek: true });
    const s0 = tl(blur.start), e0 = tl(blur.end);
    const y0 = e.clientY;
    const key = `blur-${++dragCounter}`;
    follow(e, {
      move: (dx, ev) => {
        geometry.setDragging(true);
        const p = selectProject(getEditor())!;
        const end = totalDuration(p);
        const targets = timelineEdges(p, { skipBlur: blur.id, playhead: getEditor().playhead });
        const dt = dx / geometry.pps;
        let s = s0, e1 = e0;
        if (mode === 'move') {
          const a = geometry.snap(s0 + dt, targets, ev.altKey);
          const b = a.hit ? a : geometry.snap(e0 + dt, targets, ev.altKey);
          const shift = a.hit ? a.t - s0 : b.hit ? b.t - e0 : dt;
          s = s0 + shift;
          e1 = e0 + shift;
          if (s < 0) [s, e1] = [0, e1 - s];
          if (e1 > end) [s, e1] = [s - (e1 - end), end];
        } else if (mode === 'l') s = Math.min(Math.max(0, geometry.snap(s0 + dt, targets, ev.altKey).t), e0);
        else e1 = Math.max(Math.min(end, geometry.snap(e0 + dt, targets, ev.altKey).t), s0);
        const src = (t: number) => tlToSrc(p.timeline, t)?.time ?? 0;
        const row = mode === 'move' && Math.abs(ev.clientY - y0) >= 6 ? layerAt(ev.clientY) : undefined;
        placeBlur(blur.id, { start: src(s), end: src(e1), shift: mode === 'move', row }, key);
      },
      end: () => geometry.setDragging(false),
    });
  };

  return (
    <div
      ref={lane}
      aria-label={blurs.length ? `Effects lane, ${layers} layer${layers === 1 ? '' : 's'}` : 'Effects lane, empty'}
      data-testid="effects-lane"
      className="relative overflow-x-hidden overflow-y-auto overscroll-contain rounded-sm bg-raised [scrollbar-width:thin]"
      style={{ height }}
      onPointerDown={onEmptyLane}
    >
      <div className="pointer-events-none relative" style={{ height: rows * ROW_H + 4 }} />
      {blurs.map(blur => {
        const a = tl(blur.start), b = tl(blur.end);
        const left = geometry.x(a);
        const width = Math.max(10, geometry.x(b) - left);
        const on = blur.effects.filter(f => f.on).length;
        const selected = isSelected(selection, 'blur', blur.id);
        const summary = effectSummary(blur);
        const fadeIn = geometry.x(Math.max(0, tl(blur.start + blur.fadeIn) - a));
        const fadeOut = geometry.x(Math.max(0, b - tl(blur.end - blur.fadeOut)));
        return (
          <div
            key={blur.id}
            role="button"
            tabIndex={0}
            title={`${blur.name} · ${summary} · layer ${blur.layer + 1}`}
            aria-label={`${blur.name}, layer ${blur.layer + 1}, ${summary}`}
            aria-pressed={selected}
            data-blur={blur.id}
            onPointerDown={e => {
              if (!(e.target as HTMLElement).dataset.edge) down(e, blur, 'move');
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectBlur(blur.id, { seek: true });
              }
            }}
            className={cx(
              'group absolute flex cursor-grab touch-none items-center gap-1 overflow-hidden rounded-sm border px-2 text-xs whitespace-nowrap text-fg',
              '[background:repeating-linear-gradient(135deg,var(--wp-hatch)_0_5px,transparent_5px_10px),var(--wp-panel)]',
              on ? 'border-line-strong' : 'border-dashed border-line-strong opacity-70',
              selected && 'border-sel ring-2 ring-sel',
              focusRing,
            )}
            style={{ left, width, top: top(blur.layer), height: ROW_H - 4 }}
          >
            {fadeIn > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 [background:linear-gradient(to_bottom_right,rgba(14,17,22,.2)_50%,transparent_50%)]" style={{ width: fadeIn }} />}
            {fadeOut > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 [background:linear-gradient(to_bottom_left,rgba(14,17,22,.2)_50%,transparent_50%)]" style={{ width: fadeOut }} />}
            <Icon icon={Grid3x3} size={14} className="pointer-events-none relative shrink-0" />
            <span className="pointer-events-none relative truncate">
              {blur.name || 'Effect'}
              {blur.effects.length > 1 ? ` · ${blur.effects.length} effects` : ''}
            </span>
            <Edges onDown={(e, side) => down(e, blur, side)} />
          </div>
        );
      })}
    </div>
  );
}
