import type { Project } from '@waypost/core';

/* The project list: a small IndexedDB table with what the Projects screen shows (name, dates, a thumbnail). The projects
   themselves are in OPFS (opfs.ts). */

export interface LibraryEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** seconds */
  duration: number;
  steps: number;
  sourceName: string;
  thumb?: Blob;
}

const DB = 'waypost';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<LibraryEntry[]> {
  const all = await run('readonly', s => s.getAll() as IDBRequest<LibraryEntry[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEntry(id: string): Promise<LibraryEntry | undefined> {
  return run('readonly', s => s.get(id) as IDBRequest<LibraryEntry | undefined>);
}

export async function putEntry(entry: LibraryEntry): Promise<void> {
  await run('readwrite', s => s.put(entry));
}

export async function removeEntry(id: string): Promise<void> {
  await run('readwrite', s => s.delete(id));
}

export function entryFor(project: Project, thumb?: Blob): LibraryEntry {
  const source = project.sources[0];
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    duration: source?.duration ?? 0,
    steps: project.steps.length,
    sourceName: source?.name ?? '',
    thumb,
  };
}

/** The project to reopen on launch. localStorage may be unavailable (private windows), which just means starting empty. */
const LAST_KEY = 'waypost.lastProject';
export function rememberLastProject(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}
export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
