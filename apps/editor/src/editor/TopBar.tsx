import { Button, Icon, IconButton } from '@waypost/ui';
import { ChevronDown, ChevronLeft, Download, Eye, Redo2, Search, Share, Undo2 } from 'lucide-react';
import { ThemeButton } from '../ThemeButton';
import { Logo } from './Logo';

export function TopBar() {
  return (
    <header className="flex min-w-0 items-center gap-2 [grid-area:top]" aria-label="Waypost">
      <Logo />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <Button variant="ghost" size="sm" icon={<Icon icon={ChevronLeft} />} disabled>
        Projects
      </Button>
      <input
        aria-label="Guide name"
        defaultValue="Untitled guide"
        maxLength={90}
        className="h-8 min-w-0 flex-1 basis-56 rounded-sm border border-transparent bg-transparent px-2 text-md font-semibold text-fg outline-none hover:border-line focus-visible:border-sel focus-visible:bg-panel sm:max-w-80"
      />
      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Undo" shortcut={['mod', 'z']} icon={<Icon icon={Undo2} />} disabled />
        <IconButton label="Redo" shortcut={['mod', 'shift', 'z']} icon={<Icon icon={Redo2} />} disabled />
        <ThemeButton />
        <IconButton label="Search every action" shortcut={['mod', 'k']} icon={<Icon icon={Search} />} disabled />
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <Button icon={<Icon icon={Eye} />} disabled>
          Preview
        </Button>
        <Button icon={<Icon icon={Download} />} disabled>
          Export
          <Icon icon={ChevronDown} size={14} />
        </Button>
        <Button variant="primary" icon={<Icon icon={Share} />} disabled>
          Share
        </Button>
      </div>
    </header>
  );
}
