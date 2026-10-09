import { useEffect, useState } from 'react';
import { Inspector } from './Inspector';
import { isTyping } from './keyboard';
import { Stage } from './Stage';
import { StepRail } from './StepRail';
import { Timeline } from './Timeline';
import { TOOLS, type ToolId } from './tools';
import { TopBar } from './TopBar';

/* Steps rail | canvas | inspector, over a full-width timeline (docs/03-design-system.md, "Editor layout").
   Phase 0 draws the panes empty; only tools, snapping, ripple and the theme respond. */
export function EditorShell() {
  const [tool, setTool] = useState<ToolId>('select');
  const [snap, setSnap] = useState(true);
  const [ripple, setRipple] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase(); /* by lowercase key, so shortcuts also work with Caps Lock on */
      if (e.shiftKey) {
        if (key === 'r') {
          e.preventDefault();
          setRipple(r => !r);
        }
        return;
      }
      if (key === 'n') {
        e.preventDefault();
        setSnap(s => !s);
        return;
      }
      const t = TOOLS.find(x => x.key === key);
      if (t) {
        e.preventDefault();
        setTool(t.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="grid h-full min-h-[640px] min-w-[960px] gap-3 px-4 py-3 [grid-template-areas:'top_top_top'_'steps_stage_insp'_'tl_tl_tl'] grid-cols-[264px_minmax(0,1fr)_304px] grid-rows-[auto_minmax(0,1fr)_auto]"
    >
      <TopBar />
      <StepRail />
      <Stage tool={tool} onTool={setTool} />
      <Inspector />
      <Timeline snap={snap} ripple={ripple} onToggleSnap={() => setSnap(s => !s)} onToggleRipple={() => setRipple(r => !r)} />
    </div>
  );
}
