import { clipLength, clipStarts, srcToTl, type Blur, type ClipEdge, type Project } from '@waypost/core';
import { Button, Icon, Surface, cx, focusRing } from '@waypost/ui';
import { Scissors } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  getEditor,
  notify,
  seekTimeline,
  selectBlur,
  selectClip,
  selectProject,
  setTimelineView,
  totalDuration,
  trimClip,
  useEditor,
} from '../state/store';
import { releaseFocus } from './keyboard';
import { nearestEdge, timelineEdges } from './snapping';
import { follow, nextDragKey } from './drag';
import { PlayheadLine, Readout, StepsLane, Transport, type Geometry } from './Timeline';

/* The filmstrip (docs/06-simplify-plan.md, "Editing a step"): the whole recording as one strip, with the numbered step pins above
   it, hidden areas as tinted bars on it, and trim handles at both ends. It is the default view of the project's time. Trim & edit
   video opens the full timeline (Timeline.tsx) for everything finer; Done there comes back here. The strip always fits the width,
   so nothing scrolls. */

const SNAP_PIXELS = 8;
const PAD = 16;

/** The step a hidden area covers, by number, so the bar can say "Hidden during step 2". */
function stepDuring(project: Project, blur: Blur): number {
  return project.steps.findIndex(s => s.anchor.source === blur.source && s.anchor.time >= blur.start - 1e-6 && s.anchor.time <= blur.end + 1e-6) + 1;
}

