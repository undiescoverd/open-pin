import { GRADIENT_PRESETS, formatTimecode, type GradientPreset, type LogoCorner, type Project } from '@waypost/core';
import { ANNOTATION_COLORS, GRADIENTS } from '@waypost/render';
import { Button, ColorSwatchPicker, Icon, InspectorSection, ParamRow, Segmented, Switch, cx, focusRing } from '@waypost/ui';
import { ImagePlus } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { addImage, saveWaypost } from '../state/project';
import { selectProject, setAnnotationColor, setFrame, setLogo, useEditor } from '../state/store';
import { useEditSession } from './useEditSession';

/* The Canvas tab of the right panel (docs/06-simplify-plan.md, "The canvas"): the background, frame, annotation colour and logo
   that every step, preview and export is drawn with, then the recording and where the project is saved. A new project opens on it,
   so the look can be chosen first; the bar above the frame has the shape and a Style button that brings it back. It sits beside the
   frame, never over it, so a change can be watched as it is made. */

const BACKGROUND_COLORS = [
  { id: 'paper', name: 'Paper', value: '#F6F7F9' },
  { id: 'white', name: 'White', value: '#FFFFFF' },
  { id: 'ink', name: 'Ink', value: '#0E1116' },
  { id: 'coral', name: 'Coral', value: '#FF5A4E' },
  { id: 'lagoon', name: 'Lagoon', value: '#13B8A6' },
  { id: 'iris', name: 'Iris', value: '#6E6BFF' },
];
const gradientCss = (g: GradientPreset): string => `linear-gradient(135deg, ${GRADIENTS[g].stops[0]}, ${GRADIENTS[g].stops[1]})`;
const ANNOTATION_SWATCHES = ANNOTATION_COLORS.map(c => ({ id: c.id, name: c.name, value: c.stroke }));
const CORNERS: ReadonlyArray<{ value: LogoCorner; label: string }> = [
  { value: 'tl', label: '↖ Top left' },
  { value: 'tr', label: '↗ Top right' },
  { value: 'bl', label: '↙ Bottom left' },
  { value: 'br', label: '↘ Bottom right' },
];

const Help = ({ children }: { children: ReactNode }) => <p className="m-0 text-sm text-fg-muted">{children}</p>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h4 className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{title}</h4>
      {children}
    </section>
  );
}

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

