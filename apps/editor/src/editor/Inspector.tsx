import { formatTimecode, parseTimecode, srcToTl, tlToSrc, type Annotation, type CalloutPlacement, type Project, type Source, type Step } from '@waypost/core';
import { ANNOTATION_COLORS } from '@waypost/render';
import {
  Button,
  ColorSwatchPicker,
  Icon,
  InspectorSection,
  ParamRow,
  SelectField,
  Surface,
  TextArea,
  TextField,
  TimecodeField,
  cx,
  focusRing,
} from '@waypost/ui';
import { Trash2 } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { saveWaypost } from '../state/project';
import {
  moveStep,
  notify,
  removeAnnotation,
  removeStep,
  seekSource,
  selectAnnotation,
  selectedAnnotation,
  selectedStep,
  selectProject,
  setStepHold,
  setStepText,
  totalDuration,
  updateAnnotation,
  useEditor,
} from '../state/store';
import { useEditSession } from './useEditSession';

const TABS = [
  { id: 'selection', label: 'Inspector' },
  { id: 'guide', label: 'Guide' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TYPE_LABEL: Record<Annotation['type'], string> = { callout: 'Callout', arrow: 'Arrow', spotlight: 'Spotlight', box: 'Box', click: 'Click marker' };

/* Context inspector (docs/03-design-system.md): the first tab edits whatever is selected, the second holds guide-wide settings. */
export function Inspector() {
  const [tab, setTab] = useState<TabId>('selection');
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ selection: null, guide: null });

  /* arrow keys move between tabs, as the WAI-ARIA tabs pattern expects */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex(t => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <Surface as="aside" aria-label="Inspector" className="flex min-h-0 min-w-0 flex-col overflow-hidden [grid-area:insp]">
      <div role="tablist" aria-label="Inspector panels" className="flex gap-1 border-b border-line p-2" onKeyDown={onKeyDown}>
        {TABS.map(t => (
          <button
            key={t.id}
            ref={el => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cx('h-8 flex-1 rounded-md border-0 font-medium text-fg-muted hover:text-fg aria-selected:bg-raised aria-selected:text-fg', focusRing)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map(t => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={tab !== t.id} tabIndex={0} className={cx('flex-1 overflow-auto p-4', focusRing)}>
          {t.id === 'selection' ? <SelectionPanel /> : <GuidePanel />}
        </div>
      ))}
    </Surface>
  );
}

function SelectionPanel() {
  const project = useEditor(selectProject);
  const selection = useEditor(s => s.selection);
  const step = selectedStep(project, selection);
  const annotation = selectedAnnotation(project, selection);
  if (!project || !step) {
    return (
      <>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Nothing selected</h3>
        <p className="m-0 text-fg-muted">Click a step, an annotation on the frame, or anything on the timeline to edit it here.</p>
      </>
    );
  }
  const source = project.sources[0]!;
  return annotation ? <AnnotationPanel step={step} annotation={annotation} source={source} /> : <StepPanel project={project} step={step} />;
}

function StepPanel({ project, step }: { project: Project; step: Step }) {
  const number = project.steps.findIndex(s => s.id === step.id) + 1;
  const media = useEditor(s => s.media);
  const text = useEditSession();
  const hold = useEditSession();

  const place = (seconds: number): boolean | string => {
    if (!media) return false;
    const pos = tlToSrc(project.timeline, seconds);
    if (!pos || seconds > totalDuration(project) + 1e-6) return `That's past the end of the recording (${formatTimecode(totalDuration(project))}).`;
    const time = media.index.snap(pos.time);
    if (project.steps.some(s => s.id !== step.id && Math.abs(s.anchor.time - time) < 0.5 / media.info.fps)) return 'Another step is already pinned on that frame.';
    moveStep(step.id, time);
    seekSource(time);
    return true;
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-pill bg-pin text-sm font-semibold text-on-pin">{number}</span>
        <h3 className="m-0 text-md font-semibold text-fg">Step {number}</h3>
      </div>
      <p className="m-0 mb-1 text-fg-muted">Viewers see this frame, its annotations, then the next step.</p>
      <InspectorSection id="step-text" title="Words">
        <div {...text.bind} className="flex flex-col gap-3">
          <TextField label="Title" placeholder={`Step ${number}`} maxLength={120} value={step.title} onChange={e => setStepText(step.id, { title: e.target.value }, text.key())} />
          <TextArea label="Note" placeholder="Add a sentence of context (optional)" maxLength={2000} value={step.body} onChange={e => setStepText(step.id, { body: e.target.value }, text.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="step-timing" title="Timing">
        <TimecodeField label="Position" value={srcToTl(project.timeline, step.anchor.source, step.anchor.time)} format={t => formatTimecode(t)} parse={parseTimecode} onCommit={place} onRefuse={m => notify(m, 'error')} />
        <div {...hold.bind}>
          <ParamRow label="Pause" value={step.minHold} min={1} max={8} step={0.1} unit="s" defaultValue={2.5} onChange={v => setStepHold(step.id, v, hold.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="step-annotations" title="Annotations">
        {step.annotations.length === 0 ? (
          <p className="m-0 text-fg-muted">None yet. Pick Callout, Arrow, Spotlight or Box (C, A, S, B) and draw on the frame.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {step.annotations.map(a => (
              <li key={a.id} className="flex items-center gap-1 rounded-md bg-raised p-1">
                <button type="button" onClick={() => selectAnnotation(step.id, a.id)} className={cx('h-7 min-w-0 flex-1 truncate rounded-sm px-2 text-left hover:bg-panel', focusRing)}>
                  {annotationName(a)}
                </button>
                <button type="button" aria-label={`Delete ${annotationName(a)}`} onClick={() => removeAnnotation(step.id, a.id)} className={cx('grid size-7 place-items-center rounded-sm text-fg-muted hover:bg-panel hover:text-danger', focusRing)}>
                  <Icon icon={Trash2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
      <div className="pt-3">
        <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={() => removeStep(step.id)}>
          Delete step
        </Button>
      </div>
    </div>
  );
}

function annotationName(a: Annotation): string {
  if (a.type === 'callout') return `Callout “${a.text.length > 26 ? `${a.text.slice(0, 25)}…` : a.text}”`;
  return TYPE_LABEL[a.type];
}

const PLACEMENTS: ReadonlyArray<{ value: CalloutPlacement; label: string }> = [
  { value: 'bottom', label: 'Below the point' },
  { value: 'top', label: 'Above the point' },
  { value: 'right', label: 'To the right' },
  { value: 'left', label: 'To the left' },
];

const SWATCHES = ANNOTATION_COLORS.map(c => ({ id: c.id, name: c.name, value: c.stroke }));

function AnnotationPanel({ step, annotation: a, source }: { step: Step; annotation: Annotation; source: Source }) {
  const session = useEditSession();
  const [W, H] = source.size;
  const edit = (patch: Partial<Annotation>, label?: string) => updateAnnotation(step.id, a.id, patch, label, session.key());

  /** a px field bound to one coordinate of a point or rect */
  const px = (label: string, value: number, axis: 'x' | 'y', set: (norm: number) => void, opts: { min?: number; max?: number } = {}) => {
    const size = axis === 'x' ? W : H;
    return (
      <ParamRow
        key={label}
        label={label}
        value={Math.round(value * size)}
        min={opts.min ?? 0}
        max={opts.max ?? size}
        unit="px"
        onChange={v => set(Math.min(1, Math.max(0, v / size)))}
      />
    );
  };

  const geometry = ((): React.ReactNode => {
    if (a.type === 'click') return [px('X', a.at[0], 'x', n => edit({ at: [n, a.at[1]] })), px('Y', a.at[1], 'y', n => edit({ at: [a.at[0], n] }))];
    if (a.type === 'callout') {
      return [px('Pointer X', a.anchor[0], 'x', n => edit({ anchor: [n, a.anchor[1]] })), px('Pointer Y', a.anchor[1], 'y', n => edit({ anchor: [a.anchor[0], n] }))];
    }
    if (a.type === 'arrow') {
      return [
        px('Tail X', a.from[0], 'x', n => edit({ from: [n, a.from[1]] })),
        px('Tail Y', a.from[1], 'y', n => edit({ from: [a.from[0], n] })),
        px('Tip X', a.to[0], 'x', n => edit({ to: [n, a.to[1]] })),
        px('Tip Y', a.to[1], 'y', n => edit({ to: [a.to[0], n] })),
      ];
    }
    const [rx, ry, rw, rh] = a.rect;
    const fit = (r: [number, number, number, number]): [number, number, number, number] => [Math.min(r[0], 1 - r[2]), Math.min(r[1], 1 - r[3]), r[2], r[3]];
    return [
      px('X', rx, 'x', n => edit({ rect: fit([n, ry, rw, rh]) })),
      px('Y', ry, 'y', n => edit({ rect: fit([rx, n, rw, rh]) })),
      px('Width', rw, 'x', n => edit({ rect: [rx, ry, Math.min(n, 1 - rx), rh] }), { min: 8 }),
      px('Height', rh, 'y', n => edit({ rect: [rx, ry, rw, Math.min(n, 1 - ry)] }), { min: 8 }),
    ];
  })();

  return (
    <div>
      <h3 className="m-0 mb-1 text-md font-semibold text-fg">{TYPE_LABEL[a.type]}</h3>
      <p className="m-0 mb-1 text-fg-muted">Drag it on the frame to move it.</p>
      <div {...session.bind}>
        {a.type === 'callout' && (
          <InspectorSection id="ann-text" title="Text">
            <TextArea label="Text" maxLength={300} value={a.text} onChange={e => edit({ text: e.target.value })} />
            <SelectField label="Bubble placement" value={a.placement} options={PLACEMENTS} onChange={v => edit({ placement: v as CalloutPlacement })} />
          </InspectorSection>
        )}
        {a.type !== 'spotlight' && (
          <InspectorSection id="ann-color" title="Colour">
            <ColorSwatchPicker label="Colour" colors={SWATCHES} value={a.color} onChange={color => edit({ color }, 'Change colour')} />
          </InspectorSection>
        )}
        <InspectorSection id="ann-geometry" title="Position and size">
          {geometry}
        </InspectorSection>
      </div>
      <div className="pt-3">
        <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={() => removeAnnotation(step.id, a.id)}>
          Delete {TYPE_LABEL[a.type].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

function GuidePanel() {
  const project = useEditor(selectProject);
  const save = useEditor(s => s.save);
  const source = project?.sources[0];
  if (!project || !source) {
    return (
      <>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Guide settings</h3>
        <p className="m-0 text-fg-muted">Frame, logo, player, audio and analytics settings appear here once a recording is open.</p>
      </>
    );
  }
  return (
    <div>
      <h3 className="m-0 mb-1 text-md font-semibold text-fg">Guide settings</h3>
      <InspectorSection id="guide-recording" title="Recording">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-fg-muted">File</dt>
          <dd className="m-0 truncate text-fg" title={source.name}>{source.name}</dd>
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
      <InspectorSection id="guide-storage" title="Saving">
        <p className="m-0 text-fg-muted">
          {save === 'saving' ? 'Saving…' : save === 'error' ? 'Could not save to this browser.' : 'Saved in this browser.'} Projects live in this browser. Save a .waypost file to keep a copy.
        </p>
        <Button onClick={() => void saveWaypost()}>Save project file…</Button>
      </InspectorSection>
      <InspectorSection id="guide-later" title="Coming next">
        <p className="m-0 text-fg-muted">Background and framing, logo, narration, music, the interactive player and analytics arrive in later phases.</p>
      </InspectorSection>
    </div>
  );
}
