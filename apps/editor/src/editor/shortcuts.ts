import { useEffect } from 'react';
import { currentPlayback } from '../engine/session';
import { saveWaypost } from '../state/project';
import {
  clearSelection,
  deleteSelection,
  escapeSelection,
  getEditor,
  jumpSeconds,
  jumpStep,
  jumpToEnd,
  jumpToStart,
  notify,
  pinAtPlayhead,
  redo,
  selectProject,
  seekTimeline,
  setTool,
  stepFrames,
  timelineTimeOf,
  toggleMuted,
  toggleRipple,
  toggleSnap,
  totalDuration,
  undo,
  zoomBy,
  ZOOM_FACTOR,
} from '../state/store';
import { isTyping } from './keyboard';
import { TOOLS } from './tools';

/** The next or previous edit: for now, a pin or an end of the guide (cuts, blur and audio join in later phases). */
function jumpEdit(direction: 1 | -1): void {
  const state = getEditor();
  const project = selectProject(state);
  if (!project) return;
  const stops = [0, ...project.steps.map(s => timelineTimeOf(project, s)), totalDuration(project)].sort((a, b) => a - b);
  const frame = 0.5 / (state.media?.info.fps ?? 30);
  const target = direction > 0 ? stops.find(t => t > state.playhead + frame) : [...stops].reverse().find(t => t < state.playhead - frame);
  if (target !== undefined) seekTimeline(target);
}

/** Keys that keep working while a slider or checkbox has focus. */
const TRANSPORT_KEYS = new Set(['j', 'k', 'l', '=', '+', '-']);

/**
 * Editor shortcuts (docs/05-editor-interactions.md, section 9). None fire while a dialog is open or while typing in a text field.
 * While another form control has focus only the transport keys work, so they keep working after dragging an Inspector slider.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || e.isComposing) return;
      const target = e.target;
      if (isTyping(target)) return;
      const key = e.key.toLowerCase(); /* by lowercase key, so shortcuts also work with Caps Lock on */
      const mod = e.metaKey || e.ctrlKey;
      const el = target instanceof HTMLElement ? target : null;
      if (el instanceof HTMLButtonElement && (key === ' ' || key === 'enter')) return; /* the button gets its own press */
      if (el?.getAttribute('role') === 'tab' && key.startsWith('arrow')) return; /* tabs use the arrows to move between tabs */
      /* a slider or checkbox with focus: only the transport keys still work, so they keep working after dragging a slider */
      if (el instanceof HTMLInputElement && !TRANSPORT_KEYS.has(key)) return;
      const playback = currentPlayback();
      const act = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (mod) {
        if (key === 'z') return act(e.shiftKey ? redo : undo);
        if (key === 's') return act(() => void saveWaypost());
        if (key === ',') return act(() => jumpToStart(true));
        if (key === '.') return act(jumpToEnd);
        return;
      }
      if (e.altKey) {
        if (key === 'arrowleft') return act(() => jumpStep(-1));
        if (key === 'arrowright') return act(() => jumpStep(1));
        return;
      }
      if (e.shiftKey) {
        if (key === 'arrowleft') return act(() => jumpSeconds(-1));
        if (key === 'arrowright') return act(() => jumpSeconds(1));
        if (key === 'j') return act(() => jumpEdit(-1));
        if (key === 'l') return act(() => jumpEdit(1));
        if (key === 'p') return act(() => void pinAtPlayhead());
        if (key === 'r') return act(toggleRipple);
        if (key === '+') return act(() => zoomBy(ZOOM_FACTOR));
        return;
      }
      if (key === ' ' || key === 'k') return e.repeat ? e.preventDefault() : act(() => playback?.toggle());
      if (key === 'l') return e.repeat ? e.preventDefault() : act(() => playback?.shuttle(1));
      if (key === 'j') return e.repeat ? e.preventDefault() : act(() => playback?.shuttle(-1));
      if (key === 'arrowleft') return act(() => stepFrames(-1));
      if (key === 'arrowright') return act(() => stepFrames(1));
      if (key === '=' || key === '+') return act(() => zoomBy(ZOOM_FACTOR));
      if (key === '-') return act(() => zoomBy(1 / ZOOM_FACTOR));
      if (key === 'n') return act(toggleSnap);
      if (key === 'm') return act(toggleMuted);
      if (key === 'delete' || key === 'backspace') {
        if (getEditor().selection) return act(deleteSelection);
        return;
      }
      if (key === 'escape') {
        return act(() => {
          const state = getEditor();
          if (state.tool !== 'select') setTool('select');
          else if (state.playback.stoppedAt && playback) playback.seek(playback.time);
          else if (state.selection) escapeSelection();
          else clearSelection();
        });
      }
      const tool = TOOLS.find(t => t.key === key);
      if (tool && getEditor().phase === 'ready') {
        if (tool.soon) return act(() => notify(`${tool.label}: ${tool.soon!.toLowerCase()}.`));
        return act(() => setTool(tool.id));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