function CanvasStyle({ project }: { project: Project }) {
  const frame = project.frame;
  const bg = frame.background;
  const logo = project.logo;
  const session = useEditSession();
  const logoSession = useEditSession();
  const image = bg.type === 'image' ? project.assets.find(a => a.id === bg.asset) : undefined;
  const logoAsset = logo ? project.assets.find(a => a.id === logo.asset) : undefined;
  return (
    <div className="flex flex-col gap-5">
      <Group title="Background">
        <div role="group" aria-label="Gradient" className="grid grid-cols-4 gap-1.5">
          {GRADIENT_PRESETS.map((g: GradientPreset) => (
            <button
              key={g}
              type="button"
              aria-pressed={bg.type === 'gradient' && bg.preset === g}
              onClick={() => setFrame({ background: { type: 'gradient', preset: g } }, 'Change background')}
              className={cx('flex flex-col items-center gap-1 rounded-md p-1 text-xs text-fg-muted aria-pressed:outline-2 aria-pressed:outline-sel', focusRing)}
            >
              <span className="h-8 w-full rounded-sm border border-line" style={{ background: gradientCss(g) }} />
              {GRADIENTS[g].name}
            </button>
          ))}
        </div>
        <ColorSwatchPicker
          label="Background colour"
          colors={BACKGROUND_COLORS}
          value={bg.type === 'color' ? bg.color : ''}
          onChange={color => setFrame({ background: { type: 'color', color } }, 'Change background')}
        />
        <div className="flex flex-col gap-1">
          {image && <Help>Image: {image.name}</Help>}
          <div className="flex flex-wrap gap-2">
            <ImagePicker label={image ? 'Replace background image…' : 'Choose a background image…'} onFile={file => void addImage(file, 'background')} />
          </div>
        </div>
      </Group>

      <Group title="Frame">
        <div {...session.bind} className="flex flex-col gap-3">
          <ParamRow label="Padding" value={Math.round(frame.padding * 100)} min={0} max={25} unit="%" defaultValue={0} onChange={v => setFrame({ padding: v / 100 }, 'Change padding', session.key())} />
          <ParamRow label="Corner radius" value={frame.cornerRadius} min={0} max={40} unit="px" defaultValue={12} onChange={v => setFrame({ cornerRadius: v }, 'Change corner radius', session.key())} />
        </div>
        <Switch label="Shadow" checked={frame.shadow} onChange={shadow => setFrame({ shadow }, shadow ? 'Add shadow' : 'Remove shadow')} />
        <Help>The recording sits on the background, with rounded corners and a shadow, wherever it doesn’t fill the canvas.</Help>
      </Group>

      <Group title="Annotations">
        <ColorSwatchPicker label="Annotation colour" colors={ANNOTATION_SWATCHES} value={project.guide.annotationColor} onChange={setAnnotationColor} />
        <Help>New arrows, outlines and click markers take it (callouts stay dark bubbles). Changing it recolours every one still in the old colour; one you gave its own colour keeps it.</Help>
      </Group>

      <Group title="Logo">
        {logo ? (
          <>
            <Help>{logoAsset?.name ?? 'Logo'} in a corner of every frame, the video and the guide.</Help>
            <Segmented label="Corner" options={CORNERS.map(c => ({ value: c.value, label: c.label.split(' ')[0]!, title: c.label.slice(2) }))} value={logo.corner} onChange={corner => setLogo({ ...logo, corner }, 'Move logo')} />
            <div {...logoSession.bind} className="flex flex-col gap-3">
              <ParamRow label="Size" value={Math.round(logo.size * 100)} min={3} max={30} unit="%" defaultValue={10} onChange={v => setLogo({ ...logo, size: v / 100 }, 'Resize logo', logoSession.key())} />
              <ParamRow label="Margin" value={Math.round(logo.margin * 1000) / 10} min={0} max={10} step={0.5} unit="%" defaultValue={3} onChange={v => setLogo({ ...logo, margin: v / 100 }, 'Change logo margin', logoSession.key())} />
              <ParamRow label="Opacity" value={Math.round(logo.opacity * 100)} min={10} max={100} unit="%" defaultValue={90} onChange={v => setLogo({ ...logo, opacity: v / 100 }, 'Change logo opacity', logoSession.key())} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ImagePicker label="Replace logo…" onFile={file => void addImage(file, 'logo')} />
              <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>
                Remove logo
              </Button>
            </div>
          </>
        ) : (
          <>
            <Help>Put your logo in a corner of every frame. A PNG or SVG with a transparent background works best.</Help>
            <div className="flex flex-wrap gap-2">
              <ImagePicker label="Add a logo…" onFile={file => void addImage(file, 'logo')} />
            </div>
          </>
        )}
      </Group>
    </div>
  );
}

function Recording({ project }: { project: Project }) {
  const save = useEditor(s => s.save);
  const source = project.sources[0];
  if (!source) return null;
  return (
    <>
      <InspectorSection id="canvas-recording" title="Recording">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-fg-muted">File</dt>
          <dd className="m-0 truncate text-fg" title={source.name}>
            {source.name}
          </dd>
          <dt className="text-fg-muted">Size</dt>
          <dd className="m-0 text-fg">
            {source.size[0]} × {source.size[1]}
          </dd>
          <dt className="text-fg-muted">Length</dt>
          <dd className="m-0 font-mono text-fg">{formatTimecode(source.duration)}</dd>
          <dt className="text-fg-muted">Frame rate</dt>
          <dd className="m-0 text-fg">{Math.round(source.fps * 100) / 100} fps</dd>
          <dt className="text-fg-muted">Steps</dt>
          <dd className="m-0 text-fg">{project.steps.length}</dd>
        </dl>
      </InspectorSection>
      <InspectorSection id="canvas-storage" title="Saving">
        <p className="m-0 text-fg-muted">
          {save === 'saving' ? 'Saving…' : save === 'error' ? 'Could not save to this browser.' : 'Saved in this browser.'} Projects live in this browser. Save a .waypost file to keep a copy.
        </p>
        <Button onClick={() => void saveWaypost()}>Save project file…</Button>
      </InspectorSection>
    </>
  );
}

/** The whole Canvas tab. */
export function CanvasPanel() {
  const project = useEditor(selectProject);
  if (!project) {
    return (
      <>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Canvas</h3>
        <p className="m-0 text-fg-muted">The background, frame and logo of your guide appear here once a recording is open.</p>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Canvas</h3>
        <Help>The look of the picture. What you see on the frame is what every export draws. The shape is in the bar above it.</Help>
      </div>
      <CanvasStyle project={project} />
      <div>
        <Recording project={project} />
      </div>
    </div>
  );
}
