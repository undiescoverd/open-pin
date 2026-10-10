import { useEffect } from 'react';
import { openFile, restoreLastProject, startAutosave } from '../state/project';
import { Inspector } from './Inspector';
import { Mp4Dialog } from './Mp4Dialog';
import { PreviewDialog } from './PreviewDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { ShareDialog } from './ShareDialog';
import { Stage } from './Stage';
import { StepRail } from './StepRail';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';
import { useShortcuts } from './shortcuts';

/* Steps rail | canvas | inspector, over a full-width timeline (docs/03-design-system.md, "Editor layout"). */
export function EditorShell() {
  useShortcuts();

  useEffect(() => {
    const stop = startAutosave();
    void restoreLastProject();
    return stop;
  }, []);

  /* a recording or .waypost file dropped anywhere opens a new project */
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="grid h-full min-h-[640px] min-w-[960px] gap-3 px-4 py-3 [grid-template-areas:'top_top_top'_'steps_stage_insp'_'tl_tl_tl'] grid-cols-[264px_minmax(0,1fr)_304px] grid-rows-[auto_minmax(0,1fr)_auto]">
      <TopBar />
      <StepRail />
      <Stage />
      <Inspector />
      <Timeline />
      <ProjectsDialog />
      <Mp4Dialog />
      <ShareDialog />
      <PreviewDialog />
    </div>
  );
}
