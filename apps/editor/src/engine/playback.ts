import type { MediaHandle } from '@waypost/media';

/* Preview playback (docs/02-architecture.md, "Preview playback"; docs/05-editor-interactions.md, section 6).

   - Playing forward uses a hidden <video>; each animation frame the current picture is drawn on the canvas.
   - Paused, scrubbing, stepping and playing backward use exact frames decoded in the media worker, so the paused frame is the
     frame that gets pinned and exported.
   - Everything stops at every pinned step, at any speed and in either direction. */

export interface PlaybackState {
  /** signed playback rate; 0 means paused */
  rate: number;
  /** the step playback stopped at, until playback carries on */
  stoppedAt: string | null;
}

export interface Pin {
  id: string;
  /** source time of the pinned frame */
  time: number;
}

export interface PlaybackHost {
  /** pinned steps, ascending */
  pins(): readonly Pin[];
  /** draws a frame (a video element, or a bitmap from the worker) */
  draw(frame: CanvasImageSource): void;
  /** the playhead moved, in source seconds */
  onTime(time: number): void;
  onState(state: PlaybackState): void;
  muted(): boolean;
}

const EPSILON = 1e-6;

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise(resolve => target.addEventListener(event, () => resolve(), { once: true }));
}

export class Playback {
  /** the playhead, source seconds. While paused it is always the start time of a real frame. */
  time = 0;
  private rate = 0;
  private stoppedAt: string | null = null;
  private rememberedRate = 1;
  private rememberedDir: 1 | -1 = 1;
  private mode: 'video' | 'clock' = 'video';
  private raf = 0;
  private lastTick = 0;
  private playToken = 0;
  private wanted: number | null = null;
  private pumping = false;
  private lastBitmap: ImageBitmap | null = null;
  private disposed = false;

  constructor(
    private readonly media: MediaHandle,
    private readonly video: HTMLVideoElement,
    private readonly width: number,
    private readonly host: PlaybackHost,
  ) {}

  get state(): PlaybackState {
    return { rate: this.rate, stoppedAt: this.stoppedAt };
  }

  private get firstTime(): number {
    return this.media.index.timeAt(0);
  }
  private get lastFrameTime(): number {
    return this.media.index.timeAt(this.media.index.length - 1);
  }

  private emitState(): void {
    this.host.onState(this.state);
  }

