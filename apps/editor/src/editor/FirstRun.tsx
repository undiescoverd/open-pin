import { Button, Icon, cx } from '@waypost/ui';
import { ChevronLeft, Film, FolderOpen, Loader2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { checkSupport } from '../engine/support';
import { ThemeButton } from '../ThemeButton';
import { openFile } from '../state/project';
import { setProjectsOpen, useEditor } from '../state/store';
import { Logo } from './Logo';
import { BusyOverlay } from './Stage';

/* Before there is a recording, the whole window is one drop zone (docs/06-simplify-plan.md, "First run"): Drop a screen recording
   here, with Choose a recording and Open a project file, and under it the shape of the whole job in three numbered lines. Nothing
   else is on screen until there is a recording, apart from the way back to projects saved in this browser. */

const RECORDINGS = 'video/*,.mp4,.m4v,.mov,.webm,.mkv';
const PROJECTS = '.waypost,.zip';

const support = checkSupport();

export function FirstRun() {
  const loading = useEditor(s => s.phase === 'loading');
  const busy = useEditor(s => s.busy);
  const recording = useRef<HTMLInputElement>(null);
  const project = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  };
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void openFile(file);
  };

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-3 px-4 py-3">
      <header className="flex items-center gap-2" aria-label="Waypost">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={<Icon icon={ChevronLeft} />} onClick={() => setProjectsOpen(true)}>
            Projects
          </Button>
          <ThemeButton />
        </div>
      </header>
      <main
        aria-labelledby="drop-heading"
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx(
          'flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          over ? 'border-sel bg-sel-tint' : 'border-line-strong bg-panel/60',
        )}
      >
        <span className="grid size-14 place-items-center rounded-pill bg-pin-tint text-pin">
          <Icon icon={loading ? Loader2 : Film} size={20} className={loading ? 'animate-spin' : undefined} />
        </span>
        <h1 id="drop-heading" className="m-0 font-brand text-2xl font-semibold text-fg">
          {loading ? 'Opening your project…' : 'Drop a screen recording here'}
        </h1>
        <p className="m-0 text-fg-muted">MP4, MOV, WebM or MKV, from QuickTime, Loom, OBS or any other recorder.</p>
        <input ref={recording} type="file" accept={RECORDINGS} hidden data-testid="file-input" onChange={choose} />
        <input ref={project} type="file" accept={PROJECTS} hidden data-testid="project-input" onChange={choose} />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" size="lg" disabled={loading} onClick={() => recording.current?.click()}>
            Choose a recording…
          </Button>
          <Button size="lg" disabled={loading} icon={<Icon icon={FolderOpen} />} onClick={() => project.current?.click()}>
            Open a project file…
          </Button>
        </div>
        {!support.ok && (
          <p role="note" className="m-0 max-w-md rounded-md border border-line-strong bg-raised px-3 py-2 text-fg">
            This browser can't open recordings in the editor (it lacks {support.missing.join(' and ')}). Use Chrome, Edge, Brave or Arc on a computer. Guides you publish play in any browser.
          </p>
        )}
        <ol aria-label="How it works" className="m-0 mt-4 flex list-none flex-wrap justify-center gap-x-8 gap-y-2 p-0 text-md text-fg">
          {['Add steps', 'Explain each one', 'Export'].map((text, i) => (
            <li key={text} className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-pill bg-raised text-sm font-semibold text-fg-muted">{i + 1}</span>
              {text}
            </li>
          ))}
        </ol>
        <p className="m-0 text-sm text-fg-muted">Your recording stays in this browser. Nothing is uploaded.</p>
        <MessageLine />
      </main>
      {busy && <BusyOverlay text={busy} />}
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
