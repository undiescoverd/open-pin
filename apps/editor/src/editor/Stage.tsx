import { Button, Icon, IconButton, KeyCap, Segmented, Surface, cx } from '@waypost/ui';
import { Film, Loader2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { currentPlayback } from '../engine/session';
import { checkSupport } from '../engine/support';
import { openFile } from '../state/project';
import { selectProject, setTool, setView, useEditor } from '../state/store';
import { CanvasView } from './CanvasView';
import { TOOLS } from './tools';

/* The canvas column: the floating tool palette over the frame. With no recording open the frame is the drop zone. */
export function Stage() {
  const tool = useEditor(s => s.tool);
  const phase = useEditor(s => s.phase);
  const busy = useEditor(s => s.busy);
  const view = useEditor(s => s.view);

  return (
    <main className="flex min-h-0 min-w-0 flex-col items-center gap-3 [grid-area:stage]" aria-label="Canvas">
      <div className="flex max-w-full items-center gap-2">
        <Surface variant="floating" role="toolbar" aria-label="Tools" className="flex max-w-full gap-0.5 overflow-x-auto p-1">
          {TOOLS.map(t => (
            <IconButton
              key={t.id}
              label={t.label}
              shortcut={[t.key]}
              icon={<Icon icon={t.icon} />}
              pressed={tool === t.id}
              disabled={phase !== 'ready'}
              onClick={() => setTool(t.id)}
              aria-label={t.label}
            />
          ))}
        </Surface>
        <Surface variant="floating" className="p-1">
          <Segmented
            label="View"
            hideLabel
            options={[
              { value: 'edit', label: 'Edit', title: 'Every annotation, with handles' },
              { value: 'viewer', label: 'Viewer', title: 'The step as the guide shows it: zoomed, groups appearing in order' },
            ]}
            value={view}
            disabled={phase !== 'ready'}
            onChange={setView}
          />
        </Surface>
      </div>
      {phase === 'ready' ? <Workspace /> : <DropZone loading={phase === 'loading'} />}
      {busy && <BusyOverlay text={busy} />}
    </main>
  );
}

function Workspace() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
      <CanvasView />
      <StatusChip />
    </div>
  );
}

/** What the canvas is waiting for, or what just happened: one line under the frame. */
function StatusChip() {
  const message = useEditor(s => s.message);
  const rate = useEditor(s => s.playback.rate);
  const stoppedAt = useEditor(s => s.playback.stoppedAt);
  const tool = useEditor(s => s.tool);
  const project = useEditor(selectProject);
  const stepNumber = stoppedAt && project ? project.steps.findIndex(s => s.id === stoppedAt) + 1 : 0;
  const hint = TOOLS.find(t => t.id === tool)?.hint ?? '';

  let text = '';
  let tone: 'plain' | 'waiting' | 'error' = 'plain';
  if (message) {
    text = message.text;
    tone = message.tone === 'error' ? 'error' : 'plain';
  } else if (rate !== 0) text = `${rate > 0 ? 'Playing' : 'Rewinding'}${Math.abs(rate) === 1 ? '' : ` ${Math.abs(rate)}×`}`;
  else if (stoppedAt && stepNumber > 0) {
    text = `Stopped at step ${stepNumber}`;
    tone = 'waiting';
  } else if (tool !== 'select') text = hint;

  return (
    <div className="flex min-h-8 justify-center">
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'flex max-w-full items-center gap-2 rounded-pill border px-3 py-1 text-sm',
          tone === 'error' ? 'border-danger text-danger' : tone === 'waiting' ? 'border-pin-line bg-pin-tint text-fg' : 'border-line bg-panel text-fg-muted',
          !text && 'invisible',
        )}
      >
        <span>{text || ' '}</span>
        {tone === 'waiting' && (
          <Button size="sm" variant="primary" onClick={() => currentPlayback()?.toggle()}>
            Continue
          </Button>
        )}
      </div>
    </div>
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
