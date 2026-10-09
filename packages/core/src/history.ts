import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';

enablePatches();

/* Undo and redo from Immer patches (docs/02-architecture.md, "State, commands and undo"). Every edit is a named command; its inverse
   patches go on the undo stack, which gives exact undo for every edit and a label for the menu ("Undo Move step"). */

export const HISTORY_LIMIT = 80;

export interface Command<T> {
  /** shown as "Undo <label>" */
  label: string;
  /** edits made in the same editing session share a key, so typing a title is one undo step, not one per letter */
  coalesceKey?: string;
  run: (draft: Draft<T>) => void;
}

interface Entry {
  label: string;
  coalesceKey: string | undefined;
  patches: Patch[];
  inverse: Patch[];
}

export interface History<T> {
  readonly present: T;
  readonly past: readonly Entry[];
  readonly future: readonly Entry[];
}

export function createHistory<T>(present: T): History<T> {
  return { present, past: [], future: [] };
}

/** Runs a command. A command that changes nothing leaves the history untouched, so no empty undo step appears. */
export function apply<T>(history: History<T>, command: Command<T>): History<T> {
  const [next, patches, inverse] = produceWithPatches(history.present, command.run);
  if (patches.length === 0) return history;
  const top = history.past[history.past.length - 1];
  const merge = command.coalesceKey !== undefined && top?.coalesceKey === command.coalesceKey && history.future.length === 0;
  const entry: Entry = merge
    ? { label: top.label, coalesceKey: top.coalesceKey, patches: [...top.patches, ...patches], inverse: [...inverse, ...top.inverse] }
    : { label: command.label, coalesceKey: command.coalesceKey, patches, inverse };
  const past = merge ? [...history.past.slice(0, -1), entry] : [...history.past, entry].slice(-HISTORY_LIMIT);
  return { present: next as T, past, future: [] };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}
export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}
export function undoLabel(history: History<unknown>): string | null {
  return history.past[history.past.length - 1]?.label ?? null;
}
export function redoLabel(history: History<unknown>): string | null {
  return history.future[history.future.length - 1]?.label ?? null;
}

export function undo<T>(history: History<T>): History<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return { present: applyPatches(history.present as object, entry.inverse) as T, past: history.past.slice(0, -1), future: [...history.future, entry] };
}

export function redo<T>(history: History<T>): History<T> {
  const entry = history.future[history.future.length - 1];
  if (!entry) return history;
  return { present: applyPatches(history.present as object, entry.patches) as T, past: [...history.past, entry], future: history.future.slice(0, -1) };
}
