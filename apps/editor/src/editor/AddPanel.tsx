import { Icon, Tooltip, cx, focusRing } from '@waypost/ui';
import { addToStep, selectProject, stepAtPlayhead, useEditor } from '../state/store';
import { ADD_ITEMS } from './tools';

/* The top of the right panel, always (docs/06-simplify-plan.md, "Add, then adjust"): six large buttons that put an item on the step
   at the playhead with one click, selected and placed sensibly, ready to drag. Each tooltip names the key that picks the matching
   tool instead, to draw the item exactly where you click or drag on the frame. */
export function AddButtons() {
  const project = useEditor(selectProject);
  const playhead = useEditor(s => s.playhead);
  const ready = useEditor(s => s.phase === 'ready');
  const tool = useEditor(s => s.tool);
  const step = project ? stepAtPlayhead(project, playhead) : undefined;
  const number = step && project ? project.steps.indexOf(step) + 1 : 0;
  const heading = !ready ? 'Add to a step' : step ? `Add to step ${number}` : 'Add to a new step';

  return (
    <section aria-labelledby="add-heading" className="flex flex-col gap-2">
      <h3 id="add-heading" className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
        {heading}
      </h3>
      <div role="group" aria-labelledby="add-heading" className="grid grid-cols-3 gap-1.5">
        {ADD_ITEMS.map(item => (
          <Tooltip key={item.kind} content={item.kind === 'hide' ? `${item.label}, from here on` : `${item.label}. Or press the key and click on the frame`} shortcut={[item.key]}>
            <button
              type="button"
              disabled={!ready}
              onClick={() => addToStep(item.kind)}
              /* while its key's tool is picked, the button shows it, so the hint under the frame has a source */
              data-armed={tool === item.tool || undefined}
              className={cx(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-md border border-line-strong bg-panel text-sm font-medium text-fg transition-colors hover:bg-raised',
                'data-armed:border-sel data-armed:bg-sel-tint',
                'disabled:cursor-not-allowed disabled:border-line disabled:bg-raised disabled:text-fg-disabled',
                focusRing,
              )}
            >
              <Icon icon={item.icon} size={20} />
              {item.label}
            </button>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}
