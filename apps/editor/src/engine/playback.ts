import { clipStarts, spotAt, timelineDuration, type Clip } from '@waypost/core';
import type { MediaHandle } from '@waypost/media';

/* Preview playback (docs/02-architecture.md, "Preview playback"; docs/05-editor-interactions.md, section 6).

   - The playhead is in timeline time: the edited result, with its cuts, gaps and per-clip speeds.
   - Playing forward through a clip uses a hidden <video> at the clip's speed; each animation frame the current picture is drawn on
     the canvas. Crossing a cut seeks the video to the next clip (a tiny hitch is fine in preview; exports are exact). A gap holds
     the last frame of the clip before it.
   - Paused, scrubbing, stepping, playing backward and very fast shuttling use exact frames decoded in the media worker, so the
     paused frame is the frame that gets pinned and exported.
   - Everything stops at every pinned step, at any speed and in either direction. */

export interface PlaybackState {
  /** signed playback rate; 0 means paused */
  rate: number;
  /** the step playback stopped at, until playback carries on */
  stoppedAt: string | null;
}

export interface Pin {
  id: string;
  /** timeline time of the pinned frame */
  time: number;
}

export interface PlaybackHost {
  /** the clips, in timeline order */
  clips(): readonly Clip[];
  /** pinned steps on the timeline, ascending */
  pins(): readonly Pin[];
  /** draws a frame (a video element, or a bitmap from the worker) showing `sourceTime` of the recording */
  draw(frame: CanvasImageSource, sourceTime: number): void;
  /** the playhead moved, in timeline seconds */
  onTime(time: number): void;
  onState(state: PlaybackState): void;
  muted(): boolean;
}

const EPSILON = 1e-6;
/** The range of playbackRate a <video> plays smoothly; beyond it frames come from the worker. */
const VIDEO_RATES = [0.0625, 16] as const;

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise(resolve => target.addEventListener(event, () => resolve(), { once: true }));
}

