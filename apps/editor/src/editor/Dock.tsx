import { Button, cx } from '@waypost/ui';
import { currentPlayback } from '../engine/session';
import { selectProject, useEditor } from '../state/store';
import { nextHint } from './nextHint';
import { TOOLS } from './tools';

/* The line under the frame, as wide as the frame: what the canvas is waiting for, or what just happened (docs/03-design-system.md,
   "Editor layout"); when there's nothing to say, the next useful thing to do. The tools that used to sit here are the Add buttons at
   the top of the right panel now, so the frame gets the height they took. */
export function Dock() {
  return <StatusChip />;
}

/** What the canvas is waiting for, or what just happened. The line keeps one height whatever it says, so
    the frame never resizes when a message comes and goes: up to two lines of small text, the rest in the tooltip. */
function StatusChip() {
  const message = useEditor(s => s.message);
  const rate = useEditor(s => s.playback.rate);
  const stoppedAt = useEditor(s => s.playback.stoppedAt);
  const tool = useEditor(s => s.tool);
  const project = useEditor(selectProject);
  const ready = useEditor(s => s.phase === 'ready');
  const looked = useEditor(s => s.looked);
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
  /* before a recording is open the drop zone has its own message line */
  if (!ready) text = '';
  const next = ready && !text && project ? nextHint(project, looked) : '';

  return (
    <div className="relative flex h-[34px] w-full min-w-0 items-center justify-center">
      {/* the hint sits where the status chip would be, and makes way for it */}
      {next && (
        <p data-testid="next-hint" className="absolute inset-x-0 m-0 truncate text-center text-xs text-fg-muted">
          {next}
        </p>
      )}
      <div
        role="status"
        aria-live="polite"
        title={text || undefined}
        className={cx(
          'flex max-h-full max-w-full min-w-0 items-center gap-2 rounded-[14px] border px-3 py-0.5 text-xs leading-tight',
          tone === 'error' ? 'border-danger text-danger' : tone === 'waiting' ? 'border-pin-line bg-pin-tint text-fg' : 'border-line bg-panel text-fg-muted',
          !text && 'invisible',
        )}
      >
        <span className="line-clamp-2 min-w-0">{text || ' '}</span>
        {tone === 'waiting' && (
          <Button size="sm" variant="primary" className="shrink-0" onClick={() => currentPlayback()?.toggle()}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
