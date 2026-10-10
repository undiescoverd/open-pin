/* Where the player's pictures and motion come from. A published guide loads files that sit next to guide.json; the editor's preview
   hands the player its own (frames decoded from the recording, motion drawn live), so preview runs the same player code. */

export interface SegmentSurface {
  /** the box the picture fills; a driver may put its own elements in it, over the canvas */
  box: HTMLElement;
  /** the composed picture; a driver may draw on it instead */
  canvas: HTMLCanvasElement;
}

/** Plays the motion between steps. */
export interface SegmentDriver {
  /** starts fetching a segment that will play soon */
  preload(file: string): void;
  /** plays a segment from its start; resolves when it has ended, failed or been aborted */
  play(file: string, signal: AbortSignal): Promise<void>;
  pause(): void;
  resume(): void;
  /** how far through the playing segment, 0 to 1 */
  progress(): number;
  /** takes the motion off screen; the player calls it once the canvas shows what comes next */
  hide(): void;
  dispose(): void;
}

export interface GuideMedia {
  /** a still, the poster, the logo or the background image, by its path in guide.json */
  image(path: string): Promise<CanvasImageSource>;
  /** the address of a file, for fonts */
  url(path: string): string;
  driver(surface: SegmentSurface): SegmentDriver;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      /* decode() makes the first draw instant; where it fails the loaded image still draws */
      const ready = typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve();
      void ready.then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

/** Files next to guide.json. Images are fetched once and kept. */
export function urlMedia(base: string): GuideMedia {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const url = (path: string) => new URL(path, base).href;
  return {
    url,
    image(path) {
      let image = images.get(path);
      if (!image) {
        image = loadImage(url(path));
        images.set(path, image);
        /* a failed load can be tried again later */
        image.catch(() => images.delete(path));
      }
      return image;
    },
    driver: surface => new VideoDriver(surface, url),
  };
}

/**
 * Plays segment files in two <video> elements, so the next segment loads while the viewer reads a step. A video is muted and
 * inline (no sound until Phase 4), which every browser lets play without a tap, iPhone included. It only appears once its first
 * frame is on screen (requestVideoFrameCallback where there is one), so the swap from the still never flashes.
 */
class VideoDriver implements SegmentDriver {
  private readonly videos: HTMLVideoElement[];
  private current: HTMLVideoElement | null = null;

  constructor(
    surface: SegmentSurface,
    private readonly url: (path: string) => string,
  ) {
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video');
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.disablePictureInPicture = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.setAttribute('aria-hidden', 'true');
      v.tabIndex = -1;
      surface.box.append(v);
      return v;
    });
  }

  private holding(file: string): HTMLVideoElement | undefined {
    return this.videos.find(v => v.dataset.file === file);
  }

  preload(file: string): void {
    if (this.holding(file)) return;
    const v = this.videos.find(x => x !== this.current) ?? this.videos[0]!;
    v.dataset.file = file;
    v.src = this.url(file);
    v.load();
  }

  play(file: string, signal: AbortSignal): Promise<void> {
    this.preload(file);
    const v = this.holding(file)!;
    this.current = v;
    if (v.readyState > 0 && v.currentTime > 0) v.currentTime = 0;
    return new Promise(resolve => {
      const show = () => {
        if (this.current !== v || signal.aborted) return;
        v.classList.add('on');
        for (const other of this.videos) if (other !== v) other.classList.remove('on');
      };
      const done = () => {
        v.removeEventListener('ended', done);
        v.removeEventListener('error', done);
        signal.removeEventListener('abort', done);
        resolve();
      };
      v.addEventListener('ended', done);
      v.addEventListener('error', done);
      signal.addEventListener('abort', done);
      /* older Safari and Firefox have no requestVideoFrameCallback; 'playing' comes a moment early there */
      if (typeof (v as Partial<HTMLVideoElement>).requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(show);
      else v.addEventListener('playing', show, { once: true });
      /* a refused or failed play skips the motion rather than leaving the viewer stuck */
      v.play().catch(done);
    });
  }

  pause(): void {
    this.current?.pause();
  }

  resume(): void {
    void this.current?.play().catch(() => undefined);
  }

  progress(): number {
    const v = this.current;
    return v && v.duration > 0 ? Math.min(1, v.currentTime / v.duration) : 0;
  }

  hide(): void {
    for (const v of this.videos) {
      v.classList.remove('on');
      v.pause();
    }
    this.current = null;
  }

  dispose(): void {
    for (const v of this.videos) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }
  }
}
