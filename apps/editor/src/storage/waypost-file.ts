import { parseProject, type Project } from '@waypost/core';
import { Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipPassThrough } from 'fflate';
import { openSourceWriter, readSource, saveProject } from './opfs';

/* `.waypost` files: a zip of the project folder (docs/02-architecture.md). The recording is stored, not compressed, since video
   doesn't shrink; everything streams, so a multi-gigabyte recording never has to fit in memory. */

export const WAYPOST_TYPE: FilePickerAcceptType = { description: 'Waypost project', accept: { 'application/zip': ['.waypost'] } };

/** Streams `project.json` and the recording into `sink`. */
async function zipProject(project: Project, sink: (chunk: Uint8Array) => Promise<void>): Promise<void> {
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording to save.');
  const file = await readSource(project.id, source.file);
  let queue: Promise<void> = Promise.resolve();
  let failure: unknown;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else queue = queue.then(() => sink(chunk));
  });
  const json = new ZipPassThrough('project.json');
  zip.add(json);
  json.push(new TextEncoder().encode(JSON.stringify(project, null, 2)), true);
  const entry = new ZipPassThrough(source.file);
  zip.add(entry);
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    entry.push(value, false);
    await queue; /* wait for the sink, so a slow disk can't pile up chunks in memory */
    if (failure) throw failure;
  }
  entry.push(new Uint8Array(0), true);
  zip.end();
  await queue;
  if (failure) throw failure;
}

export interface SaveResult {
  /** kept so later saves go to the same file without asking again (Chromium only) */
  handle?: FileSystemFileHandle;
  /** false when the person closed the picker */
  saved: boolean;
}

export async function saveWaypostFile(project: Project, existing?: FileSystemFileHandle): Promise<SaveResult> {
  const suggestedName = `${project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled guide'}.waypost`;
  if (window.showSaveFilePicker) {
    let handle = existing;
    if (!handle) {
      try {
        handle = await window.showSaveFilePicker({ suggestedName, types: [WAYPOST_TYPE] });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return { saved: false };
        throw error;
      }
    }
    const writable = await handle.createWritable();
    try {
      await zipProject(project, chunk => writable.write(chunk as Uint8Array<ArrayBuffer>));
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return { handle, saved: true };
  }
  /* other browsers: gather the zip and download it */
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await zipProject(project, async chunk => void parts.push(chunk as Uint8Array<ArrayBuffer>));
  downloadBlob(new Blob(parts, { type: 'application/zip' }), suggestedName);
  return { saved: true };
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Unpacks a `.waypost` file into a new project folder with a fresh id, so opening a file never overwrites another project. */
export async function openWaypostFile(file: Blob, newId: string): Promise<Project> {
  let json: Uint8Array[] = [];
  let failure: unknown;
  const writes: Promise<void>[] = [];
  let drain: Promise<void> = Promise.resolve(); /* the latest write, awaited between reads so a slow disk can't pile up chunks */
  const unzip = new Unzip();
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  unzip.onfile = entry => {
    const isJson = entry.name === 'project.json';
    const isSource = entry.name.startsWith('sources/') && !entry.name.includes('..') && !entry.name.endsWith('/');
    if (!isJson && !isSource) return;
    if (isJson) {
      json = [];
      entry.ondata = (error, chunk) => {
        if (error) failure = error;
        else json.push(chunk);
      };
    } else {
      /* stream the recording into OPFS as it is unzipped; each chunk waits for the one before it */
      const writer = openSourceWriter(newId, entry.name);
      let queue: Promise<void> = writer.then(() => undefined);
      const finished = Promise.withResolvers<void>();
      writes.push(finished.promise);
      entry.ondata = (error, chunk, final) => {
        if (error) {
          failure = error;
          finished.resolve();
          return;
        }
        queue = queue.then(async () => {
          const w = await writer;
          await w.write(chunk as Uint8Array<ArrayBuffer>);
          if (final) await w.close();
        });
        drain = queue;
        if (final) queue.then(finished.resolve, finished.reject);
      };
    }
    entry.start();
  };
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    unzip.push(value, false);
    await drain;
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  await Promise.all(writes);
  if (failure) throw failure;
  if (json.length === 0) throw new Error("This file doesn't contain a Waypost project.");
  const bytes = new Uint8Array(json.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of json) {
    bytes.set(c, offset);
    offset += c.length;
  }
  const parsed = parseProject(JSON.parse(new TextDecoder().decode(bytes)));
  const project: Project = { ...parsed, id: newId };
  await saveProject(project);
  return project;
}
