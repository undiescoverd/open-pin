import { parseProject, type Project } from '@waypost/core';

/* Projects live in the browser's private file system (OPFS), one folder each (docs/02-architecture.md, "Storage"):

     waypost/projects/<id>/project.json
     waypost/projects/<id>/sources/<file>
     waypost/projects/<id>/assets/<file>     logo and background images

   It is fast, large, and private to this app's origin. */

async function projectsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle('waypost', { create: true });
  return app.getDirectoryHandle('projects', { create: true });
}

async function projectDir(id: string, create = false): Promise<FileSystemDirectoryHandle> {
  return (await projectsRoot()).getDirectoryHandle(id, { create });
}

/** Writes through a temporary swap file, so a crash mid-write leaves the previous version intact. */
async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function saveProject(project: Project): Promise<void> {
  await writeFile(await projectDir(project.id, true), 'project.json', JSON.stringify(project, null, 2));
}

export async function loadProject(id: string): Promise<Project> {
  const dir = await projectDir(id);
  const file = await (await dir.getFileHandle('project.json')).getFile();
  return parseProject(JSON.parse(await file.text()));
}

/** A safe file name for the source: `<sourceId>.<extension>` under `sources/`. */
export function sourcePath(sourceId: string, originalName: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(originalName)?.[1]?.toLowerCase() ?? 'bin';
  return `sources/${sourceId}.${ext}`;
}

/** The folders a project file may live in. */
const FOLDERS = new Set(['sources', 'assets']);

function splitPath(path: string): [string, string] {
  const [folder, name, ...rest] = path.split('/');
  if (!folder || !name || rest.length || !FOLDERS.has(folder) || name === '..' || name === '.') throw new Error(`Not a project file: ${path}`);
  return [folder, name];
}

/** Opens a writer for a file inside the project folder (`sources/…` or `assets/…`). */
export async function openSourceWriter(projectId: string, path: string): Promise<FileSystemWritableFileStream> {
  const [folderName, name] = splitPath(path);
  const dir = await projectDir(projectId, true);
  const folder = await dir.getDirectoryHandle(folderName, { create: true });
  const handle = await folder.getFileHandle(name, { create: true });
  return handle.createWritable();
}

/** Streams a file into the project folder without holding it in memory. */
export async function writeSource(projectId: string, path: string, data: Blob): Promise<void> {
  const writable = await openSourceWriter(projectId, path);
  try {
    await data.stream().pipeTo(writable);
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

/** Reads a file of the project folder (`sources/…` or `assets/…`). */
export async function readSource(projectId: string, path: string): Promise<File> {
  const [folderName, name] = splitPath(path);
  const dir = await projectDir(projectId);
  const folder = await dir.getDirectoryHandle(folderName);
  return (await folder.getFileHandle(name)).getFile();
}

/** A safe file name for an image: `assets/<assetId>.<extension>`. */
export function assetPath(assetId: string, originalName: string): string {
  return sourcePath(assetId, originalName).replace(/^sources\//, 'assets/');
}

export async function deleteProjectFiles(id: string): Promise<void> {
  try {
    await (await projectsRoot()).removeEntry(id, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

/** Asks the browser not to evict the projects when disk space runs low. Harmless to repeat. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* a refusal is fine; the UI already warns that projects live in this browser */
  }
}
