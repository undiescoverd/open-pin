import { formatTimecode } from '@waypost/core';
import { Button, Dialog, Icon, cx, focusRing } from '@waypost/ui';
import { FileUp, Film, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteProject, openFile, openProject, projectList } from '../state/project';
import { setProjectsOpen, useEditor } from '../state/store';
import type { LibraryEntry } from '../storage/library';

function Thumb({ url }: { url?: string }) {
  return url ? (
    <img src={url} alt="" className="h-14 w-[88px] shrink-0 rounded-sm object-cover" />
  ) : (
    <span className="grid h-14 w-[88px] shrink-0 place-items-center rounded-sm bg-raised text-fg-muted">
      <Icon icon={Film} />
    </span>
  );
}

type Row = LibraryEntry & { thumbUrl?: string };

/** Every project saved in this browser, newest first. */
export function ProjectsDialog() {
  const open = useEditor(s => s.projectsOpen);
  const currentId = useEditor(s => s.history?.present.id);
  const [entries, setEntries] = useState<Row[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const chooser = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const urls: string[] = [];
    void projectList().then(list => {
      if (cancelled) return;
      setConfirming(null);
      setEntries(
        list.map(entry => {
          const thumbUrl = entry.thumb ? URL.createObjectURL(entry.thumb) : undefined;
          if (thumbUrl) urls.push(thumbUrl);
          return { ...entry, thumbUrl };
        }),
      );
    });
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setProjectsOpen} title="Projects" description="Saved in this browser. Save a .waypost file to keep a copy elsewhere." size="md">
      {entries === null ? (
        <p className="m-0 text-fg-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="m-0 text-fg-muted">No projects yet. Choose a recording to start one.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {entries.map(entry => (
            <li key={entry.id} className="flex items-center gap-3 rounded-md border border-line bg-raised p-2">
              <Thumb url={entry.thumbUrl} />
              <button type="button" onClick={() => void openProject(entry.id)} className={cx('min-w-0 flex-1 rounded-sm text-left', focusRing)}>
                <span className="block truncate font-medium text-fg">
                  {entry.name}
                  {entry.id === currentId && <span className="ml-2 text-xs font-normal text-sel-strong">open</span>}
                </span>
                <span className="block truncate text-sm text-fg-muted">
                  {entry.steps} step{entry.steps === 1 ? '' : 's'} · {formatTimecode(entry.duration)} · edited {new Date(entry.updatedAt).toLocaleString()}
                </span>
              </button>
              {confirming === entry.id ? (
                <span className="flex items-center gap-1">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      void deleteProject(entry.id).then(() => {
                        setEntries(list => list?.filter(e => e.id !== entry.id) ?? null);
                        setConfirming(null);
                      })
                    }
                  >
                    Delete for good
                  </Button>
                  <Button size="sm" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" size="sm" aria-label={`Delete ${entry.name}`} icon={<Icon icon={Trash2} />} onClick={() => setConfirming(entry.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <input
          ref={chooser}
          type="file"
          hidden
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.waypost"
          data-testid="projects-file-input"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              setProjectsOpen(false);
              void openFile(file);
            }
          }}
        />
        <Button variant="primary" icon={<Icon icon={Film} />} onClick={() => chooser.current?.click()}>
          New from a recording…
        </Button>
        <Button icon={<Icon icon={FileUp} />} onClick={() => chooser.current?.click()}>
          Open a .waypost file…
        </Button>
      </div>
    </Dialog>
  );
}
