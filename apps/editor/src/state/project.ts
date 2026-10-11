import { commands, createHistory, createProject, newId, type Project } from '@waypost/core';
import { MediaUnsupportedError, type MediaHandle } from '@waypost/media';
import { mediaClient } from '../engine/session';
import { entryFor, getEntry, lastProjectId, listProjects, putEntry, rememberLastProject, removeEntry, timelineViewFor, type LibraryEntry } from '../storage/library';
import { assetPath, deleteProjectFiles, loadProject, readSource, requestPersistence, saveProject, sourcePath, writeSource } from '../storage/opfs';
import { openWaypostFile, saveWaypostFile } from '../storage/waypost-file';
import { getEditor, notify, patchEditor, resetEditor, run, selectProject, setAssetImage, useEditor } from './store';

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
    try {
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } catch {
    return undefined;
  }
}

/** Puts a project on screen: opens its recording from OPFS and starts from the first step or frame. */
async function present(project: Project): Promise<void> {
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording.');
  /* an edit still waiting for autosave goes to disk first, so it can't land on top of the project being opened; if it can't,
     the current project stays open with its changes */
  if (!(await flushSave())) throw new Error("Your last changes to the open guide couldn't be saved, so it stays open. Try again, or save a project file.");
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
  void loadAssetImages(project);
}

/** Decodes the project's logo and background images, so the canvas and exports can draw them. */
async function loadAssetImages(project: Project): Promise<void> {
  for (const asset of project.assets) {
    try {
      const image = await createImageBitmap(await readSource(project.id, asset.file));
      if (selectProject(getEditor())?.id === project.id) setAssetImage(asset.id, image);
      else image.close();
    } catch {
      /* a missing or unreadable image is left out; the guide still works without it */
    }
  }
}

const IMAGE_TYPES = /^image\/(png|jpeg|webp|svg\+xml|gif|avif)$/;

/** Adds a logo or background image to the open project: copied into its folder, decoded, and put to use in one undo step. */
export async function addImage(file: File, use: 'logo' | 'background'): Promise<void> {
  const project = selectProject(getEditor());
  if (!project) return;
  if (!IMAGE_TYPES.test(file.type)) {
    notify('Choose a PNG, JPEG, WebP, SVG or GIF image.', 'error');
    return;
  }
  try {
    const id = newId('img');
    const path = assetPath(id, file.name);
    const image = await createImageBitmap(file);
    await writeSource(project.id, path, file);
    setAssetImage(id, image);
    const asset = { id, file: path, name: file.name, type: file.type, size: [Math.max(1, image.width), Math.max(1, image.height)] as [number, number] };
    const logo = use === 'logo' ? { asset: id, corner: project.logo?.corner ?? 'br', size: project.logo?.size ?? 0.1, margin: project.logo?.margin ?? 0.03, opacity: project.logo?.opacity ?? 0.9 } : undefined;
    run(commands.addAsset(asset, use === 'logo' ? { logo } : { background: true }, Date.now()));
  } catch {
    notify("Couldn't read that image.", 'error');
  }
}

function resetStateFor(project: Project) {
  resetEditor();
  /* a new project starts on the canvas, so its look can be chosen first; one with steps opens on the Inspector */
  return { history: createHistory(project), selection: null, save: 'saved' as const, timelineView: timelineViewFor(project.id), rightTab: project.steps.length ? ('selection' as const) : ('canvas' as const) };
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

/** Starts a new project from a recording the person dropped, chose or recorded. Returns it, or null if it couldn't be opened. */
export async function importRecording(file: File, options: { quiet?: boolean } = {}): Promise<Project | null> {
  if (!isRecording(file)) {
    notify("That doesn't look like a video. Choose an MP4, MOV, WebM or MKV recording.", 'error');
    return null;
  }
  patchEditor({ busy: 'Reading the recording…' });
  let id: string | undefined;
  try {
    const probe = await mediaClient().open(file);
    const info = probe.info;
    probe.close();
    patchEditor({ busy: 'Saving it in this browser…' });
    await requestPersistence();
    id = newId('p');
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
    if (!options.quiet) notify('Recording ready. Press P, then click the frame where viewers should click.');
    return project;
  } catch (error) {
    patchEditor({ busy: null });
    if (id) await discardUnopened(id);
    notify(describe(error, "Couldn't open that recording."), 'error');
    return null;
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
  const id = newId('p');
  try {
    const project = await openWaypostFile(file, id);
    await present(project);
    const media = getEditor().media;
    await putEntry(entryFor(project, media ? await thumbnailOf(media) : undefined));
    notify(`Opened ${project.name}. It's now a copy in this browser.`);
  } catch (error) {
    patchEditor({ busy: null });
    await discardUnopened(id);
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

/** Removes the folder of a project that failed before it opened, so a half-copied recording doesn't fill the storage unseen. */
async function discardUnopened(id: string): Promise<void> {
  /* the project may already be on screen (a failed save after it opened), so it is closed as well */
  if (selectProject(getEditor())?.id === id) {
    await deleteProject(id).catch(() => undefined);
    return;
  }
  await deleteProjectFiles(id).catch(() => undefined);
}

/** Drops the autosave still waiting for this project, so it can't bring the folder and list entry back. */
function dropPending(id: string): void {
  if (pending?.id !== id) return;
  clearTimeout(timer);
  pending = null;
}

export async function deleteProject(id: string): Promise<void> {
  dropPending(id);
  await writing;
  /* a write that was in flight may have failed and put the change back: drop it again before the files go */
  dropPending(id);
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
let writing: Promise<boolean> = Promise.resolve(true);

/** Resolves true when the project is on disk. A failure keeps the change pending, so the next flush tries it again. */
async function write(project: Project): Promise<boolean> {
  const current = () => selectProject(getEditor())?.id === project.id;
  if (current()) patchEditor({ save: 'saving' });
  try {
    await saveProject(project);
    const previous = await getEntry(project.id);
    await putEntry(entryFor(project, previous?.thumb));
    if (current()) patchEditor({ save: 'saved' });
    return true;
  } catch {
    pending ??= project;
    patchEditor({ save: 'error' });
    notify("Couldn't save to this browser's storage. Keep a copy with Save project file.", 'error');
    return false;
  }
}

/** Writes any change not yet on disk. Called on tab hide and before saving a file. */
export function flushSave(): Promise<boolean> {
  clearTimeout(timer);
  const project = pending;
  pending = null;
  if (project) writing = writing.then(() => write(project));
  /* with nothing to write, the answer is whether an earlier write failed and its change is still waiting */
  return project ? writing : writing.then(() => pending === null);
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
