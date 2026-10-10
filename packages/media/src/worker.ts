import * as Comlink from 'comlink';
import { FrameReader, UnsupportedMediaError, type MediaInfo } from './reader';

/* The media worker: heavy decoding stays off the main thread (docs/02-architecture.md, "Threads"). Its API is called through
   Comlink, so from the editor these look like async functions. Bitmaps are transferred, not copied. */

const readers = new Map<number, FrameReader>();
let nextId = 1;

export interface OpenResult {
  handle: number;
  info: MediaInfo;
  /** every frame's presentation time, ascending */
  times: Float64Array;
}

const api = {
  async open(file: Blob): Promise<OpenResult> {
    try {
      const reader = await FrameReader.open(file);
      const handle = nextId++;
      readers.set(handle, reader);
      const times = new Float64Array(reader.index.times);
      return Comlink.transfer({ handle, info: reader.info, times }, [times.buffer]);
    } catch (error) {
      /* Comlink sends only an error's message, name and stack across, so the name carries what kind it is */
      throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { name: error instanceof UnsupportedMediaError ? error.name : 'Error' });
    }
  },

  async frame(handle: number, frameIndex: number, width?: number): Promise<ImageBitmap> {
    const reader = readers.get(handle);
    if (!reader) throw new Error('That recording is closed');
    const bitmap = await reader.frame(frameIndex, width);
    return Comlink.transfer(bitmap, [bitmap]);
  },

  close(handle: number): void {
    readers.get(handle)?.dispose();
    readers.delete(handle);
  },
};

export type MediaWorkerApi = typeof api;
Comlink.expose(api);