export function Filmstrip() {
  const project = useEditor(selectProject);
  const phase = useEditor(s => s.phase);
  const selection = useEditor(s => s.selection);
  const duration = project ? totalDuration(project) : 0;

  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /* while an end is trimmed the scale stays put, so the handle stays under the pointer */
  const [frozen, setFrozen] = useState<number | null>(null);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const scrubbing = useRef(false);

  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = frozen ?? duration;
  const pps = scale > 0 ? width / scale : 1;
  const x = (t: number) => t * pps;

  const geometry: Geometry = {
    x,
    pps,
    timeAtClient: clientX => (clientX - strip.current!.getBoundingClientRect().left) / pps,
    snap: (t, targets, altKey) => {
      const wants = getEditor().snap !== altKey;
      const best = wants ? nearestEdge(t, targets, pps, SNAP_PIXELS) : null;
      setSnapAt(best);
      return best === null ? { t, hit: false } : { t: best, hit: true };
    },
    showSnap: setSnapAt,
    setDragging: (on, freeze) => {
      setFrozen(on && freeze ? totalDuration(selectProject(getEditor())!) : null);
      if (!on) setSnapAt(null);
    },
  };

  const scrub = (e: ReactPointerEvent) => {
    const p = selectProject(getEditor());
    if (!p) return;
    const t = Math.min(duration, Math.max(0, geometry.timeAtClient(e.clientX)));
    seekTimeline(geometry.snap(t, timelineEdges(p), e.altKey).t);
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || phase !== 'ready' || e.target !== e.currentTarget) return;
    e.preventDefault();
    releaseFocus();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = true;
    scrub(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current && e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    scrubbing.current = false;
    setSnapAt(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const clips = project?.timeline ?? [];
  const starts = clipStarts(clips);

  /* the ends of the strip trim the first clip's start and the last clip's end; a pinned step stops them, and the message says so */
  const trimEnd = (e: ReactPointerEvent, side: 'l' | 'r') => {
    if (e.button !== 0 || !project || !clips.length) return;
    e.preventDefault();
    e.stopPropagation();
    const clip = side === 'l' ? clips[0]! : clips[clips.length - 1]!;
    selectClip(clip.id);
    const edge: ClipEdge = side === 'l' ? 'in' : 'out';
    const from = clip[edge];
    const key = nextDragKey();
    let blocked: string | null = null;
    follow(e, {
      move: dx => {
        geometry.setDragging(true, true);
        blocked = trimClip(clip.id, edge, from + (dx / pps) * clip.speed, key) ?? blocked;
      },
      end: moved => {
        geometry.setDragging(false);
        if (moved && blocked) notify(blocked);
        const p = selectProject(getEditor());
        if (moved && p && getEditor().playhead > totalDuration(p)) seekTimeline(totalDuration(p));
      },
    });
  };
  const trimKey = (e: ReactKeyboardEvent, side: 'l' | 'r') => {
    if (!project || !clips.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const clip = side === 'l' ? clips[0]! : clips[clips.length - 1]!;
    const edge: ClipEdge = side === 'l' ? 'in' : 'out';
    const fps = getEditor().media?.info.fps ?? 30;
    const message = trimClip(clip.id, edge, clip[edge] + (e.key === 'ArrowRight' ? 1 : -1) / fps);
    if (message) notify(message);
  };

  return (
    <Surface as="section" aria-label="Filmstrip" className="flex min-w-0 flex-col overflow-hidden [grid-area:tl]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-3 py-2">
        <Readout />
        <div className="flex items-center gap-3">
          <Transport />
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-fg-muted">Playback stops at every step</span>
          <Button size="sm" variant="secondary" disabled={phase !== 'ready'} onClick={() => setTimelineView('full')}>
            <Icon icon={Scissors} size={14} />
            Trim &amp; edit video
          </Button>
        </div>
      </div>
      <div className="relative py-2" style={{ paddingInline: PAD }}>
        <div className="relative" ref={strip}>
          <StepsLane project={project} geometry={geometry} />
          <div
            aria-label={project ? 'Filmstrip' : 'Filmstrip, empty'}
            data-testid="filmstrip-track"
            className="relative mt-1 h-10 touch-none overflow-hidden rounded-sm border border-clip-line bg-clip"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {clips.map((clip, i) => (
              <span
                key={clip.id}
                aria-hidden="true"
                data-clip={clip.id}
                className={cx('pointer-events-none absolute inset-y-0 border-l border-line-strong', i === 0 && 'border-l-0')}
                style={{ left: x(starts[i]!), width: Math.max(1, x(clipLength(clip))) }}
              />
            ))}
            {project?.blurs.map(blur => {
              const left = x(srcToTl(project.timeline, blur.source, blur.start));
              const right = x(srcToTl(project.timeline, blur.source, blur.end));
              const step = stepDuring(project, blur);
              const name = step ? `Hidden during step ${step}` : 'Hidden area';
              const selected = selection?.kind === 'blur' && selection.blurId === blur.id;
              return (
                <button
                  key={blur.id}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={selected}
                  data-hidden-area={blur.id}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => selectBlur(blur.id, { seek: true })}
                  className={cx(
                    'absolute inset-y-0 border-x border-fg-muted bg-fg/25 [background-image:repeating-linear-gradient(135deg,var(--wp-hatch)_0_4px,transparent_4px_8px)]',
                    selected && 'ring-2 ring-sel ring-inset',
                    focusRing,
                  )}
                  style={{ left, width: Math.max(4, right - left) }}
                />
              );
            })}
            {(['l', 'r'] as const).map(side => (
              <button
                key={side}
                type="button"
                aria-label={side === 'l' ? 'Trim start of the video' : 'Trim end of the video'}
                data-edge={side}
                disabled={phase !== 'ready'}
                onPointerDown={e => trimEnd(e, side)}
                onKeyDown={e => trimKey(e, side)}
                className={cx(
                  'absolute inset-y-0 z-10 w-3 cursor-ew-resize bg-fg/30 hover:bg-fg/50',
                  side === 'l' ? 'left-0 rounded-l-sm' : 'right-0 rounded-r-sm',
                  focusRing,
                )}
              />
            ))}
          </div>
          {snapAt !== null && <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-snap" style={{ left: x(snapAt) }} data-testid="snap-line" />}
          <PlayheadLine x={x} offset={0} />
        </div>
      </div>
    </Surface>
  );
}
