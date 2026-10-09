import { Button, Icon, KeyCap, Surface } from '@waypost/ui';
import { Plus } from 'lucide-react';

export function StepRail() {
  return (
    <Surface as="aside" aria-labelledby="steps-heading" className="flex min-h-0 min-w-0 flex-col overflow-hidden [grid-area:steps]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="steps-heading" className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Steps <span className="ml-1 font-normal">0</span>
        </h2>
        <Button size="sm" icon={<Icon icon={Plus} size={14} />} shortcut={['shift', 'p']} disabled>
          Pin step
        </Button>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2 p-5 text-center text-fg-muted">
        <p className="m-0 font-medium text-fg">No steps yet</p>
        <p className="m-0">
          Open a recording, then use the Pin tool <KeyCap keys={['p']} /> to pin the moments viewers should click.
        </p>
      </div>
    </Surface>
  );
}
