/* The presentation time of every video frame in a recording. Recordings from QuickTime and many screen recorders have a variable
   frame rate, so "one frame forward" can't be a fixed step: it is the next entry here. Pins snap to these times. */

export class FrameIndex {
  /** presentation times in seconds, ascending */
  readonly times: Float64Array;

  constructor(times: ArrayLike<number>) {
    this.times = Float64Array.from(times).sort();
  }

  get length(): number {
    return this.times.length;
  }

  /** The index of the frame showing at `time`: the last one starting at or before it (the first, before the start). */
  indexAt(time: number): number {
    const t = this.times;
    if (t.length === 0) return 0;
    let lo = 0, hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid]! <= time + 1e-9) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The index of the frame whose start time is closest to `time`. */
  nearestIndex(time: number): number {
    const i = this.indexAt(time);
    const next = this.times[i + 1];
    return next !== undefined && Math.abs(next - time) < Math.abs(time - this.times[i]!) ? i + 1 : i;
  }

  timeAt(index: number): number {
    return this.times[Math.min(Math.max(0, index), this.times.length - 1)] ?? 0;
  }

  /** The start time of the frame `delta` frames away from the one showing at `time`, stopping at the first and last frame. */
  step(time: number, delta: number): number {
    return this.timeAt(this.indexAt(time) + delta);
  }

  /** The time of the frame nearest `time`: what a pin made at `time` is anchored to. */
  snap(time: number): number {
    return this.timeAt(this.nearestIndex(time));
  }

  /** The recording's frame rate: the median gap between frames, which ignores the odd dropped frame. */
  get fps(): number {
    const t = this.times;
    if (t.length < 2) return 30;
    const gaps: number[] = [];
    for (let i = 1; i < t.length; i++) gaps.push(t[i]! - t[i - 1]!);
    gaps.sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1]!;
    return median > 0 ? 1 / median : 30;
  }
}
