import * as Comlink from 'comlink';
import { FrameIndex } from './frame-index';
import type { MediaInfo } from './reader';
import type { MediaWorkerApi } from './worker';

export class MediaUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUnsupportedError';
  }
}

/** An open recording in the media worker. */
export interface MediaHandle {
  readonly info: MediaInfo;
  readonly index: FrameIndex;
  /** The exact frame at a frame index. The caller owns the bitmap and should `close()` it. */
  frame(frameIndex: number, width?: number): Promise<ImageBitmap>;
  close(): void;
}

export interface MediaClient {
  open(file: Blob): Promise<MediaHandle>;
  terminate(): void;
}

/** Starts the media worker. One worker serves every open recording. */
export function createMediaClient(): MediaClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const api = Comlink.wrap<MediaWorkerApi>(worker);
  return {
    async open(file) {
      let result;
      try {
        result = await api.open(file);
      } catch (error) {
        const e = error as Error & { unsupported?: boolean };
        throw e.unsupported ? new MediaUnsupportedError(e.message) : error;
      }
      const { handle, info, times } = result;
      return {
        info,
        index: new FrameIndex(times),
        frame: async (frameIndex, width) => api.frame(handle, frameIndex, width),
        close: () => void api.close(handle),
      };
    },
    terminate: () => worker.terminate(),
  };
}
