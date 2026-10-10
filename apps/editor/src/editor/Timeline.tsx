import { formatTimecode, srcToTl, tlToSrc, type Project, type Step } from '@waypost/core';
import { Icon, IconButton, Surface, cx, focusRing } from '@waypost/ui';
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
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { currentPlayback } from '../engine/session';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  getEditor,
  jumpStep,
  moveStep,
  removeStep,
  seekSource,
  seekTimeline,
  selectProject,
  selectStep,
  setZoom,
  stepFrames,
  timelineTimeOf,
  toggleRipple,
  toggleSnap,
  totalDuration,
  useEditor,
  zoomBy,
  ZOOM_FACTOR,
} from '../state/store';

const LANES: ReadonlyArray<{ label: string; icon: LucideIcon; note: string }> = [
  { label: 'Video', icon: Film, note: '' },
  { label: 'Steps', icon: MapPin, note: '' },
  { label: 'Blur', icon: Grid3x3, note: 'Blur regions arrive in the editing phase' },
  { label: 'Voice', icon: Mic, note: 'Narration arrives in the audio phase' },
  { label: 'Music', icon: Music, note: 'Background music arrives in the audio phase' },
];

const SNAP_PIXELS = 8;

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

export function Timeline() {
  const project = useEditor(selectProject);
  const snap = useEditor(s => s.snap);
  const ripple = useEditor(s => s.ripple);
  const zoom = useEditor(s => s.zoom);
  const phase = useEditor(s => s.phase);
  const duration = project ? totalDuration(project) : 0;

  const scroller = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const trackW = Math.max(1, viewW * zoom);
  const x = (t: number) => (duration > 0 ? (t / duration) * trackW : 0);
  const [snapX, setSnapX] = useState<number | null>(null);
  const dragging = useRef(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* zooming keeps the playhead where it is on screen (centred if it was off screen) */
  const previous = useRef({ trackW: 1, scroll: 0 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || duration <= 0) return;
    const before = previous.current;
    if (before.trackW !== trackW) {
      const frac = getEditor().playhead / duration;
      const oldViewX = frac * before.trackW - before.scroll;
      const viewX = oldViewX >= 0 && oldViewX <= viewW ? oldViewX : viewW / 2;
      el.scrollLeft = frac * trackW - viewX;
    }
    previous.current = { trackW, scroll: el.scrollLeft };
  }, [trackW, duration, viewW]);

  /* while zoomed in, the view follows the playhead unless the person is scrubbing or dragging */
  const playhead = useEditor(s => s.playhead);
  useEffect(() => {
    const el = scroller.current;
    if (!el || zoom <= 1 || dragging.current || duration <= 0) return;
    const px = x(playhead);
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth) el.scrollLeft = px - el.clientWidth / 2;
    previous.current.scroll = el.scrollLeft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, zoom]);

  /** snap targets in timeline seconds: the ends, the playhead (unless it is being dragged) and every pin */
  const targets = (p: Project, skipStep?: string, includePlayhead = true): number[] => [
    0,
    totalDuration(p),
    ...(includePlayhead ? [getEditor().playhead] : []),
    ...p.steps.filter(s => s.id !== skipStep).map(s => timelineTimeOf(p, s)),
  ];

  /** a pointer position as timeline seconds, snapped to the nearest target within 8 screen pixels */
  const timeAt = (clientX: number, e: { altKey: boolean }, skipStep?: string, includePlayhead = true): number => {
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left + el.scrollLeft;
    let t = Math.min(duration, Math.max(0, (px / trackW) * duration));
    const wantsSnap = getEditor().snap !== e.altKey; /* Alt flips snapping for this drag */
    setSnapX(null);
    if (wantsSnap && project) {
      let best: number | null = null;
      for (const target of targets(project, skipStep, includePlayhead)) {
        if (Math.abs(x(target) - px) <= SNAP_PIXELS && (best === null || Math.abs(x(target) - px) < Math.abs(x(best) - px))) best = target;
      }
      if (best !== null) {
        t = best;
        setSnapX(x(best));
      }
    }
    return t;
  };

  const onRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || phase !== 'ready') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    seekTimeline(timeAt(e.clientX, e, undefined, false));
  };
  const onRulerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current && e.currentTarget.hasPointerCapture(e.pointerId)) seekTimeline(timeAt(e.clientX, e, undefined, false));
  };
  const onRulerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    setSnapX(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const pps = duration > 0 ? trackW / duration : 1;
  const tick = tickStep(pps);
  const ticks: number[] = [];
  if (duration > 0) for (let t = 0; t <= duration + 1e-9; t += tick) ticks.push(Math.round(t * 1000) / 1000);

  return (
    <Surface as="section" aria-label="Timeline" className="flex min-w-0 flex-col overflow-hidden [grid-area:tl]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-3 py-2">
        <Readout />
        <Transport />
        <div className="flex items-center justify-end gap-1">
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
      <div className="flex gap-2 p-2">
        <div className="flex w-[84px] shrink-0 flex-col gap-1 pt-[24px]" aria-hidden="true">
          {LANES.map(lane => (
            <span key={lane.label} className="flex h-7 items-center gap-1.5 text-sm text-fg-muted">
              <Icon icon={lane.icon} size={14} />
              {lane.label}
            </span>
          ))}
        </div>
        <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
          <div className="relative flex flex-col gap-1" style={{ width: trackW }}>
            <div
              aria-label="Ruler"
              className="relative h-5 cursor-col-resize touch-none rounded-sm bg-raised select-none"
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
            <VideoLane project={project} x={x} />
            <StepsLane project={project} x={x} duration={duration} timeAt={timeAt} onDragging={on => (dragging.current = on)} onSnap={setSnapX} />
            {LANES.slice(2).map(lane => (
              <div key={lane.label} aria-label={`${lane.label} lane, empty`} className="flex h-7 items-center rounded-sm bg-raised px-2 text-xs text-fg-muted">
                <span className="sticky left-2">{lane.note}</span>
              </div>
            ))}
            {snapX !== null && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-snap" style={{ left: snapX }} data-testid="snap-line" />}
            <PlayheadLine duration={duration} trackW={trackW} />
          </div>
        </div>
      </div>
    </Surface>
  );
}

function PlayheadLine({ duration, trackW }: { duration: number; trackW: number }) {
  const playhead = useEditor(s => s.playhead);
  const left = duration > 0 ? (playhead / duration) * trackW : 0;
  return (
    <div className="pointer-events-none absolute inset-y-0 z-10 w-0" style={{ left }} data-testid="playhead">
      <div className="absolute -top-px -left-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-sel" />
      <div className="absolute inset-y-0 -left-px w-0.5 bg-sel" />
    </div>
  );
}

function VideoLane({ project, x }: { project: Project | null; x: (t: number) => number }) {
  const clips = project?.timeline ?? [];
  /* where each clip starts on the timeline: the gaps and lengths of the clips before it */
  const starts = clips.map((_, i) => clips.slice(0, i + 1).reduce((t, c, j) => t + c.gap + (j < i ? (c.out - c.in) / c.speed : 0), 0));
  return (
    <div aria-label={project ? 'Video lane' : 'Video lane, empty'} className="relative h-7 rounded-sm bg-raised">
      {clips.map((clip, i) => {
        const left = x(starts[i]!);
        const width = x(starts[i]! + (clip.out - clip.in) / clip.speed) - left;
        return (
          <div key={clip.id} className="absolute inset-y-0 flex items-center overflow-hidden rounded-sm border border-clip-line bg-clip px-2 text-xs text-fg" style={{ left, width }}>
            <span className="sticky left-2 truncate">
              Clip {i + 1} · {formatTimecode(clip.in)}–{formatTimecode(clip.out)} · {clip.speed}×
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface StepsLaneProps {
  project: Project | null;
  x: (t: number) => number;
  duration: number;
  timeAt: (clientX: number, e: { altKey: boolean }, skipStep?: string, includePlayhead?: boolean) => number;
  onDragging: (on: boolean) => void;
  onSnap: (x: number | null) => void;
}

function StepsLane({ project, x, timeAt, onDragging, onSnap }: StepsLaneProps) {
  const selection = useEditor(s => s.selection);
  const media = useEditor(s => s.media);
  const [drag, setDrag] = useState<{ id: string; tl: number } | null>(null);
  const gesture = useRef<{ id: string; startX: number; moved: boolean; last: number } | null>(null);

  const down = (e: ReactPointerEvent<HTMLButtonElement>, step: Step) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: step.id, startX: e.clientX, moved: false, last: step.anchor.time };
    onDragging(true);
    selectStep(step.id);
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || !project || !media) return;
    if (!g.moved && Math.abs(e.clientX - g.startX) < 3) return;
    g.moved = true;
    const tl = timeAt(e.clientX, e, g.id);
    const pos = tlToSrc(project.timeline, tl);
    if (!pos) return;
    const frameTime = media.index.snap(pos.time);
    const taken = project.steps.some(s => s.id !== g.id && Math.abs(s.anchor.time - frameTime) < 0.5 / media.info.fps);
    if (taken) return; /* it stays at the last free frame */
    g.last = frameTime;
    setDrag({ id: g.id, tl: srcToTl(project.timeline, pos.source, frameTime) });
    seekSource(frameTime);
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    gesture.current = null;
    onDragging(false);
    onSnap(null);
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g?.moved) moveStep(g.id, g.last); /* one undo step for the whole drag */
  };
  const key = (e: React.KeyboardEvent, step: Step) => {
    if (!media) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      moveStep(step.id, media.index.step(step.anchor.time, e.key === 'ArrowRight' ? 1 : -1));
      seekSource(getEditor().history ? selectProject(getEditor())!.steps.find(s => s.id === step.id)?.anchor.time ?? step.anchor.time : step.anchor.time);
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
    <div aria-label={project?.steps.length ? 'Steps lane' : 'Steps lane, empty'} className="relative h-7 rounded-sm bg-raised">
      {project?.steps.map((step, i) => {
        const tl = drag?.id === step.id ? drag.tl : timelineTimeOf(project, step);
        const active = selection !== null && 'stepId' in selection && selection.stepId === step.id;
        return (
          <button
            key={step.id}
            type="button"
            aria-label={`Step ${i + 1}${step.title ? `, ${step.title}` : ''}, at ${formatTimecode(step.anchor.time)}`}
            aria-pressed={active}
            data-step-marker={step.id}
            onPointerDown={e => down(e, step)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={e => key(e, step)}
            className={cx(
              'absolute top-0.5 grid size-6 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-pill border-2 text-xs font-semibold select-none',
              active ? 'border-sel bg-pin text-on-pin' : 'border-transparent bg-pin text-on-pin hover:border-pin-line',
              focusRing,
            )}
            style={{ left: x(tl) }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
