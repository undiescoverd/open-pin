import { formatTimecode, type Step } from '@waypost/core';
import type { ExportJob, PdfPage, StillFormat } from '@waypost/export';
import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff?url';
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url';
import { downloadBlob } from '../storage/waypost-file';
import { getEditor, notify, patchEditor, selectProject, sourceTimeAt, stepAtPlayhead } from './store';

/* The exporters (pdf-lib and its font engine are big) load the first time someone exports, not with the editor. */
const exporters = () => import('@waypost/export');

/* The Export menu: PDF, screenshots, and copying or saving the frame on screen. All of them draw with @waypost/render, the same
   code as the canvas, from full-size frames decoded in the media worker. */

function jobFor(): ExportJob | null {
  const state = getEditor();
  const project = selectProject(state);
  const media = state.media;
  if (!project || !media) return null;
  return {
    project,
    frameFor: (step: Step) => media.frame(media.index.indexAt(step.anchor.time)),
    assets: state.assetImages,
    onProgress: (done, total) => patchEditor({ busy: `Exporting step ${Math.min(done + 1, total)} of ${total}…` }),
  };
}

async function guarded(label: string, work: (job: ExportJob) => Promise<void>): Promise<void> {
  const job = jobFor();
  if (!job) return;
  if (job.project.steps.length === 0) {
    notify('Pin at least one step first (P), then export.', 'error');
    return;
  }
  patchEditor({ busy: label });
  try {
    await work(job);
  } catch (error) {
    const { ExportCancelled } = await exporters();
    if (!(error instanceof ExportCancelled)) notify(error instanceof Error ? error.message : "Couldn't export.", 'error');
  } finally {
    patchEditor({ busy: null });
  }
}

export function exportScreenshots(format: StillFormat): Promise<void> {
  return guarded('Exporting screenshots…', async job => {
    const { exportStills } = await exporters();
    const { blob, name, count } = await exportStills(job, format);
    downloadBlob(blob, name);
    notify(`Exported ${count} screenshot${count === 1 ? '' : 's'}.`);
  });
}

async function fontBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load the font for the PDF.");
  return response.arrayBuffer();
}

export function exportPdfGuide(page: PdfPage): Promise<void> {
  return guarded('Exporting PDF…', async job => {
    const [{ exportPdf }, regular, semibold] = await Promise.all([exporters(), fontBytes(figtree400), fontBytes(figtree600)]);
    const { blob, name, count } = await exportPdf(job, { page, fonts: { regular, semibold } });
    downloadBlob(blob, name);
    notify(`Exported a ${count}-page PDF.`);
  });
}

/** The frame on screen as an image, with its annotations if it is a pinned step. */
async function currentFrameBlob(): Promise<{ blob: Blob; name: string } | null> {
  const state = getEditor();
  const project = selectProject(state);
  const media = state.media;
  if (!project || !media) return null;
  const step = stepAtPlayhead(project, state.playhead);
  const time = sourceTimeAt(project, state.playhead);
  const shown: Step = step ?? { id: 'frame', anchor: { source: project.sources[0]!.id, time }, title: '', body: '', minHold: 2.5, zoom: null, annotations: [] };
  const { renderStep, canvasToBlob, safeFileName } = await exporters();
  const canvas = await renderStep({ project, frameFor: () => media.frame(media.index.indexAt(shown.anchor.time)), assets: state.assetImages }, shown);
  return { blob: await canvasToBlob(canvas, 'image/png'), name: `${safeFileName(project.name)} ${formatTimecode(time).replace(':', '-')}.png` };
}

export async function copyFrame(): Promise<void> {
  try {
    const frame = await currentFrameBlob();
    if (!frame) return;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': frame.blob })]);
    notify('Copied the frame.');
  } catch {
    notify("Couldn't copy to the clipboard. Use Save frame instead.", 'error');
  }
}

export async function saveFrame(): Promise<void> {
  try {
    const frame = await currentFrameBlob();
    if (!frame) return;
    downloadBlob(frame.blob, frame.name);
    notify('Saved the frame.');
  } catch {
    notify("Couldn't save the frame.", 'error');
  }
}
