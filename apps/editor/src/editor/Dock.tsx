import { Button, Surface, cx } from '@waypost/ui';
import { currentPlayback } from '../engine/session';
import { selectProject, useEditor } from '../state/store';
import { ToolPalette, ViewSwitch } from './ToolPalette';
import { TOOLS } from './tools';

/* The bar docked under the frame, as wide as the frame: the tools on the left, what the canvas is waiting for or what just
   happened in the middle, and the Edit / Viewer switch on the right (docs/03-design-system.md, "Editor layout"). Where the frame
   is narrower than about 640 px the status drops to a row of its own, and the switch wraps if the tools leave it no room. */
export function Dock() {
  return (
    <div className="@container w-full">
      <Surface variant="panel" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 py-[5px] @min-[640px]:flex-nowrap">
        <ToolPalette />
        <StatusChip />
        <div className="ml-auto shrink-0 @min-[640px]:ml-0">
          <ViewSwitch />
        </div>
      </Surface>
    </div>
  );
}

/** What the canvas is waiting for, or what just happened, in the middle of the dock. The dock keeps one height whatever it says, so
    the frame never resizes when a message comes and goes: up to two lines of small text, the rest in the tooltip. */
function StatusChip() {
  const message = useEditor(s => s.message);
  const rate = useEditor(s => s.playback.rate);
  const stoppedAt = useEditor(s => s.playback.stoppedAt);
  const tool = useEditor(s => s.tool);
  const project = useEditor(selectProject);
  const ready = useEditor(s => s.phase === 'ready');
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

  return (
    <div
      className={cx(
        'order-last flex h-[34px] basis-full items-center justify-center',
        '@min-[640px]:order-none @min-[640px]:min-w-0 @min-[640px]:flex-1 @min-[640px]:basis-0',
        /* on its own row, an empty status takes no room */
        !text && '@max-[639px]:hidden',
      )}
    >
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
