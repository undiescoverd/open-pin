import { createHistory, createProject, newId, type Project } from '@waypost/core';
import { MediaUnsupportedError, type MediaHandle } from '@waypost/media';
import { mediaClient } from '../engine/session';
import { entryFor, getEntry, lastProjectId, listProjects, putEntry, rememberLastProject, removeEntry, type LibraryEntry } from '../storage/library';
import { deleteProjectFiles, loadProject, readSource, requestPersistence, saveProject, sourcePath, writeSource } from '../storage/opfs';
import { openWaypostFile, saveWaypostFile } from '../storage/waypost-file';
import { getEditor, notify, patchEditor, resetEditor, selectProject, useEditor } from './store';

/* Opening, importing, saving and deleting projects: the glue between the store, OPFS, the project list and the media worker. */

const RECORDING_TYPES = /\.(mp4|m4v|mov|webm|mkv)$/i;
const THUMB_WIDTH = 320;

let waypostHandle: FileSystemFileHandle | undefined;

/** Closes the open recording and frees its video URL. */
function releaseCurrent(): void {
  const { media, videoUrl } = getEditor();
  media?.close();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
}

async function thumbnailOf(media: MediaHandle): Promise<Blob | undefined> {
  try {
    const bitmap = await media.frame(0, THUMB_WIDTH);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } catch {
    return undefined;
  }
}

/** Puts a project on screen: opens its recording from OPFS and starts from the first step or frame. */
async function present(project: Project): Promise<void> {
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording.');
  const file = await readSource(project.id, source.file);
  const media = await mediaClient().open(file);
  releaseCurrent();
  waypostHandle = undefined;
  patchEditor({
    ...resetStateFor(project),
    media,
    videoUrl: URL.createObjectURL(file),
    playhead: 0,
    phase: 'ready',
    busy: null,
  });
  rememberLastProject(project.id);
}

function resetStateFor(project: Project) {
  resetEditor();
  return { history: createHistory(project), selection: null, save: 'saved' as const };
}

/** The text to show for a failure, in plain language. */
function describe(error: unknown, fallback: string): string {
  if (error instanceof MediaUnsupportedError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isRecording(file: File): boolean {
  return file.type.startsWith('video/') || RECORDING_TYPES.test(file.name);
}

/** Starts a new project from a recording the person dropped or chose. */
export async function importRecording(file: File): Promise<void> {
  if (!isRecording(file)) {
    notify("That doesn't look like a video. Choose an MP4, MOV, WebM or MKV recording.", 'error');
    return;
  }
  patchEditor({ busy: 'Reading the recording…' });
  try {
    const probe = await mediaClient().open(file);
    const info = probe.info;
    probe.close();
    patchEditor({ busy: 'Saving it in this browser…' });
    await requestPersistence();
    const id = newId('p');
    const sourceId = newId('src');
    const path = sourcePath(sourceId, file.name);
    await writeSource(id, path, file);
    const now = Date.now();
    const project = createProject({
      id,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 90) || 'Untitled guide',
      source: { id: sourceId, file: path, name: file.name, duration: info.duration, size: info.size, fps: info.fps },
      now,
    });
    await saveProject(project);
    await present(project);
    const media = getEditor().media;
    await putEntry(entryFor(project, media ? await thumbnailOf(media) : undefined));
    notify('Recording ready. Press P, then click the frame where viewers should click.');
  } catch (error) {
    patchEditor({ busy: null });
    notify(describe(error, "Couldn't open that recording."), 'error');
  }
}

/** Opens whatever the person chose: a recording starts a new project, a .waypost file opens as a copy. */
export async function openFile(file: File): Promise<void> {
  /* a .waypost file is a zip; a copy renamed by the browser ("Guide (1).waypost.zip") still starts with the zip signature */
  const zip = async () => new TextDecoder('latin1').decode(await file.slice(0, 4).arrayBuffer()) === 'PK\u0003\u0004';
  if (/\.waypost$/i.test(file.name) || (!isRecording(file) && (await zip()))) await openWaypost(file);
  else await importRecording(file);
}

export async function openProject(id: string): Promise<void> {
  patchEditor({ busy: 'Opening project…', projectsOpen: false });
  try {
    await present(await loadProject(id));
  } catch (error) {
    patchEditor({ busy: null });
    notify(describe(error, "Couldn't open that project. It may have been removed from this browser."), 'error');
  }
}

/** Reopens what was open last time, if it is still there. */
export async function restoreLastProject(): Promise<void> {
  const id = lastProjectId();
  if (!id || getEditor().phase !== 'empty') return;
  try {
    patchEditor({ phase: 'loading' });
    await present(await loadProject(id));
  } catch {
    rememberLastProject(null);
    patchEditor({ phase: 'empty', busy: null });
  }
}

export async function openWaypost(file: File): Promise<void> {
  patchEditor({ busy: 'Opening project file…', projectsOpen: false });
  try {
    const project = await openWaypostFile(file, newId('p'));
    await present(project);
    const media = getEditor().media;
    await putEntry(entryFor(project, media ? await thumbnailOf(media) : undefined));
    notify(`Opened ${project.name}. It's now a copy in this browser.`);
  } catch (error) {
    patchEditor({ busy: null });
    notify(describe(error, "That file isn't a Waypost project."), 'error');
  }
}

/** Saves the project as a `.waypost` file the person keeps. */
export async function saveWaypost(): Promise<void> {
  const project = selectProject(getEditor());
  if (!project) return;
  await flushSave();
  patchEditor({ busy: 'Saving project file…' });
  try {
    const result = await saveWaypostFile(project, waypostHandle);
    waypostHandle = result.handle ?? waypostHandle;
    patchEditor({ busy: null });
    if (result.saved) notify('Saved a .waypost file.');
  } catch (error) {
    patchEditor({ busy: null });
    notify(describe(error, "Couldn't save the project file."), 'error');
  }
}

export async function deleteProject(id: string): Promise<void> {
  if (selectProject(getEditor())?.id === id) {
    releaseCurrent();
    resetEditor();
    rememberLastProject(null);
  }
  await deleteProjectFiles(id);
  await removeEntry(id);
}

export async function projectList(): Promise<LibraryEntry[]> {
  return listProjects();
}

export function closeProject(): void {
  releaseCurrent();
  resetEditor();
  rememberLastProject(null);
}

// ----- autosave -------------------------------------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Project | null = null;
let writing: Promise<void> = Promise.resolve();

async function write(project: Project): Promise<void> {
  patchEditor({ save: 'saving' });
  try {
    await saveProject(project);
    const previous = await getEntry(project.id);
    await putEntry(entryFor(project, previous?.thumb));
    if (selectProject(getEditor())?.id === project.id) patchEditor({ save: 'saved' });
  } catch {
    patchEditor({ save: 'error' });
    notify("Couldn't save to this browser's storage. Keep a copy with Save project file.", 'error');
  }
}

/** Writes any change not yet on disk. Called on tab hide and before saving a file. */
export function flushSave(): Promise<void> {
  clearTimeout(timer);
  const project = pending;
  pending = null;
  if (project) writing = writing.then(() => write(project));
  return writing;
}

/** Saves a moment after each change, so typing doesn't write on every key. */
export function startAutosave(): () => void {
  const unsubscribe = useEditor.subscribe((state, prev) => {
    const now = state.history?.present;
    const before = prev.history?.present;
    if (!now || !before || now === before || now.id !== before.id) return;
    pending = now;
    patchEditor({ save: 'saving' });
    clearTimeout(timer);
    timer = setTimeout(() => void flushSave(), 400);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}
