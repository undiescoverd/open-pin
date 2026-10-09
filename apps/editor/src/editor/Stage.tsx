import { Button, Icon, IconButton, KeyCap, Surface } from '@waypost/ui';
import { Film } from 'lucide-react';
import { TOOLS, type ToolId } from './tools';

interface StageProps {
  tool: ToolId;
  onTool: (id: ToolId) => void;
}

/* The canvas column: the floating tool palette over the frame. With no recording open the frame is the drop zone. */
export function Stage({ tool, onTool }: StageProps) {
  return (
    <main className="flex min-h-0 min-w-0 flex-col items-center gap-3 [grid-area:stage]" aria-label="Canvas">
      <Surface variant="floating" role="toolbar" aria-label="Tools" className="flex max-w-full gap-0.5 overflow-x-auto p-1">
        {TOOLS.map(t => (
          <IconButton key={t.id} label={t.label} shortcut={[t.key]} icon={<Icon icon={t.icon} />} pressed={tool === t.id} onClick={() => onTool(t.id)} />
        ))}
      </Surface>
      <section
        aria-labelledby="drop-heading"
        className="flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line-strong bg-panel/60 p-8 text-center"
      >
        <span className="grid size-12 place-items-center rounded-pill bg-pin-tint text-pin">
          <Icon icon={Film} size={20} />
        </span>
        <h1 id="drop-heading" className="m-0 font-brand text-xl font-semibold text-fg">
          Drop a screen recording
        </h1>
        <p className="m-0 text-fg-muted">MP4, MOV, WebM or MKV, from QuickTime, Loom, OBS or any other recorder.</p>
        <Button variant="primary" size="lg" disabled>
          Choose a recording…
        </Button>
        <ol className="m-0 mt-2 flex list-none flex-wrap justify-center gap-x-6 gap-y-1 p-0 text-fg-muted">
          <li>
            1. Pin the moments that matter <KeyCap keys={['p']} />
          </li>
          <li>2. Point things out</li>
          <li>3. Share</li>
        </ol>
        <p className="m-0 text-sm text-fg-muted">Opening recordings arrives in the next build phase.</p>
      </section>
    </main>
  );
}