function nextFrame(): Promise<number> {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/** A frame position on the timeline: the timeline time it starts at and the frame index that shows. */
interface FramePos {
  tl: number;
  index: number;
}

export class Playback {
  /** the playhead, timeline seconds. While paused inside a clip it is always where a real frame starts. */
  time = 0;
  private rate = 0;
  private stoppedAt: string | null = null;
  private rememberedRate = 1;
  private rememberedDir: 1 | -1 = 1;
  private playToken = 0;
  /** true while the <video> is what's on screen */
  private videoShowing = false;
  private wanted: number | null = null;
  private pumping = false;
  private lastBitmap: { bitmap: ImageBitmap; sourceTime: number } | null = null;
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

  private get clips(): readonly Clip[] {
    return this.host.clips();
  }
  private get duration(): number {
    return timelineDuration(this.clips);
  }

  private emitState(): void {
    this.host.onState(this.state);
  }

  // ----- frames on the timeline ---------------------------------------------------------------------------------------

  /** The frame index showing at a source time inside clip `k`, clamped to the clip's own frames. */
  private indexIn(k: number, sourceTime: number): number {
    const c = this.clips[k]!;
    const index = this.media.index;
    const first = index.indexAt(c.in);
    const last = Math.max(first, index.indexAt(c.out - EPSILON));
    return Math.min(last, Math.max(first, index.indexAt(sourceTime)));
  }

  /** The timeline time where frame `index` starts inside clip `k` (the clip's start for a frame that began before its in point). */
  private tlOf(k: number, index: number): number {
    const c = this.clips[k]!;
    const start = clipStarts(this.clips)[k]!;
    return start + Math.max(0, this.media.index.timeAt(index) - c.in) / c.speed;
  }

  private firstFrame(k: number): FramePos {
    const index = this.indexIn(k, this.clips[k]!.in);
    return { tl: this.tlOf(k, index), index };
  }
  private lastFrame(k: number): FramePos {
    const index = this.indexIn(k, this.clips[k]!.out - EPSILON);
    return { tl: this.tlOf(k, index), index };
  }

  /** What shows at a timeline time: the frame there, or in a gap the last frame before it (the first, before every clip). */
  private frameAt(tl: number): { index: number; snapped: number } {
    const spot = spotAt(this.clips, tl);
    if (!spot) return { index: 0, snapped: 0 };
    if (spot.kind === 'gap') {
      const held = spot.index > 0 ? this.lastFrame(spot.index - 1) : this.firstFrame(0);
      return { index: held.index, snapped: tl };
    }
    const index = this.indexIn(spot.index, spot.time);
    return { index, snapped: this.tlOf(spot.index, index) };
  }

  /** The last frame on the timeline, where reaching the end pauses. */
  private get endPos(): FramePos {
    return this.clips.length ? this.lastFrame(this.clips.length - 1) : { tl: 0, index: 0 };
  }

  // ----- drawing ------------------------------------------------------------------------------------------------------

  /** Draws the frame with this index from the worker. Only the latest request matters, so scrubbing never queues up. */
  private show(index: number): void {
    this.videoShowing = false;
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
        if (this.disposed || this.videoShowing) {
          bitmap.close();
          continue;
        }
        this.lastBitmap?.bitmap.close();
        this.lastBitmap = { bitmap, sourceTime: this.media.index.timeAt(index) };
        this.host.draw(bitmap, this.lastBitmap.sourceTime);
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Draws the last frame again, e.g. after the annotations or framing changed. */
  redraw(): void {
    if (this.videoShowing) return;
    if (this.lastBitmap) this.host.draw(this.lastBitmap.bitmap, this.lastBitmap.sourceTime);
  }

  /** Puts the playhead at `tl` and shows the frame there, without touching the playing state. */
  private place(tl: number, index?: number): void {
    this.time = tl;
    this.show(index ?? this.frameAt(tl).index);
    this.host.onTime(tl);
  }

  // ----- transport ----------------------------------------------------------------------------------------------------

  /** Moves to a timeline time and pauses. Inside a clip the playhead lands where the frame showing there starts. */
  seek(tl: number): void {
    this.halt();
    const { index, snapped } = this.frameAt(Math.min(Math.max(0, tl), this.duration));
    const end = this.endPos;
    const target = snapped > end.tl ? end : { tl: snapped, index };
    this.stoppedAt = null;
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.place(target.tl, target.index);
    this.emitState();
  }

  /** The frame `delta` frames away, crossing cuts (gaps are skipped: they hold no frames of their own). */
  private frameStep(tl: number, delta: 1 | -1): FramePos {
    const spot = spotAt(this.clips, tl);
    if (!spot) return { tl: 0, index: 0 };
    if (spot.kind === 'gap') return delta > 0 ? this.firstFrame(spot.index) : spot.index > 0 ? this.lastFrame(spot.index - 1) : this.firstFrame(0);
    const k = spot.index;
    const here = this.indexIn(k, spot.time);
    const hereTl = this.tlOf(k, here);
    if (delta < 0 && tl > hereTl + EPSILON) return { tl: hereTl, index: here };
    const last = this.lastFrame(k), first = this.firstFrame(k);
    if (delta > 0) {
      if (here < last.index) return { tl: this.tlOf(k, here + 1), index: here + 1 };
      return k + 1 < this.clips.length ? this.firstFrame(k + 1) : last;
    }
    if (here > first.index) return { tl: this.tlOf(k, here - 1), index: here - 1 };
    return k > 0 ? this.lastFrame(k - 1) : first;
  }

  /** Steps whole frames; the first step after playing starts from the paused frame. */
  stepFrames(count: number): void {
    this.pause();
    let pos: FramePos = { tl: this.time, index: this.frameAt(this.time).index };
    for (let i = 0; i < Math.abs(count); i++) pos = this.frameStep(pos.tl, count > 0 ? 1 : -1);
    this.seek(pos.tl);
  }

  /** Stops whatever is running without resetting the remembered speed or announcing anything. */
  private halt(): void {
    this.playToken++;
    this.video.pause();
    this.rate = 0;
  }

  /** Pauses on the frame showing now. An explicit pause forgets the shuttle speed. */
  pause(): void {
    if (this.rate === 0) return;
    this.halt();
    const { index, snapped } = this.frameAt(this.time);
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.place(snapped, index);
    this.emitState();
  }

  /** Starts playing at a signed rate. From the end, forward playing restarts at the beginning. */
  async play(rate: number): Promise<void> {
    if (rate === 0) return this.pause();
    const dir: 1 | -1 = rate > 0 ? 1 : -1;
    if (dir > 0 && this.time >= this.endPos.tl - EPSILON) this.seek(0);
    if (dir < 0 && this.time <= EPSILON) return;
    this.halt();
    const token = this.playToken;
    this.stoppedAt = null;
    this.rate = rate;
    this.rememberedRate = Math.abs(rate);
    this.rememberedDir = dir;
    this.wanted = null;
    this.emitState();
    try {
      await (dir > 0 ? this.runForward(token) : this.runClock(token));
    } catch {
      if (token === this.playToken) this.pause();
    }
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

  // ----- the playing loops --------------------------------------------------------------------------------------------

  /** The pin crossed moving from `from` to `to` (excluding where it started), if any. */
  private pinBetween(from: number, to: number): Pin | undefined {
    const pins = this.host.pins();
    return to >= from
      ? pins.find(p => from + EPSILON < p.time && p.time <= to + EPSILON)
      : [...pins].reverse().find(p => to - EPSILON <= p.time && p.time < from - EPSILON);
  }

  /**
   * Advances the playhead on a clock (backward, through gaps, or when a clip's speed times the shuttle rate is beyond what the
   * video plays), drawing worker frames. Forward, it hands back when it reaches `until`; backward it runs to the start.
   */
  private async runClock(token: number, until?: number): Promise<'done' | 'stopped'> {
    let last = performance.now();
    for (;;) {
      const now = await nextFrame();
      if (token !== this.playToken || this.disposed) return 'stopped';
      const prev = this.time;
      let t = prev + (this.rate * (now - last)) / 1000;
      last = now;
      if (until !== undefined && t >= until) t = until;
      const pin = this.pinBetween(prev, t);
      if (pin) return this.stopAt(pin), 'stopped';
      if (this.rate > 0 && t >= this.endPos.tl - EPSILON && (until === undefined || until >= this.endPos.tl - EPSILON)) return this.finish(1), 'stopped';
      if (this.rate < 0 && t <= 0) return this.finish(-1), 'stopped';
      this.time = t;
      const index = this.frameAt(t).index;
      if (this.wanted === null) this.show(index);
      else this.wanted = index;
      this.host.onTime(t);
      if (until !== undefined && t >= until) return 'done';
    }
  }

  /** Plays forward through the timeline: clips in the <video> at their speed, gaps and very fast stretches on the clock. */
  private async runForward(token: number): Promise<void> {
    for (;;) {
      if (token !== this.playToken) return;
      const clips = this.clips;
      const spot = spotAt(clips, this.time);
      if (!spot) return;
      const starts = clipStarts(clips);
      if (spot.kind === 'gap') {
        if ((await this.runClock(token, starts[spot.index]!)) === 'stopped') return;
        continue;
      }
      const k = spot.index;
      const clip = clips[k]!;
      const end = starts[k]! + (clip.out - clip.in) / clip.speed;
      const videoRate = clip.speed * Math.abs(this.rate);
      if (videoRate < VIDEO_RATES[0] || videoRate > VIDEO_RATES[1]) {
        if ((await this.runClock(token, end)) === 'stopped') return;
      } else if ((await this.runVideo(token, k, videoRate)) === 'stopped') return;
      if (k === clips.length - 1) return this.finish(1);
      this.time = end;
    }
  }

  /** Plays clip `k` in the <video> from the playhead to the clip's out point. */
  private async runVideo(token: number, k: number, videoRate: number): Promise<'done' | 'stopped'> {
    const clip = this.clips[k]!;
    const start = clipStarts(this.clips)[k]!;
    const v = this.video;
    if (v.readyState < 1) await once(v, 'loadedmetadata');
    if (token !== this.playToken) return 'stopped';
    const from = clip.in + (this.time - start) * clip.speed;
    if (Math.abs(v.currentTime - from) > 0.0005) {
      const seeked = once(v, 'seeked');
      v.currentTime = from;
      await seeked;
      if (token !== this.playToken) return 'stopped';
    }
    v.playbackRate = videoRate;
    v.muted = this.host.muted() || clip.muted || videoRate > 2;
    v.volume = Math.min(1, clip.volume);
    await v.play();
    if (token !== this.playToken) {
      v.pause();
      return 'stopped';
    }
    this.videoShowing = true;
    for (;;) {
      await nextFrame();
      if (token !== this.playToken || this.disposed) return 'stopped';
      const src = v.currentTime;
      const prev = this.time;
      const reachedOut = src >= clip.out - EPSILON || v.ended;
      const t = start + (Math.min(src, clip.out) - clip.in) / clip.speed;
      const pin = this.pinBetween(prev, t);
      if (pin) return this.stopAt(pin), 'stopped';
      if (reachedOut) {
        v.pause();
        return 'done';
      }
      this.time = t;
      this.host.draw(v, src);
      this.host.onTime(t);
    }
  }

  private stopAt(pin: Pin): void {
    this.halt();
    const { index } = this.frameAt(pin.time);
    this.stoppedAt = pin.id;
    this.place(pin.time, index);
    this.emitState();
  }

  /** Reaching either end pauses on the first or last frame. */
  private finish(dir: 1 | -1): void {
    this.halt();
    const pos = dir > 0 ? this.endPos : { tl: 0, index: this.frameAt(0).index };
    this.rememberedRate = 1;
    this.rememberedDir = 1;
    this.place(pos.tl, pos.index);
    this.emitState();
  }

  dispose(): void {
    this.disposed = true;
    this.halt();
    this.lastBitmap?.bitmap.close();
    this.lastBitmap = null;
  }
}
