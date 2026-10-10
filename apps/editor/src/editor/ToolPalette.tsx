import { Icon, IconButton, Segmented } from '@waypost/ui';
import { setTool, useEditor } from '../state/store';
import { TOOLS } from './tools';
import { switchView } from './visible';

/* The tools and the Edit / Viewer switch, at the left of the timeline's transport row so they sit next to Play and the frame
   controls they are used with (docs/03-design-system.md, "Editor layout"). */

export function ToolPalette() {
  const tool = useEditor(s => s.tool);
  const ready = useEditor(s => s.phase === 'ready');
  return (
    <div role="toolbar" aria-label="Tools" className="flex shrink-0 items-center gap-0.5">
      {TOOLS.map(t => (
        <IconButton
          key={t.id}
          label={t.label}
          shortcut={[t.key]}
          icon={<Icon icon={t.icon} />}
          pressed={tool === t.id}
          disabled={!ready}
          onClick={() => setTool(t.id)}
          aria-label={t.label}
        />
      ))}
    </div>
  );
}

export function ViewSwitch() {
  const view = useEditor(s => s.view);
  const ready = useEditor(s => s.phase === 'ready');
  return (
    <Segmented
      label="View"
      hideLabel
      options={[
        { value: 'edit', label: 'Edit', title: 'Every annotation, with handles' },
        { value: 'viewer', label: 'Viewer', title: 'The step as the guide shows it: zoomed, groups appearing in order' },
      ]}
      value={view}
      disabled={!ready}
      onChange={switchView}
    />
  );
}
