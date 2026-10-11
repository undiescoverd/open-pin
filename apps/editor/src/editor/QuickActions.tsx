import { Button, Icon } from '@waypost/ui';
import { Highlighter, MessageSquare, ZoomIn } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { addToStep, dismissQuick, selectProject, stepAtPlayhead, useEditor } from '../state/store';
import type { AddKind } from './tools';

/* Right after a click marker drops (the Pin tool or the Click button), a small bar next to it offers the usual next moves, each
   placed around the click (docs/06-simplify-plan.md, "Quick actions after the Click tool"). It goes away as soon as anything else
   happens: an edit, a new selection, another tool, a click elsewhere or a key. */

const ACTIONS: ReadonlyArray<{ kind: AddKind; label: string; icon: typeof ZoomIn }> = [
  { kind: 'callout', label: 'Add callout', icon: MessageSquare },
  { kind: 'highlight', label: 'Highlight', icon: Highlighter },
  { kind: 'zoom', label: 'Zoom here', icon: ZoomIn },
];

export function QuickActions() {
  const quick = useEditor(s => s.quick);
  const project = useEditor(selectProject);
  const playhead = useEditor(s => s.playhead);
  const paused = useEditor(s => s.playback.rate === 0);
  const bar = useRef<HTMLDivElement>(null);
  /* only while the frame the pin went on is the one showing */
  const here = !!quick && !!project && paused && stepAtPlayhead(project, playhead)?.id === quick.stepId;

  useEffect(() => {
    if (!here) return;
    const away = (e: Event) => {
      if (!bar.current?.contains(e.target as Node)) dismissQuick();
    };
    const key = (e: KeyboardEvent) => {
      /* Tab reaches the buttons, and Enter or Space presses one; any other key moves on */
      if (e.key === 'Tab' || e.key === 'Shift' || (bar.current?.contains(e.target as Node) && (e.key === 'Enter' || e.key === ' '))) return;
      dismissQuick();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [here]);

  if (!here || !quick) return null;
  const [x, y] = quick.at;
  /* below and to the right of the marker, or above and to the left where there's no room */
  const style = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: `translate(${x > 0.6 ? 'calc(-100% - 22px)' : '22px'}, ${y > 0.75 ? 'calc(-100% - 10px)' : '10px'})`,
  };
  return (
    <div ref={bar} role="toolbar" aria-label="Next for this click" className="absolute z-10 flex items-center gap-1 rounded-md border border-line bg-panel p-1 shadow-pop" style={style}>
      {ACTIONS.map(a => (
        <Button key={a.kind} size="sm" variant="ghost" icon={<Icon icon={a.icon} size={14} />} onClick={() => addToStep(a.kind)}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}
