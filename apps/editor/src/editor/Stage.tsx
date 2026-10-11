import { Button, Icon } from '@waypost/ui';
import { Loader2 } from 'lucide-react';
import { useEditor } from '../state/store';
import { CanvasView } from './CanvasView';
import { Dock } from './Dock';

/* The canvas column. Its top edge is the top edge of the Steps and Inspector panels, so the frame gets all the height there is.
   Under the frame is one line of status (Dock). Before there is a recording the first-run screen takes the whole window instead
   (FirstRun). */
export function Stage() {
  const busy = useEditor(s => s.busy);

  return (
    <main className="flex min-h-0 min-w-0 flex-col [grid-area:stage]" aria-label="Canvas">
      <Workspace />
      {busy && <BusyOverlay text={busy} />}
      <ExportOverlay />
    </main>
  );
}

function Workspace() {
  return (
    <CanvasView>
      <Dock />
    </CanvasView>
  );
}

/** A long export: what it is doing, how far along, and Cancel. */
function ExportOverlay() {
  const exporting = useEditor(s => s.exporting);
  if (!exporting) return null;
  const percent = Math.round(exporting.progress * 100);
  return (
    <div role="alertdialog" aria-modal="true" aria-label={exporting.label} className="fixed inset-0 z-30 grid place-items-center bg-scrim">
      <div className="flex w-[380px] flex-col gap-3 rounded-lg border border-line bg-panel px-5 py-4 text-fg shadow-pop">
        <div className="flex items-center gap-3 text-md">
          <Icon icon={Loader2} size={20} className="animate-spin" />
          {exporting.label}
          <span className="ml-auto font-mono text-sm tabular-nums text-fg-muted">{percent}%</span>
        </div>
        <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-pill bg-raised">
          <div className="h-full rounded-pill bg-sel transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-muted">{exporting.detail}</span>
          <Button size="sm" className="ml-auto" onClick={exporting.cancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BusyOverlay({ text }: { text: string }) {
  return (
    <div role="alert" aria-live="assertive" className="fixed inset-0 z-30 grid place-items-center bg-scrim">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-5 py-4 text-md text-fg shadow-pop">
        <Icon icon={Loader2} size={20} className="animate-spin" />
        {text}
      </div>
    </div>
  );
}
