import { Icon, IconButton, Segmented } from '@waypost/ui';
import { setTool, useEditor } from '../state/store';
import { TOOLS } from './tools';
import { switchView } from './visible';

/* The tools and the Edit / Viewer switch, which sit in the dock under the frame (Dock.tsx). */

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
          /* the picked tool says its name, when the dock is wide enough to spare the room */
          showLabel={tool === t.id}
          labelClassName="hidden @min-[720px]:inline"
          disabled={!ready}
          onClick={() => setTool(t.id)}
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
