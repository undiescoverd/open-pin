import * as Comlink from 'comlink';
import type { ExportWorkerApi, GuideRequest, Mp4Request } from './worker';

/* Starts the export worker on first use. One worker serves every export; one export runs at a time. */

let worker: Comlink.Remote<ExportWorkerApi> | null = null;

function exportWorker(): Comlink.Remote<ExportWorkerApi> {
  worker ??= Comlink.wrap<ExportWorkerApi>(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  return worker;
}

/** Renders the MP4 in the worker into the private file system. Images in `assets` are transferred, so pass copies. */
export function renderMp4(request: Mp4Request, onProgress: (done: number, total: number) => void) {
  return exportWorker().mp4(Comlink.transfer(request, request.assets.map(([, image]) => image)), Comlink.proxy(onProgress));
}

/** Renders a guide's media in the worker into the private file system. Images in `assets` are transferred, so pass copies. */
export function renderGuide(request: GuideRequest, onProgress: (done: number, total: number) => void) {
  return exportWorker().guide(Comlink.transfer(request, request.assets.map(([, image]) => image)), Comlink.proxy(onProgress));
}

/** Stops the export running in the worker (MP4 or guide). */
export function cancelExport(): void {
  void worker?.cancel();
}

/** The finished file, from the private file system. */
export async function exportedFile(name: string): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const dir = await (await root.getDirectoryHandle('waypost')).getDirectoryHandle('exports');
  return (await dir.getFileHandle(name)).getFile();
}
