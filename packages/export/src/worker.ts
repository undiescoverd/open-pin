import * as Comlink from 'comlink';
import type { GuidePlan, Project, Size2 } from '@waypost/core';
import type { VideoCodec } from 'mediabunny';
import { renderGuideMedia } from './guide';
import { encodeMp4, type Mp4Options, type Mp4Result } from './mp4';
import { ExportCancelled } from './stills';

/* The export worker (docs/02-architecture.md, "Threads"): MP4 and guide rendering and encoding stay off the main thread. Files are
   written straight into the browser's private file system, so a long 4K export never has to fit in memory; the editor then
   hands them to the person. Called through Comlink. One export runs at a time. */

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

export interface GuideRequest {
  project: Project;
  plan: Pick<GuidePlan, 'stills' | 'segments'>;
  size: Size2;
  recording: Blob;
  assets: Array<[string, ImageBitmap]>;
}

export interface GuideResult {
  /** each rendered file by its path in the guide folder, read from the private file system */
  files: Array<[string, File]>;
  videoCodec: VideoCodec | null;
  cancelled?: true;
}

async function exportsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle('waypost', { create: true });
  return app.getDirectoryHandle('exports', { create: true });
}

/** Earlier exports were handed over already; clears them so they don't pile up. */
async function clearExports(dir: FileSystemDirectoryHandle, keep?: string): Promise<void> {
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
    if (name !== keep) await dir.removeEntry(name, { recursive: true }).catch(() => undefined);
  }
}

/** Writes a file at a path such as `seg/s_1.mp4` under a folder, making the folders on the way. */
async function writeAt(dir: FileSystemDirectoryHandle, path: string, data: Blob): Promise<File> {
  const parts = path.split('/');
  let folder = dir;
  for (const name of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(name, { create: true });
  const handle = await folder.getFileHandle(parts[parts.length - 1]!, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
  return handle.getFile();
}

const api = {
  async mp4(request: Mp4Request, onProgress: (done: number, total: number) => void): Promise<Omit<Mp4Result, 'bytes'> & { cancelled?: true }> {
    cancelled = false;
    const dir = await exportsDir();
    await clearExports(dir, request.file);
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

  /** Renders a guide's stills, poster and segments into waypost/exports/guide/ in the private file system. */
  async guide(request: GuideRequest, onProgress: (done: number, total: number) => void): Promise<GuideResult> {
    cancelled = false;
    const exports = await exportsDir();
    await clearExports(exports);
    const dir = await exports.getDirectoryHandle('guide', { create: true });
    const files: Array<[string, File]> = [];
    try {
      const { videoCodec } = await renderGuideMedia({
        project: request.project,
        plan: request.plan,
        size: request.size,
        recording: request.recording,
        assets: new Map(request.assets),
        save: async (path, data) => void files.push([path, await writeAt(dir, path, data)]),
        onProgress,
        cancelled: () => cancelled,
      });
      return { files, videoCodec };
    } catch (error) {
      await clearExports(exports);
      if (error instanceof ExportCancelled) return { files: [], videoCodec: null, cancelled: true };
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
