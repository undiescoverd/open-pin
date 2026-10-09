import { Button, Icon, IconButton, KeyCap, Surface, Tooltip } from '@waypost/ui';
import { Eye, Magnet, MapPin, Plus, Redo2, Share, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import tokens from '../../../../design/tokens.json';
import { ThemeButton } from '../ThemeButton';

/* PinKit gallery: every Phase 0 component in each variant and state, drawn in the light and the dark theme side by side. */

const ROLES = Object.keys(tokens.theme.light).filter(r => !r.startsWith('shadow-'));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;

function Gallery({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-8 rounded-lg bg-app p-6 text-fg" aria-label={`${theme === 'light' ? 'Light' : 'Dark'} theme`} role="region">
      <h2 className="m-0 font-brand text-xl font-semibold">{theme === 'light' ? 'Light' : 'Dark'}</h2>

      <Section title="Button">
        <Row>
          <Button variant="primary">Share</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger" icon={<Icon icon={Trash2} />}>
            Delete step
          </Button>
        </Row>
        <Row>
          <Button size="sm" icon={<Icon icon={Plus} size={14} />} shortcut={['shift', 'p']}>
            Pin step
          </Button>
          <Button size="md" icon={<Icon icon={Eye} />}>
            Medium
          </Button>
          <Button size="lg" variant="primary" icon={<Icon icon={Share} />}>
            Large
          </Button>
        </Row>
        <Row>
          <Button variant="primary" disabled>
            Disabled primary
          </Button>
          <Button disabled>Disabled</Button>
        </Row>
      </Section>

      <Section title="IconButton (hover or focus for the tooltip)">
        <Row>
          <IconButton label="Undo" shortcut={['mod', 'z']} icon={<Icon icon={Undo2} />} />
          <IconButton label="Redo" shortcut={['mod', 'shift', 'z']} icon={<Icon icon={Redo2} />} disabled />
          <IconButton label="Pin" shortcut={['p']} icon={<Icon icon={MapPin} />} pressed />
          <IconButton label="Snapping" shortcut={['n']} size="sm" icon={<Icon icon={Magnet} />} pressed={false} />
          <IconButton label="Delete" variant="secondary" icon={<Icon icon={Trash2} />} />
        </Row>
      </Section>

      <Section title="KeyCap">
        <Row>
          <KeyCap keys={['mod', 'k']} platform="mac" />
          <KeyCap keys={['mod', 'shift', 'z']} platform="mac" />
          <KeyCap keys={['alt', 'left']} platform="mac" />
          <KeyCap keys={['mod', 'k']} platform="other" />
          <KeyCap keys={['mod', 'shift', 'z']} platform="other" />
          <KeyCap keys={['space']} />
        </Row>
      </Section>

      <Section title="Tooltip">
        <Row>
          <Tooltip content="Pin the current frame as a step" shortcut={['shift', 'p']}>
            <Button>Hover or focus me</Button>
          </Tooltip>
        </Row>
      </Section>

      <Section title="Surface">
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-[linear-gradient(135deg,var(--wp-sel),var(--wp-pin))] p-4">
          <Surface className="p-3">panel</Surface>
          <Surface variant="raised" className="p-3">
            raised
          </Surface>
          <Surface variant="floating" className="p-3">
            floating
          </Surface>
        </div>
      </Section>

      <Section title="Colour roles">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-0">
          {ROLES.map(role => (
            <li key={role} className="flex items-center gap-2 text-sm">
              <span className="size-6 shrink-0 rounded-sm border border-line" style={{ background: `var(--wp-${role})` }} />
              <code className="font-mono text-xs text-fg-muted">{role}</code>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default function KitPage() {
  return (
    <div className="min-h-full bg-app p-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="m-0 font-brand text-2xl font-bold text-fg">PinKit</h1>
        <p className="m-0 text-fg-muted">Waypost's components, generated from design/tokens.json.</p>
        <div className="ml-auto flex items-center gap-2">
          <a className="text-sel underline" href="/">
            Back to the editor
          </a>
          <ThemeButton />
        </div>
      </header>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Gallery theme="light" />
        <Gallery theme="dark" />
      </div>
    </div>
  );
}
