import { canRedo, canUndo, redoLabel, undoLabel } from '@waypost/core';
import { Button, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from '@waypost/ui';
import { ChevronDown, ChevronLeft, ClipboardCopy, Download, Eye, FileArchive, FileText, Film, FolderDown, Image as ImageIcon, Redo2, Save, Search, Share, Undo2 } from 'lucide-react';
import { ThemeButton } from '../ThemeButton';
import { copyFrame, exportPdfGuide, exportScreenshots, saveFrame } from '../state/exporting';
import { saveWaypost } from '../state/project';
import { redo, renameProject, selectProject, setExportOpen, setPreviewOpen, setProjectsOpen, setShareOpen, undo, useEditor } from '../state/store';
import { Logo } from './Logo';
import { useEditSession } from './useEditSession';

export function TopBar() {
  const project = useEditor(selectProject);
  const history = useEditor(s => s.history);
  const save = useEditor(s => s.save);
  const ready = useEditor(s => s.phase === 'ready');
  const nameSession = useEditSession();

  return (
    <header className="flex min-w-0 items-center gap-2 [grid-area:top]" aria-label="Waypost">
      <Logo />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <Button variant="ghost" size="sm" icon={<Icon icon={ChevronLeft} />} onClick={() => setProjectsOpen(true)}>
        Projects
      </Button>
      <input
        aria-label="Guide name"
        value={project?.name ?? 'Untitled guide'}
        disabled={!project}
        maxLength={90}
        onChange={e => renameProject(e.target.value, nameSession.key())}
        {...nameSession.bind}
        className="h-8 min-w-0 flex-1 basis-56 rounded-sm border border-transparent bg-transparent px-2 text-md font-semibold text-fg outline-none hover:border-line focus-visible:border-sel focus-visible:bg-panel disabled:text-fg-muted sm:max-w-80"
      />
      <span role="status" aria-live="polite" className="hidden min-w-16 text-sm text-fg-muted lg:inline">
        {ready ? (save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved' : 'Saved') : ''}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Undo" shortcut={['mod', 'z']} title={history ? (undoLabel(history) ? `Undo ${undoLabel(history)}` : undefined) : undefined} icon={<Icon icon={Undo2} />} disabled={!history || !canUndo(history)} onClick={undo} />
        <IconButton label="Redo" shortcut={['mod', 'shift', 'z']} title={history ? (redoLabel(history) ? `Redo ${redoLabel(history)}` : undefined) : undefined} icon={<Icon icon={Redo2} />} disabled={!history || !canRedo(history)} onClick={redo} />
        <ThemeButton />
        <IconButton label="Search every action" shortcut={['mod', 'k']} icon={<Icon icon={Search} />} disabled />
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <Button icon={<Icon icon={Eye} />} disabled={!ready} onClick={() => setPreviewOpen(true)} title="See what viewers see (⌘↩)">
          Preview
        </Button>
        <Menu
          trigger={
            <Button icon={<Icon icon={Download} />} disabled={!ready}>
              Export
              <Icon icon={ChevronDown} size={14} />
            </Button>
          }
        >
          <MenuLabel>Interactive guide</MenuLabel>
          <MenuItem icon={<Icon icon={FolderDown} />} onSelect={() => setShareOpen(true)}>
            Guide folder for the web…
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>PDF guide</MenuLabel>
          <MenuItem icon={<Icon icon={FileText} />} onSelect={() => void exportPdfGuide('a4')}>
            PDF · A4
          </MenuItem>
          <MenuItem icon={<Icon icon={FileText} />} onSelect={() => void exportPdfGuide('letter')}>
            PDF · Letter
          </MenuItem>
          <MenuItem icon={<Icon icon={FileText} />} onSelect={() => void exportPdfGuide('slide')}>
            PDF · 16:9 slides
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Screenshots</MenuLabel>
          <MenuItem icon={<Icon icon={FileArchive} />} onSelect={() => void exportScreenshots('png')}>
            PNG images (zip)
          </MenuItem>
          <MenuItem icon={<Icon icon={FileArchive} />} onSelect={() => void exportScreenshots('webp')}>
            WebP images (zip)
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>This frame</MenuLabel>
          <MenuItem icon={<Icon icon={ClipboardCopy} />} onSelect={() => void copyFrame()}>
            Copy frame
          </MenuItem>
          <MenuItem icon={<Icon icon={ImageIcon} />} onSelect={() => void saveFrame()}>
            Save frame as PNG
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icon icon={Save} />} shortcut={['mod', 's']} onSelect={() => void saveWaypost()}>
            Save project file (.waypost)
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Video</MenuLabel>
          <MenuItem icon={<Icon icon={Film} />} onSelect={() => setExportOpen(true)}>
            MP4 video…
          </MenuItem>
        </Menu>
        <Button variant="primary" icon={<Icon icon={Share} />} disabled={!ready} onClick={() => setShareOpen(true)}>
          Share
        </Button>
      </div>
    </header>
  );
}
