import type { Project, Step } from '@waypost/core';
import { composeFrame, loadRenderFonts } from '@waypost/render';
import { zipSync } from 'fflate';
import { safeFileName, stepSlug } from './names';

/* Screenshots: each pinned step as an image, drawn by the same renderer as the editor canvas, so what you see is what you get. */

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

export interface ExportJob {
  project: Project;
  /** the exact recording frame for a step, at full size; the exporter closes it */
  frameFor: (step: Step) => Promise<ImageBitmap>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export type StillFormat = 'png' | 'webp';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality));
}

/** The step's frame with its annotations, at the recording's full size (or `maxWidth`, keeping the shape). */
export async function renderStep(job: ExportJob, step: Step, maxWidth?: number): Promise<AnyCanvas> {
  await loadRenderFonts();
  const bitmap = await job.frameFor(step);
  try {
    const scale = maxWidth && bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    const canvas = makeCanvas(width, height);
    composeFrame(canvas.getContext('2d') as CanvasRenderingContext2D, bitmap, width, height, { annotations: step.annotations });
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelled();
}

/** One image per step, zipped. The images are already compressed, so the zip only stores them. */
export async function exportStills(job: ExportJob, format: StillFormat): Promise<{ blob: Blob; name: string; count: number }> {
  const { project } = job;
  const files: Record<string, Uint8Array> = {};
  const mime = format === 'png' ? 'image/png' : 'image/webp';
  for (const [i, step] of project.steps.entries()) {
    throwIfCancelled(job.signal);
    job.onProgress?.(i, project.steps.length);
    const canvas = await renderStep(job, step);
    const blob = await canvasToBlob(canvas, mime, format === 'webp' ? 0.92 : undefined);
    files[`${stepSlug(step, i, project.steps.length)}.${format}`] = new Uint8Array(await blob.arrayBuffer());
  }
  job.onProgress?.(project.steps.length, project.steps.length);
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level: 0 }]])));
  return {
    blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    name: `${safeFileName(project.name)} screenshots.zip`,
    count: project.steps.length,
  };
}
