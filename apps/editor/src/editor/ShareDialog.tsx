import { embedSnippets, guideSize, guideSlug } from '@waypost/core';
import type { PdfPage } from '@waypost/export';
import { Button, Dialog, Icon, Segmented, SelectField, TextField, cx, focusRing } from '@waypost/ui';
import { Check, Copy, FolderDown } from 'lucide-react';
import { useState } from 'react';
import { exportGuide } from '../state/exporting';
import { selectProject, setGuide, setShareOpen, useEditor } from '../state/store';
import { useEditSession } from './useEditSession';

/* Share (F11): export the interactive guide as a static folder, and the ways to put it on a page: a standalone link, two lines of
   HTML, or an iframe for sites that strip scripts. The snippets use the address the person types, or a placeholder until then. */

const PDF_OPTIONS = [
  { value: 'none', label: 'No PDF copy' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'slide', label: '16:9 slides' },
];

function CopyBox({ label, value, rows }: { label: string; value: string; rows: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no clipboard access here: select the text so it can be copied by hand */
      (document.getElementById(`copy-${label}`) as HTMLTextAreaElement | null)?.select();
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={`copy-${label}`} className="text-sm font-medium text-fg-muted">
          {label}
        </label>
        <Button size="sm" variant="ghost" icon={<Icon icon={copied ? Check : Copy} />} onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <textarea
        id={`copy-${label}`}
        readOnly
        rows={rows}
        value={value}
        onFocus={e => e.currentTarget.select()}
        className={cx('w-full resize-none rounded-sm border border-line-strong bg-raised px-2 py-1.5 font-mono text-sm leading-snug text-fg', focusRing)}
      />
    </div>
  );
}

export function ShareDialog() {
  const open = useEditor(s => s.shareOpen);
  const project = useEditor(selectProject);
  const busy = useEditor(s => !!s.exporting);
  const canPickFolder = typeof window.showDirectoryPicker === 'function';
  const [target, setTarget] = useState<'folder' | 'zip'>(canPickFolder ? 'folder' : 'zip');
  const [pdf, setPdf] = useState('a4');
  const session = useEditSession();
  if (!project?.sources[0]) return null;

  const slug = guideSlug(project.name);
  const address = project.guide.address;
  const snippets = embedSnippets({ title: project.name, size: guideSize(project) }, address.trim() || `https://you.github.io/guides/${slug}/`);
  const steps = project.steps.length;

  const run = async () => {
    let dir: FileSystemDirectoryHandle | undefined;
    if (target === 'folder' && window.showDirectoryPicker) {
      try {
        dir = await window.showDirectoryPicker({ id: 'waypost-guides', mode: 'readwrite' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        throw error;
      }
    }
    setShareOpen(false);
    await exportGuide({ dir, pdf: pdf === 'none' ? null : (pdf as PdfPage) });
  };

  return (
    <Dialog open={open} onOpenChange={setShareOpen} title="Share guide" description="Export the guide as a folder of files, put it on any web host, then link to it or embed it." size="md">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3" aria-labelledby="share-export">
          <h3 id="share-export" className="m-0 text-md font-semibold text-fg">
            1. Export the guide
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Segmented
              label="Save as"
              options={[
                { value: 'folder', label: 'Folder', title: canPickFolder ? 'Write the guide into a folder you choose' : 'This browser can only download a zip' },
                { value: 'zip', label: 'Zip file' },
              ]}
              value={target}
              onChange={v => setTarget(v === 'folder' && !canPickFolder ? 'zip' : v)}
            />
            <SelectField label="PDF copy" value={pdf} options={PDF_OPTIONS} onChange={setPdf} />
          </div>
          <p className="m-0 text-fg-muted">
            A folder named <span className="font-mono text-fg">{slug}</span> with index.html, player.js, guide.json and the pictures and motion for {steps} step{steps === 1 ? '' : 's'}. It plays in
            any modern browser, phones included, from any static host: GitHub Pages, Cloudflare Pages, Netlify or S3.
          </p>
          <div>
            <Button variant="primary" icon={<Icon icon={FolderDown} />} disabled={busy || steps === 0} onClick={() => void run()}>
              Export guide
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="share-embed">
          <h3 id="share-embed" className="m-0 text-md font-semibold text-fg">
            2. Put it on a page
          </h3>
          <div {...session.bind}>
            <TextField
              label="Guide address"
              type="url"
              placeholder={`https://you.github.io/guides/${slug}/`}
              value={address}
              maxLength={500}
              onChange={e => setGuide({ address: e.target.value }, 'Change guide address', session.key())}
              hint="Where the folder will be once uploaded. The snippets and the folder's embed.txt use it."
            />
          </div>
          <CopyBox label="Link" value={snippets.link} rows={1} />
          <CopyBox label="Embed code" value={snippets.script} rows={3} />
          <details className="group">
            <summary className={cx('cursor-default text-sm text-fg-muted select-none hover:text-fg', focusRing)}>Use an iframe instead, for sites that strip scripts</summary>
            <div className="mt-2">
              <CopyBox label="Iframe" value={snippets.iframe} rows={3} />
            </div>
          </details>
        </section>
      </div>
    </Dialog>
  );
}
