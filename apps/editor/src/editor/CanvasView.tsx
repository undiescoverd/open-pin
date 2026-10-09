import { formatTimecode } from '@waypost/core';
import { composeFrame, loadRenderFonts } from '@waypost/render';
import { useEffect, useRef } from 'react';
import { Playback, type PlaybackHost } from '../engine/playback';
import { currentPlayback, setPlayback } from '../engine/session';
import { getEditor, selectProject, setPlaybackState, setSourceTime, useEditor } from '../state/store';
import { AnnotationOverlay } from './AnnotationOverlay';
import { visibleAnnotations } from './visible';
import { useFitSize } from './useFitSize';

/** Preview frames are drawn at most this wide; exports use the recording's full size. */
const MAX_PREVIEW_WIDTH = 1920;

/** The recording frame on a canvas, with the playback that feeds it and the overlay that edits it. */
export function CanvasView() {
  const media = useEditor(s => s.media);
  const videoUrl = useEditor(s => s.videoUrl);
  const project = useEditor(selectProject);
  const playhead = useEditor(s => s.playhead);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const source = project?.sources[0];

  const aspect = source ? source.size[0] / source.size[1] : 16 / 10;
  const width = source ? Math.min(source.size[0], MAX_PREVIEW_WIDTH) : 0;
  const height = source ? Math.round((width * source.size[1]) / source.size[0]) : 0;
  const fit = useFitSize(wrap, aspect);

  useEffect(() => {
    const el = canvas.current, videoEl = video.current;
    if (!media || !videoUrl || !el || !videoEl || !width) return;
    const ctx = el.getContext('2d')!;
    videoEl.src = videoUrl;
    const host: PlaybackHost = {
      pins: () => selectProject(getEditor())?.steps.map(s => ({ id: s.id, time: s.anchor.time })) ?? [],
      draw: frame => composeFrame(ctx, frame, width, height, { annotations: visibleAnnotations() }),
      onTime: setSourceTime,
      onState: setPlaybackState,
      muted: () => getEditor().muted,
    };
    const playback = new Playback(media, videoEl, width, host);
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
  }, [media, videoUrl, width, height]);

  /* repaint when something that appears on the frame changes (the playback repaints by itself when the playhead moves) */
  const steps = project?.steps;
  const selection = useEditor(s => s.selection);
  const draft = useEditor(s => s.draft);
  const rate = useEditor(s => s.playback.rate);
  useEffect(() => {
    currentPlayback()?.redraw();
  }, [steps, selection, draft, rate]);

  return (
    <div ref={wrap} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
      {/* the video element only feeds the canvas while playing forward; it is never shown */}
      <video ref={video} className="hidden" playsInline preload="auto" muted={false} />
      {/* always mounted, so the playback effect finds its canvas; it has no size until the space around it is measured */}
      {source && (
        <div className="relative overflow-hidden rounded-md shadow-pop outline outline-1 outline-line" style={{ width: fit.width, height: fit.height }}>
          <canvas
            ref={canvas}
            width={width}
            height={height}
            role="img"
            aria-label={`Recording frame at ${formatTimecode(playhead)}`}
            data-testid="frame-canvas"
            className="block size-full"
          />
          <AnnotationOverlay width={width} height={height} cssWidth={fit.width} />
        </div>
      )}
    </div>
  );
}
