import { clipStarts, guideSize, tlToSrc, type GuidePlan, type Project, type TimeClip } from '@waypost/core';
import type { MediaHandle } from '@waypost/media';
import type { GuideMedia, SegmentDriver, SegmentSurface } from '@waypost/player';
import { composeScene, sceneFor, type AssetImages } from '@waypost/render';

/* What the guide preview plays (F9, "In-editor preview"): the same player as a published guide, given pictures and motion made on
   the spot instead of files. Stills are exact frames from the media worker with their effect regions burned in, as the export
   makes them; the motion between steps is the recording playing in a hidden <video>, framed and drawn on the player's canvas by
   @waypost/render each frame, as the editor canvas does while playing. Nothing is encoded, so the preview opens at once. */

type Canvas = HTMLCanvasElement;

function canvas(width: number, height: number): Canvas {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(width));
  c.height = Math.max(2, Math.round(height));
  return c;
}

/** One stretch of a segment: a clip playing from `from` to `to` (source seconds) at `speed`, or a gap that holds the last frame. */
export type Piece = { kind: 'clip'; from: number; to: number; speed: number } | { kind: 'gap'; seconds: number };

/** The clips and gaps that play timeline seconds `from` to `to`, in order. */
export function segmentPieces(clips: readonly TimeClip[], from: number, to: number): Piece[] {
  const pieces: Piece[] = [];
  const starts = clipStarts(clips);
  clips.forEach((c, i) => {
    const start = starts[i]!, end = start + (c.out - c.in) / c.speed;
    const g0 = Math.max(from, start - c.gap), g1 = Math.min(to, start);
    if (g1 - g0 > 1e-6) pieces.push({ kind: 'gap', seconds: g1 - g0 });
    const a = Math.max(from, start), b = Math.min(to, end);
    if (b - a > 1e-6) pieces.push({ kind: 'clip', from: c.in + (a - start) * c.speed, to: c.in + (b - start) * c.speed, speed: c.speed });
  });
  return pieces;
}

function once(target: EventTarget, event: string, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      target.removeEventListener(event, done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    target.addEventListener(event, done);
    signal.addEventListener('abort', done);
  });
}

/** Plays segments from the recording itself, drawing each frame onto the player's canvas. */
class LiveDriver implements SegmentDriver {
  private readonly video: HTMLVideoElement;
  private paused = false;
  private wake: (() => void) | null = null;
  /** true while a clip of a segment is playing in the video */
  private rolling = false;
  private length = 1;
  private gone = 0;

  constructor(
    private readonly surface: SegmentSurface,
    private readonly project: Project,
    private readonly segments: GuidePlan['segments'],
    videoUrl: string,
    private readonly assets: AssetImages,
  ) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('aria-hidden', 'true');
    v.src = videoUrl;
    surface.box.append(v);
    this.video = v;
  }

  preload(): void {
    /* the recording is already local */
  }

  private draw(): void {
    const { canvas } = this.surface;
    const ctx = canvas.getContext('2d')!;
    composeScene(ctx, canvas.width, canvas.height, sceneFor(this.project, { frame: this.video, sourceTime: this.video.currentTime, annotations: false, assets: this.assets }));
  }

  /** Waits while paused. */
  private async running(signal: AbortSignal): Promise<void> {
    while (this.paused && !signal.aborted) await new Promise<void>(resolve => (this.wake = resolve));
  }

  async play(file: string, signal: AbortSignal): Promise<void> {
    const segment = this.segments.find(s => s.file === file);
    if (!segment) return;
    const v = this.video;
    this.length = Math.max(1e-3, segment.to - segment.from);
    this.gone = 0;
    for (const piece of segmentPieces(this.project.timeline, segment.from, segment.to)) {
      await this.running(signal);
      if (signal.aborted) break;
      if (piece.kind === 'gap') {
        /* the canvas keeps showing the last frame */
        const until = performance.now() + piece.seconds * 1000;
        while (performance.now() < until && !signal.aborted && !this.paused) await new Promise(r => requestAnimationFrame(r));
        this.gone += piece.seconds;
        continue;
      }
      v.currentTime = piece.from;
      await once(v, 'seeked', signal);
      if (signal.aborted) break;
      this.draw();
      v.playbackRate = piece.speed;
      const base = this.gone;
      this.rolling = true;
      if (!this.paused) await v.play().catch(() => undefined);
      /* draw each frame until the clip's end, then move on to the next piece */
      await new Promise<void>(resolve => {
        const frame = () => {
          if (signal.aborted) return resolve();
          this.draw();
          this.gone = base + (v.currentTime - piece.from) / piece.speed;
          if (v.currentTime >= piece.to - 0.02 || v.ended) return resolve();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      this.rolling = false;
      v.pause();
      this.gone = base + (piece.to - piece.from) / piece.speed;
    }
    this.rolling = false;
    v.pause();
  }

  pause(): void {
    this.paused = true;
    this.video.pause();
  }

  resume(): void {
    this.paused = false;
    this.wake?.();
    this.wake = null;
    if (this.rolling) void this.video.play().catch(() => undefined);
  }

  progress(): number {
    return Math.min(1, this.gone / this.length);
  }

  hide(): void {
    this.video.pause();
  }

  dispose(): void {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
}

/**
 * The preview's pictures and motion for a project: `image()` turns each guide path into a picture made from the recording, and
 * `dispose()` frees the decoded frames.
 */
export function previewMedia(project: Project, plan: GuidePlan, media: MediaHandle, videoUrl: string, assets: AssetImages): GuideMedia & { dispose(): void } {
  const made = new Map<string, Promise<CanvasImageSource>>();
  const frameAt = async (time: number) => media.frame(media.index.indexAt(time));
  /* the recording alone, effect regions burned in, as steps/<id>.webp is */
  const bare: Project = { ...project, frame: { aspect: 'source', padding: 0, background: { type: 'none' }, cornerRadius: 0, shadow: false }, logo: null };

  const make = async (path: string): Promise<CanvasImageSource> => {
    const asset = plan.assets.find(a => a.file === path);
    if (asset) {
      const image = assets.get(asset.asset);
      if (!image) throw new Error(`No image for ${path}`);
      return image;
    }
    if (path === plan.guide.poster) {
      const start = tlToSrc(project.timeline, 0)?.time ?? 0;
      const bitmap = await frameAt(start);
      try {
        const [w, h] = guideSize(project);
        const c = canvas(w, h);
        composeScene(c.getContext('2d')!, c.width, c.height, sceneFor(project, { frame: bitmap, sourceTime: start, annotations: false, assets, opaque: true }));
        return c;
      } finally {
        bitmap.close();
      }
    }
    const still = plan.stills.find(s => s.file === path);
    if (!still) throw new Error(`Nothing at ${path}`);
    const bitmap = await frameAt(still.step.anchor.time);
    try {
      const c = canvas(bitmap.width, bitmap.height);
      composeScene(c.getContext('2d')!, c.width, c.height, sceneFor(bare, { frame: bitmap, sourceTime: still.step.anchor.time, annotations: false, assets }));
      return c;
    } finally {
      bitmap.close();
    }
  };

  return {
    image(path) {
      let image = made.get(path);
      if (!image) {
        image = make(path);
        made.set(path, image);
      }
      return image;
    },
    url: path => path,
    driver: surface => new LiveDriver(surface, project, plan.segments, videoUrl, assets),
    dispose() {
      made.clear();
    },
  };
}
