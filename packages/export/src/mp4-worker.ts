import * as Comlink from 'comlink';
import type { Project } from '@waypost/core';
import { encodeMp4, type Mp4Options, type Mp4Result } from './mp4';
import { ExportCancelled } from './stills';

/* The export worker (docs/02-architecture.md, "Threads"): MP4 rendering and encoding stay off the main thread. The video is
   written straight into the browser's private file system, so a long 4K export never has to fit in memory; the editor then
   hands that file to the person. Called through Comlink. */

let cancelled = false;

export interface Mp4Request {
  project: Project;
  recording: Blob;
  assets: Array<[string, ImageBitmap]>;
  fonts: { regular: ArrayBuffer; semibold: ArrayBuffer };
  options: Mp4Options;
  /** file name under waypost/exports/ in the private file system */
  file: string;
}

async function exportsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle('waypost', { create: true });
  return app.getDirectoryHandle('exports', { create: true });
}

const api = {
  async mp4(request: Mp4Request, onProgress: (done: number, total: number) => void): Promise<Omit<Mp4Result, 'bytes'> & { cancelled?: true }> {
    cancelled = false;
    const dir = await exportsDir();
    /* earlier exports were handed over already; clear them so they don't pile up */
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) if (name !== request.file) await dir.removeEntry(name).catch(() => undefined);
    const handle = await dir.getFileHandle(request.file, { create: true });
    const writable = await handle.createWritable();
    try {
      const result = await encodeMp4({
        project: request.project,
        recording: request.recording,
        assets: new Map(request.assets),
        fonts: request.fonts,
        options: request.options,
        writable: writable as unknown as WritableStream,
        onProgress,
        cancelled: () => cancelled,
      });
      delete result.bytes;
      return result;
    } catch (error) {
      await writable.abort().catch(() => undefined);
      await dir.removeEntry(request.file).catch(() => undefined);
      if (error instanceof ExportCancelled) return { width: 0, height: 0, duration: 0, frames: 0, videoCodec: 'avc', audioCodec: null, cancelled: true };
      /* error classes don't survive structured clone, so carry the message */
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
    } finally {
      for (const [, image] of request.assets) image.close();
    }
  },

  cancel(): void {
    cancelled = true;
  },
};

export type ExportWorkerApi = typeof api;
Comlink.expose(api);
