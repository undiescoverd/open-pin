import {
  ASPECTS,
  clipLength,
  GRADIENT_PRESETS,
  embedSnippets,
  exportPlan,
  formatTimecode,
  guideSize,
  guideSlug,
  outputSizeForHeight,
  type Aspect,
  type GradientPreset,
  type LogoCorner,
  type PlaybackMode,
  type Project,
} from '@waypost/core';
import type { PdfPage, StillFormat } from '@waypost/export';
import { GRADIENTS } from '@waypost/render';
import { Advanced, Button, ColorSwatchPicker, Dialog, Icon, ParamRow, Segmented, SelectField, Switch, TextField, cx, focusRing } from '@waypost/ui';
import { Check, ClipboardCopy, Copy, Download, FileText, Film, ImageDown, ImagePlus, Images, Link2, MousePointerClick, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { copyFrame, exportGuide, exportMp4, exportPdfGuide, exportScreenshots, saveFrame } from '../state/exporting';
import { addImage } from '../state/project';
import { notify, selectProject, setExportDialog, setFrame, setGuide, setLogo, useEditor } from '../state/store';
import { useEditSession } from './useEditSession';

/* Export (docs/06-simplify-plan.md, "Export"): one dialog for everything that leaves the editor. Pick what to export, answer the
   one or two questions that matter for it, and export. How the guide plays and its end button sit in plain view; the player's look,
   saving options, framing, background and logo are under Advanced. After an interactive guide is saved, the same dialog gives its
   link and embed code (F11), with plain-words help for the common free hosts. */

type Kind = 'guide' | 'video' | 'pdf' | 'images';

const KINDS: ReadonlyArray<{ kind: Kind; title: string; desc: string; icon: LucideIcon }> = [
  { kind: 'guide', title: 'Interactive guide', desc: 'Viewers click through it on a web page.', icon: MousePointerClick },
  { kind: 'video', title: 'Video', desc: 'An MP4 that pauses on every step.', icon: Film },
  { kind: 'pdf', title: 'PDF', desc: 'One page per step, to print or send.', icon: FileText },
  { kind: 'images', title: 'Images', desc: 'A picture of every step, for docs.', icon: Images },
];

const ACTION: Record<Kind, string> = { guide: 'Export guide', video: 'Export video', pdf: 'Export PDF', images: 'Export images' };

const HEIGHTS = [
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '1440', label: '1440p' },
  { value: '2160', label: '4K' },
] as const;
type Height = (typeof HEIGHTS)[number]['value'];

const PDF_PAGES: ReadonlyArray<{ value: PdfPage; label: string }> = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'slide', label: '16:9 slides' },
];
const PDF_COPY = [{ value: 'none', label: 'No PDF copy' }, ...PDF_PAGES];

const MODE_HELP: Record<PlaybackMode, string> = {
  guided: 'Stops at every step until the viewer clicks Next.',
  auto: 'Pauses on each step for its pause time, then carries on. Viewers can pause it.',
  video: 'Plays straight through, with the steps marked on its progress bar in time.',
};

const Help = ({ children }: { children: ReactNode }) => <p className="m-0 text-sm text-fg-muted">{children}</p>;
const ButtonRow = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-2">{children}</div>;

/** A group of controls under Advanced, with a small heading. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h4 className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** What the video's sound switch says: plainly, which parts will be silent (docs/06-simplify-plan.md, "Honest messages"). */
function soundNote(project: Project, hasSound: boolean): string {
  if (!hasSound) return 'This recording has no sound of its own.';
  const changed = project.timeline.filter(c => Math.abs(c.speed - 1) > 1e-9);
  if (changed.length === 0) return 'Muted clips, gaps and the pauses at steps are silent.';
  const seconds = changed.reduce((sum, c) => sum + clipLength(c), 0);
  const clips = changed.length === 1 ? 'The sped-up or slowed clip is' : `The ${changed.length} sped-up or slowed clips are`;
  return `${clips} silent in the video (${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s): sound can't change speed yet. Muted clips, gaps and the pauses at steps are silent too.`;
}

