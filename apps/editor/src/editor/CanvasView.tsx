import { formatTimecode, frameLayout, introLength, nativeOutputSize } from '@waypost/core';
import { composeScene, loadRenderFonts, sceneFor } from '@waypost/render';
import { useEffect, useRef, type ReactNode } from 'react';
import { Playback, type PlaybackHost } from '../engine/playback';
import { currentPlayback, setPlayback } from '../engine/session';
import { getEditor, selectProject, setPlaybackState, setPlayhead, timelineTimeOf, useEditor } from '../state/store';
import { AnnotationOverlay } from './AnnotationOverlay';
import { easeOutOf, leavingUntil, presentation, projectForDrawing, rememberViewer } from './visible';
import { useFitSize } from './useFitSize';

/** Preview frames are decoded at most this wide; exports use the recording's full size. */
const MAX_PREVIEW_WIDTH = 1920;

/** The frame on a canvas (framed, blurred, zoomed and annotated as it will export), with the playback that feeds it and the
    overlay that edits it. */
export function CanvasView({ children }: { children?: ReactNode }) {
  const media = useEditor(s => s.media);
  const videoUrl = useEditor(s => s.videoUrl);
  const project = useEditor(selectProject);
  const playhead = useEditor(s => s.playhead);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const source = project?.sources[0];

  /* the recording decodes at up to 1920 px wide; the canvas is the framed output at the same scale */
  const decodeWidth = source ? Math.min(source.size[0], MAX_PREVIEW_WIDTH) : 0;
  const scale = source ? decodeWidth / source.size[0] : 1;
  const native: [number, number] = source && project ? nativeOutputSize(project.frame, source.size) : [16, 10];
  const width = Math.max(2, Math.round(native[0] * scale));
  const height = Math.max(2, Math.round(native[1] * scale));
  const layout = source && project ? frameLayout(project.frame, source.size, [width, height]) : null;
  const fit = useFitSize(wrap, width / height);

  /* when the playhead arrived on this frame, for the Viewer entrance */
  const arrival = useRef({ key: '', at: 0 });

  useEffect(() => {
    const el = canvas.current, videoEl = video.current;
    if (!media || !videoUrl || !el || !videoEl || !decodeWidth) return;
    const ctx = el.getContext('2d')!;
    videoEl.src = videoUrl;
    const host: PlaybackHost = {
      clips: () => selectProject(getEditor())?.timeline ?? [],
      pins: () => {
        const p = selectProject(getEditor());
        return p ? p.steps.map(s => ({ id: s.id, time: timelineTimeOf(p, s) })).sort((a, b) => a.time - b.time) : [];
      },
      draw: (frame, sourceTime) => {
        const state = getEditor();
        const p = selectProject(state);
        if (!p) return;
        const key = `${state.playhead}|${state.view}|${state.playback.stoppedAt}`;
        if (arrival.current.key !== key) arrival.current = { key, at: performance.now() };
        const shown = presentation((performance.now() - arrival.current.at) / 1000);
        rememberViewer(shown);
        const scene = sceneFor(projectForDrawing(p, state), {
          frame,
          sourceTime,
          step: shown.step,
          look: shown.look,
          annotationList: shown.annotations,
          assets: state.assetImages,
        });
        composeScene(ctx, el.width, el.height, scene);
      },
      onTime: setPlayhead,
      onState: next => {
        /* Continue, Play or Space from a step shown the Viewer's way: ease out of it rather than cut */
        easeOutOf({ view: getEditor().view, playback: next });
        setPlaybackState(next);
      },
      muted: () => getEditor().muted,
    };
    const playback = new Playback(media, videoEl, decodeWidth, host);
    setPlayback(playback);
    let cancelled = false;
    void loadRenderFonts().then(() => {
      if (!cancelled) playback.seek(0);
    });
    return () => {
      cancelled = true;
      setPlayback(null);
      playback.dispose();
      videoEl.removeAttribute('src');
      videoEl.load();
    };
  }, [media, videoUrl, decodeWidth]);

  /* repaint when something that appears on the frame changes (the playback repaints by itself when the playhead moves) */
  const steps = project?.steps;
  const blurs = project?.blurs;
  const frame = project?.frame;
  const logo = project?.logo;
  const selection = useEditor(s => s.selection);
  const draft = useEditor(s => s.draft);
  const shapeDraft = useEditor(s => s.shapeDraft);
  const rate = useEditor(s => s.playback.rate);
  const stoppedAt = useEditor(s => s.playback.stoppedAt);
  const view = useEditor(s => s.view);
  const assetImages = useEditor(s => s.assetImages);
  useEffect(() => {
    currentPlayback()?.redraw();
  }, [steps, blurs, frame, logo, selection, draft, shapeDraft, rate, view, assetImages, width, height]);

  /* while paused, keep repainting while something eases: the Viewer entrance (the zoom in, the groups appearing) or the exit
     (switching back to Edit). Playing repaints with every frame by itself. */
  useEffect(() => {
    if (rate !== 0) return;
    const state = getEditor();
    const p = selectProject(state);
    const shown = presentation(0);
    if (!p || !shown.viewer || !shown.step) return;
    const until = leavingUntil() || performance.now() + introLength(shown.step) * 1000 + 100;
    let raf = 0;
    const tick = (now: number) => {
      currentPlayback()?.redraw();
      if (now < until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playhead, rate, stoppedAt, view, steps]);

  const inner = layout?.inner ?? [0, 0, width, height];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-2">
      <div ref={wrap} className="relative flex min-h-0 w-full min-w-0 flex-1 items-start justify-center">
        {/* the video element only feeds the canvas while playing forward; it is never shown */}
        <video ref={video} className="hidden" playsInline preload="auto" muted={false} />
        {/* always mounted, so the playback effect finds its canvas; it has no size until the space around it is measured */}
        {source && (
          <div
            className="relative overflow-hidden rounded-md shadow-pop outline outline-1 outline-line [background:repeating-conic-gradient(var(--wp-raised)_0_25%,var(--wp-panel)_0_50%)_0_0/16px_16px]"
            style={{ width: fit.width, height: fit.height }}
          >
            <canvas ref={canvas} width={width} height={height} role="img" aria-label={`Recording frame at ${formatTimecode(playhead)}`} data-testid="frame-canvas" className="block size-full" />
            <div
              className="absolute"
              style={{ left: `${(inner[0] / width) * 100}%`, top: `${(inner[1] / height) * 100}%`, width: `${(inner[2] / width) * 100}%`, height: `${(inner[3] / height) * 100}%` }}
            >
              <AnnotationOverlay width={inner[2]} height={inner[3]} cssWidth={(fit.width * inner[2]) / width} />
            </div>
          </div>
        )}
      </div>
      {/* whatever sits under the frame (the dock) is as wide as the frame, and the frame gets the height that is left */}
      {children && (
        <div className="shrink-0" style={{ width: fit.width > 0 ? fit.width : '100%' }}>
          {children}
        </div>
      )}
    </div>
  );
}
