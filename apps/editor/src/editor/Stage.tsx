import { Button, Icon, KeyCap, cx } from '@waypost/ui';
import { Film, Loader2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { checkSupport } from '../engine/support';
import { openFile } from '../state/project';
import { useEditor } from '../state/store';
import { CanvasView } from './CanvasView';
import { Dock } from './Dock';

/* The canvas column. Its top edge is the top edge of the Steps and Inspector panels, so the frame gets all the height there is.
   With no recording open the frame is the drop zone. The tools sit in the dock under the frame (Dock). */
export function Stage() {
  const phase = useEditor(s => s.phase);
  const busy = useEditor(s => s.busy);

  return (
    <main className="flex min-h-0 min-w-0 flex-col [grid-area:stage]" aria-label="Canvas">
      {phase === 'ready' ? (
        <Workspace />
      ) : (
        <>
          <DropZone loading={phase === 'loading'} />
          {/* the tools wait for a recording, in the same place */}
          <div className="mt-2 shrink-0">
            <Dock />
          </div>
        </>
      )}
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

/** A short status or error from the last action, announced to screen readers. */
function MessageLine() {
  const message = useEditor(s => s.message);
  return (
    <p role="status" aria-live="polite" className={cx('m-0 min-h-5 text-sm', message?.tone === 'error' ? 'text-danger' : 'text-fg-muted')}>
      {message?.text}
    </p>
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

function BusyOverlay({ text }: { text: string }) {
  return (
    <div role="alert" aria-live="assertive" className="fixed inset-0 z-30 grid place-items-center bg-scrim">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-5 py-4 text-md text-fg shadow-pop">
        <Icon icon={Loader2} size={20} className="animate-spin" />
        {text}
      </div>
    </div>
  );
}

const ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.waypost';

const support = checkSupport();

function DropZone({ loading }: { loading: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  };
  return (
    <section
      aria-labelledby="drop-heading"
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cx(
        'flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        over ? 'border-sel bg-sel-tint' : 'border-line-strong bg-panel/60',
      )}
    >
      <span className="grid size-12 place-items-center rounded-pill bg-pin-tint text-pin">
        <Icon icon={loading ? Loader2 : Film} size={20} className={loading ? 'animate-spin' : undefined} />
      </span>
      <h1 id="drop-heading" className="m-0 font-brand text-xl font-semibold text-fg">
        {loading ? 'Opening your project…' : 'Drop a screen recording'}
      </h1>
      <p className="m-0 text-fg-muted">MP4, MOV, WebM or MKV, from QuickTime, Loom, OBS or any other recorder.</p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="file-input"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openFile(file);
        }}
      />
      <Button variant="primary" size="lg" disabled={loading} onClick={() => input.current?.click()}>
        Choose a recording…
      </Button>
      {!support.ok && (
        <p role="note" className="m-0 max-w-md rounded-md border border-line-strong bg-raised px-3 py-2 text-fg">
          This browser can't open recordings in the editor (it lacks {support.missing.join(' and ')}). Use Chrome, Edge, Brave or Arc on a computer. Guides you publish play in any browser.
        </p>
      )}
      <ol className="m-0 mt-2 flex list-none flex-wrap justify-center gap-x-6 gap-y-1 p-0 text-fg-muted">
        <li>
          1. Pin the moments that matter <KeyCap keys={['p']} />
        </li>
        <li>2. Point things out</li>
        <li>3. Share</li>
      </ol>
      <p className="m-0 text-sm text-fg-muted">Your recording stays in this browser. Nothing is uploaded.</p>
      <MessageLine />
    </section>
  );
}