  /** Draws the frame with this index from the worker. Only the latest request matters, so scrubbing never queues up. */
  private show(index: number): void {
    this.wanted = index;
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.wanted !== null && !this.disposed) {
        const index = this.wanted;
        this.wanted = null;
        const bitmap = await this.media.frame(index, this.width);
        if (this.disposed || (this.rate > 0 && this.mode === 'video')) {
          bitmap.close();
          continue;
        }
        this.lastBitmap?.close();
        this.lastBitmap = bitmap;
        this.host.draw(bitmap);
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Draws the last frame again, e.g. after the annotations changed. */
  redraw(): void {
    if (this.lastBitmap && !(this.rate > 0 && this.mode === 'video')) this.host.draw(this.lastBitmap);
  }

  /** Moves to the frame showing at `time` and pauses. */
  seek(time: number): void {
    this.halt();
    const index = this.media.index.indexAt(Math.min(Math.max(time, this.firstTime), this.lastFrameTime));
    this.time = this.media.index.timeAt(index);
    this.stoppedAt = null;
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.show(index);
    this.host.onTime(this.time);
    this.emitState();
  }

  /** Steps whole frames; the first step after playing starts from the paused frame. */
  stepFrames(count: number): void {
    this.pause();
    const index = Math.min(Math.max(this.media.index.indexAt(this.time) + count, 0), this.media.index.length - 1);
    this.seek(this.media.index.timeAt(index));
  }

  /** Stops whatever is running without resetting the remembered speed or announcing anything. */
  private halt(): void {
    this.playToken++;
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.rate = 0;
  }

  /** Pauses on the frame showing now. An explicit pause forgets the shuttle speed. */
  pause(): void {
    if (this.rate === 0) return;
    const t = this.mode === 'video' ? this.video.currentTime : this.time;
    this.halt();
    const index = this.media.index.indexAt(t);
    this.time = this.media.index.timeAt(index);
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.show(index);
    this.host.onTime(this.time);
    this.emitState();
  }

  /** Starts playing at a signed rate. From the end, forward playing restarts at the beginning. */
  async play(rate: number): Promise<void> {
    if (rate === 0) return this.pause();
    const dir: 1 | -1 = rate > 0 ? 1 : -1;
    if (dir > 0 && this.time >= this.lastFrameTime - EPSILON) this.seek(this.firstTime);
    if (dir < 0 && this.time <= this.firstTime + EPSILON) return;
    this.halt();
    const token = this.playToken;
    this.stoppedAt = null;
    this.rate = rate;
    this.rememberedRate = Math.abs(rate);
    this.rememberedDir = dir;
    this.mode = dir > 0 ? 'video' : 'clock';
    this.wanted = null;
    if (this.mode === 'video') {
      if (this.video.readyState < 1) await once(this.video, 'loadedmetadata');
      if (token !== this.playToken) return;
      if (Math.abs(this.video.currentTime - this.time) > 0.0005) {
        const seeked = once(this.video, 'seeked');
        this.video.currentTime = this.time;
        await seeked;
        if (token !== this.playToken) return;
      }
      this.video.playbackRate = Math.abs(rate);
      this.video.muted = this.host.muted() || Math.abs(rate) > 2;
      try {
        await this.video.play();
      } catch {
        if (token === this.playToken) this.halt();
        return;
      }
      if (token !== this.playToken) return;
    }
    this.lastTick = performance.now();
    this.emitState();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Space or K: play forward, or pause. Carries on from a stopped step. */
  toggle(): void {
    if (this.rate !== 0) this.pause();
    else void this.play(1);
  }

  /** L (forward) or J (backward): 1×, then 2×, then 4× on repeat presses; after a stop at a step, carries on at the remembered speed. */
  shuttle(dir: 1 | -1): void {
    if (this.rate !== 0 && Math.sign(this.rate) === dir) {
      const next = Math.abs(this.rate) === 1 ? 2 : 4;
      void this.play(dir * next);
    } else if (this.rate === 0 && this.stoppedAt && this.rememberedDir === dir) {
      void this.play(dir * this.rememberedRate);
    } else {
      void this.play(dir);
    }
  }

  /** Called every animation frame while playing. */
  private tick = (now: number): void => {
    if (this.rate === 0 || this.disposed) return;
    const dir = this.rate > 0 ? 1 : -1;
    const prev = this.time;
    const t = this.mode === 'video' ? this.video.currentTime : prev + (this.rate * (now - this.lastTick)) / 1000;
    this.lastTick = now;

    const pin = this.host.pins().find(p => (dir > 0 ? prev + EPSILON < p.time && p.time <= t + EPSILON : t - EPSILON <= p.time && p.time < prev - EPSILON));
    if (pin) return this.stopAt(pin);
    if (dir > 0 ? t >= this.lastFrameTime + this.frameLength() || this.video.ended : t <= this.firstTime) {
      return this.finish(dir > 0 ? this.lastFrameTime : this.firstTime);
    }
    this.time = t;
    if (this.mode === 'video') this.host.draw(this.video);
    else this.show(this.media.index.indexAt(t));
    this.host.onTime(t);
    this.raf = requestAnimationFrame(this.tick);
  };

  private frameLength(): number {
    return 1 / this.media.info.fps;
  }

  private stopAt(pin: Pin): void {
    this.halt();
    const index = this.media.index.indexAt(pin.time);
    this.time = this.media.index.timeAt(index);
    this.stoppedAt = pin.id;
    this.show(index);
    this.host.onTime(this.time);
    this.emitState();
  }

  /** Reaching either end pauses on the first or last frame. */
  private finish(time: number): void {
    this.halt();
    this.time = time;
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.show(this.media.index.indexAt(time));
    this.host.onTime(this.time);
    this.emitState();
  }

  dispose(): void {
    this.disposed = true;
    this.halt();
    this.lastBitmap?.close();
    this.lastBitmap = null;
  }
}
