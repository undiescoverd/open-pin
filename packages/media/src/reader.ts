import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input, type InputVideoTrack } from 'mediabunny';
import { FrameIndex } from './frame-index';

/* Reads a recording with Mediabunny on top of WebCodecs: what it contains, the time of every frame, and any frame by index.
   This file is DOM-free apart from canvases, so it runs in the media worker. */

export interface MediaInfo {
  /** seconds */
  duration: number;
  /** pixels, after any rotation */
  size: [number, number];
  /** frames per second (the median frame gap) */
  fps: number;
  codec: string | null;
  hasAudio: boolean;
  frameCount: number;
}

export class UnsupportedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMediaError';
  }
}

export class FrameReader {
  private sinks = new Map<number, CanvasSink>();

  private constructor(
    private readonly input: Input,
    private readonly track: InputVideoTrack,
    readonly info: MediaInfo,
    readonly index: FrameIndex,
  ) {}

  /** Opens a file, checks the browser can decode it, and reads the time of every frame (from packet headers, so it is quick). */
  static async open(file: Blob): Promise<FrameReader> {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new UnsupportedMediaError("This file has no video. Choose a screen recording (MP4, MOV, WebM or MKV).");
      if (!(await track.canDecode())) {
        const codec = track.codec ?? 'this';
        throw new UnsupportedMediaError(`This browser can't play ${codec.toUpperCase()} video. Try Chrome or Edge, or re-export the recording as H.264 MP4.`);
      }
      const times: number[] = [];
      for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) times.push(packet.timestamp);
      if (times.length === 0) throw new UnsupportedMediaError('This recording has no frames.');
      const index = new FrameIndex(times);
      const duration = await input.computeDuration([track]);
      const hasAudio = (await input.getAudioTracks()).length > 0;
      const info: MediaInfo = {
        duration,
        size: [track.displayWidth, track.displayHeight],
        fps: index.fps,
        codec: track.codec,
        hasAudio,
        frameCount: index.length,
      };
      return new FrameReader(input, track, info, index);
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  private sink(width: number | undefined): CanvasSink {
    const key = width ?? 0;
    let sink = this.sinks.get(key);
    if (!sink) {
      sink = new CanvasSink(this.track, width ? { width, height: Math.max(1, Math.round((width * this.info.size[1]) / this.info.size[0])), fit: 'fill' } : {});
      this.sinks.set(key, sink);
    }
    return sink;
  }

  /** The exact frame at a frame index, at full size or scaled to `width`. */
  async frame(frameIndex: number, width?: number): Promise<ImageBitmap> {
    const time = this.index.timeAt(frameIndex);
    const wrapped = await this.sink(width).getCanvas(time);
    if (!wrapped) throw new Error(`No frame at ${time.toFixed(3)} s`);
    const canvas = wrapped.canvas;
    return 'transferToImageBitmap' in canvas ? canvas.transferToImageBitmap() : createImageBitmap(canvas);
  }

  dispose(): void {
    this.sinks.clear();
    this.input.dispose();
  }
}