export function ExportDialog() {
  const view = useEditor(s => s.exportDialog);
  const project = useEditor(selectProject);
  const busy = useEditor(s => !!s.exporting || !!s.busy);
  const canPickFolder = typeof window.showDirectoryPicker === 'function';
  const [kind, setKind] = useState<Kind>('guide');
  const [target, setTarget] = useState<'folder' | 'zip'>(canPickFolder ? 'folder' : 'zip');
  const [pdfCopy, setPdfCopy] = useState<PdfPage | 'none'>('a4');
  const [height, setHeight] = useState<Height>('1080');
  const [captions, setCaptions] = useState(true);
  const [audio, setAudio] = useState(true);
  const [page, setPage] = useState<PdfPage>('a4');
  const [format, setFormat] = useState<StillFormat>('png');
  const hasSound = useEditor(s => s.media?.info.hasAudio ?? true);
  if (!project?.sources[0]) return null;

  const steps = project.steps.length;
  const onOpenChange = (open: boolean) => setExportDialog(open ? 'choose' : 'closed');

  if (view === 'saved') {
    const slug = guideSlug(project.name);
    return (
      <Dialog open onOpenChange={onOpenChange} title="Link and embed code" description={`Put the folder ${slug} on any web host, then link to it or embed it.`} size="lg">
        <SavedView project={project} slug={slug} />
      </Dialog>
    );
  }

  /* a guide, PDF or images need a step to show; a video without steps is the recording, framed */
  const needsSteps = kind !== 'video' && steps === 0;

  const run = async () => {
    if (kind === 'guide') {
      let dir: FileSystemDirectoryHandle | undefined;
      if (target === 'folder' && window.showDirectoryPicker) {
        try {
          dir = await window.showDirectoryPicker({ id: 'waypost-guides', mode: 'readwrite' });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          throw error;
        }
      }
      setExportDialog('closed');
      if (await exportGuide({ dir, pdf: pdfCopy === 'none' ? null : pdfCopy })) setExportDialog('saved');
      return;
    }
    setExportDialog('closed');
    if (kind === 'video') await exportMp4({ height: Number(height) as 720 | 1080 | 1440 | 2160, fps: 30, captions, audio });
    else if (kind === 'pdf') await exportPdfGuide(page);
    else await exportScreenshots(format);
  };

  return (
    <Dialog open={view === 'choose'} onOpenChange={onOpenChange} title="Export" description={`${project.name} · ${steps} step${steps === 1 ? '' : 's'}`} size="lg">
      <div className="flex flex-col gap-5">
        <div role="group" aria-label="What to export" className="grid grid-cols-2 gap-2.5">
          {KINDS.map(k => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={cx(
                'group flex items-start gap-3 rounded-md border border-line bg-panel p-3.5 text-left text-fg hover:bg-raised',
                'aria-pressed:border-sel aria-pressed:bg-sel-tint aria-pressed:outline-1 aria-pressed:outline-sel',
                focusRing,
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-raised text-fg-muted group-aria-pressed:bg-sel-tint group-aria-pressed:text-sel-strong">
                <Icon icon={k.icon} size={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{k.title}</span>
                <span className="mt-0.5 block text-sm text-fg-muted">{k.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-md bg-raised p-4">
          {kind === 'guide' && <GuideOptions project={project} />}
          {kind === 'video' && (
            <>
              <Segmented label="Size" options={HEIGHTS} value={height} onChange={setHeight} />
              <Switch label="Step titles as captions" checked={captions} onChange={setCaptions} />
              <Switch label="The recording's own sound" checked={audio && hasSound} disabled={!hasSound} onChange={setAudio} hint={soundNote(project, hasSound)} />
            </>
          )}
          {kind === 'pdf' && <Segmented label="Page size" options={PDF_PAGES} value={page} onChange={setPage} />}
          {kind === 'images' && (
            <>
              <Segmented
                label="Format"
                options={[
                  { value: 'png', label: 'PNG', title: 'Sharpest, larger files' },
                  { value: 'webp', label: 'WebP', title: 'Smaller files' },
                ]}
                value={format}
                onChange={setFormat}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg-muted">Just the frame on screen</span>
                <ButtonRow>
                  <Button size="sm" icon={<Icon icon={ClipboardCopy} />} onClick={() => void copyFrame()}>
                    Copy frame
                  </Button>
                  <Button size="sm" icon={<Icon icon={ImageDown} />} onClick={() => void saveFrame()}>
                    Save frame as PNG
                  </Button>
                </ButtonRow>
              </div>
            </>
          )}
        </div>

        <Advanced id={`export-${kind}`} summary={kind === 'guide' ? 'Player look, saving, PDF copy, framing and logo' : 'Framing, background and logo'} className="-mt-1">
          {kind === 'guide' && (
            <>
              <EndButtonAdvanced project={project} />
              <PlayerLook project={project} />
              <Group title="Saving">
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
                  <SelectField label="PDF copy" value={pdfCopy} options={PDF_COPY} onChange={v => setPdfCopy(v as PdfPage | 'none')} />
                </div>
              </Group>
            </>
          )}
          <FramingGroup project={project} />
          <LogoGroup project={project} />
        </Advanced>

        {/* stays in view while Advanced is open and the dialog scrolls */}
        <div className="sticky -bottom-5 z-10 -mx-5 -mt-3 -mb-5 flex flex-col gap-3.5 bg-panel px-5 pt-3 pb-5">
          <div className="flex items-center gap-2.5">
            <p className="m-0 flex-1 text-sm text-fg-muted">
              {needsSteps ? 'Add a step first, then export.' : <Summary kind={kind} project={project} target={target} height={height} />}
            </p>
            <Button variant="ghost" onClick={() => setExportDialog('closed')}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Icon icon={Download} />} disabled={busy || needsSteps} onClick={() => void run()}>
              {ACTION[kind]}
            </Button>
          </div>
          <div className="flex items-center gap-2.5 border-t border-line pt-3.5 text-sm text-fg-muted">
            <Icon icon={Link2} />
            <span className="flex-1">
              <span className="font-semibold text-fg">Publish online</span> and get a link in one click
            </span>
            <span className="rounded-pill bg-raised px-2 py-0.5 text-xs font-semibold">Coming later</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** The line beside the Export button: what comes out. */
function Summary({ kind, project, target, height }: { kind: Kind; project: Project; target: 'folder' | 'zip'; height: Height }) {
  const steps = project.steps.length;
  if (kind === 'guide') {
    return target === 'folder'
      ? "Saves a folder you can put on any website. We'll give you the link and embed code next."
      : "Downloads the folder as a zip you can put on any website. We'll give you the link and embed code next.";
  }
  if (kind === 'video') {
    const source = project.sources[0]!;
    const plan = exportPlan(project);
    const [w, h] = outputSizeForHeight(project.frame, source.size, Number(height));
    const holds = plan.items.filter(i => i.kind === 'hold').length;
    return `${w} × ${h} · ${formatTimecode(plan.duration)} long, with ${holds} step pause${holds === 1 ? '' : 's'}.`;
  }
  if (kind === 'pdf') return `Downloads a PDF with ${steps} page${steps === 1 ? '' : 's'}, one per step.`;
  return `Downloads a zip with ${steps} picture${steps === 1 ? '' : 's'}, one per step.`;
}

// ----- the interactive guide: how it plays and the button at the end ----------------------------------------------------

function GuideOptions({ project }: { project: Project }) {
  const g = project.guide;
  const cta = g.cta;
  const session = useEditSession();
  const url = cta?.url.trim() ?? '';
  const urlProblem = cta && url !== '' && !/^https?:\/\/\S+$/i.test(url) ? 'Start the address with https:// so the button can open it.' : null;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Segmented
          label="How it plays"
          options={[
            { value: 'guided', label: 'Viewer clicks Next' },
            { value: 'auto', label: 'Plays by itself' },
            { value: 'video', label: 'Plain video' },
          ]}
          value={g.mode}
          onChange={mode => setGuide({ mode }, 'Change how it plays')}
        />
        <Help>{MODE_HELP[g.mode]}</Help>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg-muted">Button at the end</span>
        <label className="flex items-center gap-2 font-medium text-fg select-none">
          <input
            type="checkbox"
            checked={!!cta}
            onChange={e => setGuide({ cta: e.target.checked ? { label: 'Try it yourself', url: '', newTab: true, showAt: 'end' } : null }, e.target.checked ? 'Add end button' : 'Remove end button')}
            className={cx('size-4 accent-sel', focusRing)}
          />
          Show a button
        </label>
        {cta ? (
          <div {...session.bind} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start gap-3">
            <TextField label="Button text" value={cta.label} maxLength={40} onChange={e => setGuide({ cta: { ...cta, label: e.target.value } }, 'Change button text', session.key())} />
            <TextField
              label="Link"
              type="url"
              placeholder="https://example.com/signup"
              value={cta.url}
              maxLength={2000}
              onChange={e => setGuide({ cta: { ...cta, url: e.target.value } }, 'Change button link', session.key())}
              hint={urlProblem ?? (url ? undefined : 'The button appears once it has a link.')}
            />
          </div>
        ) : (
          <Help>A button to a signup, booking or documentation page, in the accent colour.</Help>
        )}
      </div>
      <ButtonRow>
        <Button size="sm" variant="ghost" onClick={() => setExportDialog('saved')}>
          Already online? Get the link and embed code
        </Button>
      </ButtonRow>
    </>
  );
}

function EndButtonAdvanced({ project }: { project: Project }) {
  const cta = project.guide.cta;
  if (!cta) return null;
  const showAt = [{ value: 'end', label: 'On the end card' }, ...project.steps.map((s, i) => ({ value: s.id, label: `From step ${i + 1}${s.title.trim() ? `, ${s.title.trim()}` : ''}` }))];
  return (
    <Group title="End button">
      <SelectField label="Show it" value={showAt.some(o => o.value === cta.showAt) ? cta.showAt : 'end'} options={showAt} onChange={v => setGuide({ cta: { ...cta, showAt: v } }, 'Move end button')} />
      <Switch label="Open in a new tab" checked={cta.newTab} onChange={newTab => setGuide({ cta: { ...cta, newTab } }, 'Change end button')} />
    </Group>
  );
}

/* the accents offered for the player (docs/03-design-system.md); each reads with white or ink text, picked for contrast */
const ACCENTS = [
  { id: 'coral', name: 'Coral', value: '#D13A30' },
  { id: 'lagoon', name: 'Lagoon', value: '#0B7568' },
  { id: 'iris', name: 'Iris', value: '#4F4BD6' },
  { id: 'marigold', name: 'Marigold', value: '#FFB020' },
];

function PlayerLook({ project }: { project: Project }) {
  const g = project.guide;
  return (
    <Group title="Player">
      <ColorSwatchPicker label="Accent" colors={ACCENTS} value={g.accent} onChange={accent => setGuide({ accent }, 'Change accent')} />
      <Segmented
        label="Player colours"
        options={[
          { value: 'auto', label: 'Auto', title: "Light or dark, following the viewer's system" },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={g.chrome}
        onChange={chrome => setGuide({ chrome }, 'Change player colours')}
      />
      <Switch label="Step counter" checked={g.controls.counter} onChange={counter => setGuide({ controls: { ...g.controls, counter } }, counter ? 'Show step counter' : 'Hide step counter')} />
      <Switch label="Progress bar" checked={g.controls.progress} onChange={progress => setGuide({ controls: { ...g.controls, progress } }, progress ? 'Show progress bar' : 'Hide progress bar')} />
      <Switch label="Fullscreen button" checked={g.controls.fullscreen} onChange={fullscreen => setGuide({ controls: { ...g.controls, fullscreen } }, fullscreen ? 'Show fullscreen button' : 'Hide fullscreen button')} />
    </Group>
  );
}

// ----- framing, background and logo: every export draws them ------------------------------------------------------------

const ASPECT_LABEL: Record<Aspect, string> = { source: 'Same as the recording', '16:9': '16:9 widescreen', '4:3': '4:3', '1:1': '1:1 square', '4:5': '4:5 portrait' };
const BACKGROUND_COLORS = [
  { id: 'paper', name: 'Paper', value: '#F6F7F9' },
  { id: 'white', name: 'White', value: '#FFFFFF' },
  { id: 'ink', name: 'Ink', value: '#0E1116' },
  { id: 'coral', name: 'Coral', value: '#FF5A4E' },
  { id: 'lagoon', name: 'Lagoon', value: '#13B8A6' },
  { id: 'iris', name: 'Iris', value: '#6E6BFF' },
];
const CORNERS: ReadonlyArray<{ value: LogoCorner; label: string }> = [
  { value: 'tl', label: '↖ Top left' },
  { value: 'tr', label: '↗ Top right' },
  { value: 'bl', label: '↙ Bottom left' },
  { value: 'br', label: '↘ Bottom right' },
];

/** A button that opens a file picker for an image. */
function ImagePicker({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/avif"
        hidden
        aria-label={label}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button size="sm" icon={<Icon icon={ImagePlus} />} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

function FramingGroup({ project }: { project: Project }) {
  const frame = project.frame;
  const session = useEditSession();
  const bg = frame.background;
  const kind = bg.type;
  const image = bg.type === 'image' ? project.assets.find(a => a.id === bg.asset) : undefined;
  return (
    <Group title="Background and framing">
      <SelectField label="Shape" value={frame.aspect} options={ASPECTS.map(a => ({ value: a, label: ASPECT_LABEL[a] }))} onChange={v => setFrame({ aspect: v as Aspect }, 'Change shape')} />
      <div {...session.bind} className="flex flex-col gap-3">
        <ParamRow label="Padding" value={Math.round(frame.padding * 100)} min={0} max={25} unit="%" defaultValue={0} onChange={v => setFrame({ padding: v / 100 }, 'Change padding', session.key())} />
        <ParamRow label="Corner radius" value={frame.cornerRadius} min={0} max={40} unit="px" defaultValue={12} onChange={v => setFrame({ cornerRadius: v }, 'Change corner radius', session.key())} />
      </div>
      <Segmented
        label="Background"
        options={[
          { value: 'none', label: 'None' },
          { value: 'color', label: 'Colour' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'image', label: 'Image' },
        ]}
        value={kind}
        onChange={v => {
          if (v === 'none') setFrame({ background: { type: 'none' } }, 'Remove background');
          else if (v === 'color') setFrame({ background: { type: 'color', color: '#F6F7F9' } }, 'Change background');
          else if (v === 'gradient') setFrame({ background: { type: 'gradient', preset: 'dusk' } }, 'Change background');
          else {
            const last = [...project.assets].reverse().find(a => a.id !== project.logo?.asset);
            if (last) setFrame({ background: { type: 'image', asset: last.id } }, 'Change background');
            else notify('Choose an image for the background.');
          }
        }}
      />
      {bg.type === 'color' && <ColorSwatchPicker label="Background colour" colors={BACKGROUND_COLORS} value={bg.color} onChange={color => setFrame({ background: { type: 'color', color } }, 'Change background')} />}
      {bg.type === 'gradient' && (
        <div role="group" aria-label="Gradient" className="grid grid-cols-4 gap-1.5">
          {GRADIENT_PRESETS.map((g: GradientPreset) => (
            <button
              key={g}
              type="button"
              aria-pressed={bg.preset === g}
              onClick={() => setFrame({ background: { type: 'gradient', preset: g } }, 'Change background')}
              className={cx('flex flex-col items-center gap-1 rounded-md p-1 text-xs text-fg-muted aria-pressed:outline-2 aria-pressed:outline-sel', focusRing)}
            >
              <span className="h-8 w-full rounded-sm border border-line" style={{ background: `linear-gradient(135deg, ${GRADIENTS[g].stops[0]}, ${GRADIENTS[g].stops[1]})` }} />
              {GRADIENTS[g].name}
            </button>
          ))}
        </div>
      )}
      {(kind === 'image' || kind === 'none') && (
        <div className="flex flex-col gap-1">
          {image && <Help>Image: {image.name}</Help>}
          <ButtonRow>
            <ImagePicker label={image ? 'Replace background image…' : 'Choose a background image…'} onFile={file => void addImage(file, 'background')} />
          </ButtonRow>
        </div>
      )}
      <Switch label="Shadow" checked={frame.shadow} onChange={shadow => setFrame({ shadow }, shadow ? 'Add shadow' : 'Remove shadow')} />
      <Help>{frame.padding > 0 || frame.aspect !== 'source' ? 'The recording sits on the background with rounded corners.' : 'Add padding or pick a shape to put the recording on a background.'}</Help>
    </Group>
  );
}

function LogoGroup({ project }: { project: Project }) {
  const logo = project.logo;
  const session = useEditSession();
  const asset = logo ? project.assets.find(a => a.id === logo.asset) : undefined;
  return (
    <Group title="Logo">
      {logo ? (
        <>
          <Help>{asset?.name ?? 'Logo'} in a corner of every frame, the video and the guide.</Help>
          <Segmented label="Corner" options={CORNERS.map(c => ({ value: c.value, label: c.label.split(' ')[0]!, title: c.label.slice(2) }))} value={logo.corner} onChange={corner => setLogo({ ...logo, corner: corner as LogoCorner }, 'Move logo')} />
          <div {...session.bind} className="flex flex-col gap-3">
            <ParamRow label="Size" value={Math.round(logo.size * 100)} min={3} max={30} unit="%" defaultValue={10} onChange={v => setLogo({ ...logo, size: v / 100 }, 'Resize logo', session.key())} />
            <ParamRow label="Margin" value={Math.round(logo.margin * 1000) / 10} min={0} max={10} step={0.5} unit="%" defaultValue={3} onChange={v => setLogo({ ...logo, margin: v / 100 }, 'Change logo margin', session.key())} />
            <ParamRow label="Opacity" value={Math.round(logo.opacity * 100)} min={10} max={100} unit="%" defaultValue={90} onChange={v => setLogo({ ...logo, opacity: v / 100 }, 'Change logo opacity', session.key())} />
          </div>
          <ButtonRow>
            <ImagePicker label="Replace logo…" onFile={file => void addImage(file, 'logo')} />
            <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>
              Remove logo
            </Button>
          </ButtonRow>
        </>
      ) : (
        <>
          <Help>Put your logo in a corner of every frame. A PNG or SVG with a transparent background works best.</Help>
          <ButtonRow>
            <ImagePicker label="Add a logo…" onFile={file => void addImage(file, 'logo')} />
          </ButtonRow>
        </>
      )}
    </Group>
  );
}

// ----- after saving: the link and embed code ------------------------------------------------------------------------------

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

function SavedView({ project, slug }: { project: Project; slug: string }) {
  const session = useEditSession();
  const address = project.guide.address;
  const snippets = embedSnippets({ title: project.name, size: guideSize(project) }, address.trim() || `https://you.github.io/guides/${slug}/`);
  const folder = <span className="font-mono text-fg">{slug}</span>;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-labelledby="saved-host">
        <h3 id="saved-host" className="m-0 text-md font-semibold text-fg">
          1. Put the folder online
        </h3>
        <p className="m-0 text-fg-muted">The folder {folder} is the whole guide. Any web host that serves plain files can show it. Three that are free to start:</p>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="font-semibold text-fg">Netlify</dt>
          <dd className="m-0 text-fg-muted">Open app.netlify.com/drop and drag the folder onto the page. It gives you an address straight away.</dd>
          <dt className="font-semibold text-fg">Cloudflare Pages</dt>
          <dd className="m-0 text-fg-muted">In the Cloudflare dashboard, open Workers &amp; Pages, create a Pages project by uploading files, and drop the folder in.</dd>
          <dt className="font-semibold text-fg">GitHub Pages</dt>
          <dd className="m-0 text-fg-muted">Add the folder to a repository and turn on Pages in the repository's settings. The guide is then at your-name.github.io/repository/{slug}/.</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="saved-embed">
        <h3 id="saved-embed" className="m-0 text-md font-semibold text-fg">
          2. Link to it or embed it
        </h3>
        <div {...session.bind}>
          <TextField
            label="Guide address"
            type="url"
            placeholder={`https://you.github.io/guides/${slug}/`}
            value={address}
            maxLength={500}
            onChange={e => setGuide({ address: e.target.value }, 'Change guide address', session.key())}
            hint="Where the folder is once it's online. The link and embed code use it, and so does embed.txt in the next export."
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

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setExportDialog('choose')}>
          Back to Export
        </Button>
        <Button variant="primary" onClick={() => setExportDialog('closed')}>
          Done
        </Button>
      </div>
    </div>
  );
}
