import {
  ASPECTS,
  EFFECTS,
  EFFECT_COLORS,
  EFFECT_TYPES,
  GRADIENT_PRESETS,
  MAX_SPEED,
  MIN_REGION,
  MIN_SPEED,
  REVEAL_GROUPS,
  SPEED_PRESETS,
  ZOOM_MAX,
  ZOOM_MIN,
  blurRectAt,
  clipLength,
  clipStarts,
  effectSummary,
  formatTimecode,
  layerEnd,
  parseTimecode,
  srcToTl,
  tlToSrc,
  topLayer,
  trimLimits,
  zoomAmount,
  zoomBox,
  type Annotation,
  type Aspect,
  type Blur,
  type CalloutPlacement,
  type Clip,
  type ClipEdge,
  type Effect,
  type EffectType,
  type GradientPreset,
  type LogoCorner,
  type PlaybackMode,
  type Project,
  type Rect,
  type Source,
  type Step,
} from '@waypost/core';
import { ANNOTATION_COLORS, GRADIENTS } from '@waypost/render';
import {
  Button,
  ColorSwatchPicker,
  Icon,
  IconButton,
  InspectorSection,
  ParamRow,
  Segmented,
  SelectField,
  Surface,
  Switch,
  TextArea,
  TextField,
  TimecodeField,
  cx,
  focusRing,
} from '@waypost/ui';
import { ChevronDown, ChevronUp, Grid3x3, ImagePlus, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addImage, saveWaypost } from '../state/project';
import {
  addEffect,
  addZoom,
  blurKeyframeHere,
  deleteClip,
  flattenBlurHere,
  getEditor,
  moveBlurLayer,
  moveEffect,
  moveStep,
  notify,
  placeBlur,
  removeAnnotation,
  removeBlur,
  removeBlurKeyframeHere,
  removeEffect,
  removeStep,
  seekSource,
  seekTimeline,
  selectAnnotation,
  selectedAnnotation,
  selectedBlur,
  selectedStep,
  selectProject,
  selectZoom,
  setBlurRectHere,
  setClipAudio,
  setClipSpeed,
  setFrame,
  setGap,
  setGuide,
  setLogo,
  setStepHold,
  setStepText,
  setStepZoom,
  setPreviewOpen,
  sourceTimeAt,
  splitAtPlayhead,
  totalDuration,
  trimClip,
  updateAnnotation,
  updateBlur,
  updateEffect,
  useEditor,
} from '../state/store';
import { useEditSession } from './useEditSession';
import { switchView } from './visible';

const TABS = [
  { id: 'selection', label: 'Inspector' },
  { id: 'guide', label: 'Guide' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TYPE_LABEL: Record<Annotation['type'], string> = { callout: 'Callout', arrow: 'Arrow', spotlight: 'Spotlight', box: 'Box', click: 'Click marker' };

const tc = (t: number): string => formatTimecode(t);
const refuse = (m: string): void => notify(m, 'error');

/* Context inspector (docs/03-design-system.md; docs/05-editor-interactions.md, section 7): the first tab edits whatever is
   selected, the second holds guide-wide settings. Selecting something new scrolls the panel to the top. */
export function Inspector() {
  const [tab, setTab] = useState<TabId>('selection');
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ selection: null, guide: null });
  const panel = useRef<HTMLDivElement>(null);
  const selection = useEditor(s => s.selection);
  const selectionKey = selection ? JSON.stringify(selection) : '';

  /* a new selection shows the Inspector tab, scrolled to the top */
  const [shownKey, setShownKey] = useState(selectionKey);
  if (shownKey !== selectionKey) {
    setShownKey(selectionKey);
    if (selectionKey) setTab('selection');
  }
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [selectionKey]);

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
        <div
          key={t.id}
          ref={t.id === 'selection' ? panel : undefined}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={tab !== t.id}
          tabIndex={0}
          className={cx('flex-1 overflow-auto p-4', focusRing)}
        >
          {t.id === 'selection' ? <SelectionPanel /> : <GuidePanel />}
        </div>
      ))}
    </Surface>
  );
}

function Title({ icon, title, sub }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      {icon}
      <div className="min-w-0">
        <h3 className="m-0 truncate text-md font-semibold text-fg">{title}</h3>
        {sub && <p className="m-0 text-sm text-fg-muted tabular-nums">{sub}</p>}
      </div>
    </div>
  );
}

const Help = ({ children }: { children: ReactNode }) => <p className="m-0 text-sm text-fg-muted">{children}</p>;
const ButtonRow = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-2">{children}</div>;

function SelectionPanel() {
  const project = useEditor(selectProject);
  const selection = useEditor(s => s.selection);
  if (!project || !selection) {
    return (
      <>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Nothing selected</h3>
        <p className="m-0 text-fg-muted">Click a step, an annotation on the frame, or anything on the timeline to edit it here.</p>
      </>
    );
  }
  const source = project.sources[0]!;
  switch (selection.kind) {
    case 'clip':
    case 'gap': {
      const index = project.timeline.findIndex(c => c.id === selection.clipId);
      const clip = project.timeline[index];
      if (!clip) return null;
      return selection.kind === 'clip' ? <ClipPanel project={project} clip={clip} index={index} /> : <GapPanel project={project} clip={clip} index={index} />;
    }
    case 'blur': {
      const blur = selectedBlur(project, selection);
      return blur ? <EffectPanel key={blur.id} project={project} blur={blur} source={source} /> : null;
    }
    default: {
      const step = selectedStep(project, selection);
      if (!step) return null;
      if (selection.kind === 'zoom' && step.zoom) return <ZoomPanel project={project} step={step} />;
      const annotation = selectedAnnotation(project, selection);
      return annotation ? <AnnotationPanel step={step} annotation={annotation} source={source} /> : <StepPanel project={project} step={step} />;
    }
  }
}

// ----- step -----------------------------------------------------------------------------------------------------------

const REVEAL_OPTIONS = Array.from({ length: REVEAL_GROUPS }, (_, g) => ({ value: String(g), label: g === 0 ? 'With the step' : `Then, group ${g + 1}` }));

function StepPanel({ project, step }: { project: Project; step: Step }) {
  const number = project.steps.findIndex(s => s.id === step.id) + 1;
  const media = useEditor(s => s.media);
  const text = useEditSession();
  const hold = useEditSession();
  const zoom = useEditSession();

  const place = (seconds: number): boolean | string => {
    if (!media) return false;
    const pos = tlToSrc(project.timeline, seconds);
    if (!pos || seconds > totalDuration(project) + 1e-6) return `That's past the end of the guide (${tc(totalDuration(project))}).`;
    const time = media.index.snap(pos.time);
    if (project.steps.some(s => s.id !== step.id && Math.abs(s.anchor.time - time) < 0.5 / media.info.fps)) return 'Another step is already pinned on that frame.';
    moveStep(step.id, time);
    seekSource(time);
    return true;
  };

  return (
    <div>
      <Title icon={<span className="grid size-6 place-items-center rounded-pill bg-pin text-sm font-semibold text-on-pin">{number}</span>} title={`Step ${number}`} />
      <Help>Viewers see this frame, its annotations, then the next step.</Help>
      <InspectorSection id="step-text" title="Words">
        <div {...text.bind} className="flex flex-col gap-3">
          <TextField label="Title" placeholder={`Step ${number}`} maxLength={120} value={step.title} onChange={e => setStepText(step.id, { title: e.target.value }, text.key())} />
          <TextArea label="Note" placeholder="Add a sentence of context (optional)" maxLength={2000} value={step.body} onChange={e => setStepText(step.id, { body: e.target.value }, text.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="step-timing" title="Timing">
        <TimecodeField label="Position" value={srcToTl(project.timeline, step.anchor.source, step.anchor.time)} format={tc} parse={parseTimecode} onCommit={place} onRefuse={refuse} />
        <div {...hold.bind}>
          <ParamRow label="Pause" value={step.minHold} min={1} max={8} step={0.1} unit="s" defaultValue={2.5} onChange={v => setStepHold(step.id, v, hold.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="step-zoom" title="Zoom">
        {step.zoom ? (
          <div {...zoom.bind} className="flex flex-col gap-3">
            <ZoomAmount step={step} sessionKey={zoom.key} />
            <ButtonRow>
              <Button size="sm" onClick={() => selectZoom(step.id)}>
                Edit zoom box
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStepZoom(step.id, null)}>
                Remove zoom
              </Button>
            </ButtonRow>
          </div>
        ) : (
          <>
            <Help>Ease in on part of the frame when viewers reach this step. Draw a box with the Zoom tool (Z), or:</Help>
            <ButtonRow>
              <Button size="sm" onClick={() => addZoom(step.id)}>
                Zoom in on this step
              </Button>
            </ButtonRow>
          </>
        )}
      </InspectorSection>
      <InspectorSection id="step-annotations" title="Annotations">
        {step.annotations.length === 0 ? (
          <p className="m-0 text-fg-muted">None yet. Pick Callout, Arrow, Spotlight or Box (C, A, S, B) and draw on the frame.</p>
        ) : (
          <>
            <Help>Each appears with the step or after it, group by group, in the guide and the video.</Help>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {step.annotations.map(a => (
                <li key={a.id} className="flex items-center gap-1 rounded-md bg-raised p-1">
                  <button type="button" onClick={() => selectAnnotation(step.id, a.id)} className={cx('h-7 min-w-0 flex-1 truncate rounded-sm px-2 text-left hover:bg-panel', focusRing)}>
                    {annotationName(a)}
                  </button>
                  <select
                    aria-label={`When ${annotationName(a)} appears`}
                    value={String(a.reveal)}
                    onChange={e => updateAnnotation(step.id, a.id, { reveal: Number(e.target.value) }, 'Change reveal order')}
                    className={cx('h-7 w-[92px] rounded-sm border border-line-strong bg-panel px-1 text-sm text-fg', focusRing)}
                  >
                    {REVEAL_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.value === '0' ? 'First' : `Group ${Number(o.value) + 1}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={`Delete ${annotationName(a)}`} onClick={() => removeAnnotation(step.id, a.id)} className={cx('grid size-7 place-items-center rounded-sm text-fg-muted hover:bg-panel hover:text-danger', focusRing)}>
                    <Icon icon={Trash2} />
                  </button>
                </li>
              ))}
            </ul>
          </>
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

/** Zoom amount, 1.25× to 4×: the box grows or shrinks about its centre. */
function ZoomAmount({ step, sessionKey }: { step: Step; sessionKey: () => string }) {
  const rect = step.zoom!.rect;
  const amount = Math.round(zoomAmount(rect) * 100) / 100;
  return (
    <ParamRow
      label="Amount"
      value={amount}
      min={Math.round((1 / ZOOM_MAX) * 100) / 100}
      max={1 / ZOOM_MIN}
      step={0.05}
      unit="×"
      defaultValue={2}
      onChange={v => setStepZoom(step.id, zoomBox([rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], 1 / v), 'Change zoom', sessionKey())}
    />
  );
}

function ZoomPanel({ project, step }: { project: Project; step: Step }) {
  const number = project.steps.findIndex(s => s.id === step.id) + 1;
  const session = useEditSession();
  const view = useEditor(s => s.view);
  const click = step.annotations.find(a => a.type === 'click');
  const rect = step.zoom!.rect;
  return (
    <div>
      <Title title="Zoom" sub={`Step ${number} · ${Math.round(zoomAmount(rect) * 100) / 100}×`} />
      <Help>When viewers reach the step the view eases into this box, keeping the frame's shape. Drag it or its handles on the frame.</Help>
      <InspectorSection id="zoom-amount" title="Zoom">
        <div {...session.bind}>
          <ZoomAmount step={step} sessionKey={session.key} />
        </div>
        <ButtonRow>
          <Button size="sm" disabled={click?.type !== 'click'} onClick={() => click?.type === 'click' && setStepZoom(step.id, zoomBox(click.at, rect[2]), 'Centre zoom')}>
            Centre on the click
          </Button>
          <Button size="sm" aria-pressed={view === 'viewer'} onClick={() => switchView(view === 'viewer' ? 'edit' : 'viewer')}>
            {view === 'viewer' ? 'Back to editing' : 'Preview zoomed'}
          </Button>
        </ButtonRow>
      </InspectorSection>
      <div className="pt-3">
        <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={() => setStepZoom(step.id, null)}>
          Remove zoom
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
      <ParamRow key={label} label={label} value={Math.round(value * size)} min={opts.min ?? 0} max={opts.max ?? size} unit="px" onChange={v => set(Math.min(1, Math.max(0, v / size)))} />
    );
  };

  const geometry = ((): ReactNode => {
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
    const fit = (r: Rect): Rect => [Math.min(r[0], 1 - r[2]), Math.min(r[1], 1 - r[3]), r[2], r[3]];
    return [
      px('X', rx, 'x', n => edit({ rect: fit([n, ry, rw, rh]) })),
      px('Y', ry, 'y', n => edit({ rect: fit([rx, n, rw, rh]) })),
      px('Width', rw, 'x', n => edit({ rect: [rx, ry, Math.min(n, 1 - rx), rh] }), { min: 8 }),
      px('Height', rh, 'y', n => edit({ rect: [rx, ry, rw, Math.min(n, 1 - ry)] }), { min: 8 }),
    ];
  })();

  return (
    <div>
      <Title title={TYPE_LABEL[a.type]} />
      <Help>Drag it on the frame to move it.</Help>
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
        <InspectorSection id="ann-reveal" title="Reveal">
          <SelectField label="Appears" value={String(a.reveal)} options={REVEAL_OPTIONS} onChange={v => updateAnnotation(step.id, a.id, { reveal: Number(v) }, 'Change reveal order')} />
          <Help>Groups appear one after another when the guide reaches the step. Empty groups take no time.</Help>
        </InspectorSection>
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

// ----- clips and gaps -------------------------------------------------------------------------------------------------

function speedText(speed: number): string {
  if (Math.abs(speed - 1 / 3) < 1e-6) return '⅓×';
  if (Math.abs(speed - 0.5) < 1e-6) return '½×';
  return `${Math.round(speed * 100) / 100}×`;
}

function ClipPanel({ project, clip, index }: { project: Project; clip: Clip; index: number }) {
  const ripple = useEditor(s => s.ripple);
  const speed = useEditSession();
  const audio = useEditSession();
  const length = clipLength(clip);

  /** A typed In or Out: refused, with the reason, when it doesn't fit. */
  const setEdge = (edge: ClipEdge, value: number): boolean | string => {
    const p = selectProject(getEditor())!;
    const limits = trimLimits(p, clip.id, edge, getEditor().ripple);
    if (!limits) return false;
    if (value < limits.min - 1e-6 || value > limits.max + 1e-6) {
      if ((edge === 'out' && limits.pinAtMin && value < limits.min) || (edge === 'in' && limits.pinAtMax && value > limits.max)) return 'A pinned step is in the way. Move or delete the step to trim past it.';
      return `That doesn't fit. ${edge === 'in' ? 'In' : 'Out'} can be ${tc(limits.min)} to ${tc(limits.max)} here.`;
    }
    trimClip(clip.id, edge, value);
    return true;
  };

  const presets = SPEED_PRESETS.map(v => ({ value: String(v), label: speedText(v) }));
  const preset = presets.find(p => Math.abs(Number(p.value) - clip.speed) < 1e-6)?.value ?? null;

  return (
    <div>
      <Title icon={<span className="grid size-6 place-items-center rounded-sm border border-clip-line bg-clip text-xs font-semibold text-fg">{index + 1}</span>} title={`Clip ${index + 1}`} sub={`${tc(clip.in)}–${tc(clip.out)} of the recording · plays ${length.toFixed(2)} s`} />
      <InspectorSection id="clip-trim" title="Trim">
        <div className="grid grid-cols-2 gap-2">
          <TimecodeField label="In" value={clip.in} format={tc} parse={parseTimecode} onCommit={v => setEdge('in', v)} onRefuse={refuse} />
          <TimecodeField label="Out" value={clip.out} format={tc} parse={parseTimecode} onCommit={v => setEdge('out', v)} onRefuse={refuse} />
        </div>
        <TimecodeField label="Plays for" value={length} format={tc} parse={parseTimecode} onCommit={v => (v <= 0 ? 'A clip needs some length.' : setEdge('out', clip.in + v * clip.speed))} onRefuse={refuse} />
        <Help>
          Drag the clip's edges on the timeline to trim. Ripple trim is {ripple ? 'on: everything after moves up' : 'off: trims leave a gap'} (⇧R). Trimmed footage is kept, so you can drag it back out.
        </Help>
      </InspectorSection>
      <InspectorSection id="clip-speed" title="Speed">
        <Segmented label="Speed presets" hideLabel options={presets} value={preset} onChange={v => setClipSpeed(clip.id, Number(v))} />
        <div {...speed.bind}>
          <ParamRow label="Speed" value={Math.round(clip.speed * 100) / 100} min={MIN_SPEED} max={MAX_SPEED} step={0.05} unit="×" defaultValue={1} onChange={v => setClipSpeed(clip.id, v, speed.key())} />
        </div>
        <Help>Steps stay on their frames whatever the speed.</Help>
      </InspectorSection>
      <InspectorSection id="clip-audio" title="Audio">
        <div {...audio.bind} className="flex flex-col gap-3">
          <ParamRow label="Volume" value={Math.round(clip.volume * 100)} min={0} max={150} unit="%" defaultValue={100} onChange={v => setClipAudio(clip.id, { volume: v / 100 }, audio.key())} />
          <Switch label="Mute" checked={clip.muted} onChange={muted => setClipAudio(clip.id, { muted })} />
        </div>
      </InspectorSection>
      <div className="flex flex-wrap gap-2 pt-3">
        <Button icon={<Icon icon={Scissors} />} shortcut={['r']} onClick={splitAtPlayhead}>
          Split at playhead
        </Button>
        <Button variant="danger" icon={<Icon icon={Trash2} />} disabled={project.timeline.length < 2} onClick={() => deleteClip(clip.id)}>
          Delete clip
        </Button>
      </div>
    </div>
  );
}

function GapPanel({ project, clip, index }: { project: Project; clip: Clip; index: number }) {
  const start = clipStarts(project.timeline)[index]! - clip.gap;
  return (
    <div>
      <Title title="Gap" sub={`${tc(start)}–${tc(start + clip.gap)} · ${clip.gap.toFixed(2)} s`} />
      <Help>{index === 0 ? 'Empty time before the first clip. It shows the first frame.' : `Empty time before clip ${index + 1}. It holds the last frame of clip ${index}.`}</Help>
      <InspectorSection id="gap-length" title="Length">
        <TimecodeField
          label="Length"
          value={clip.gap}
          format={tc}
          parse={parseTimecode}
          onCommit={v => {
            if (v < 0) return "A gap can't be shorter than nothing.";
            setGap(clip.id, v);
            return true;
          }}
          onRefuse={refuse}
        />
      </InspectorSection>
      <div className="pt-3">
        <Button variant="primary" onClick={() => setGap(clip.id, 0)}>
          Close gap
        </Button>
      </div>
    </div>
  );
}

// ----- effect regions -------------------------------------------------------------------------------------------------

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function EffectRow({ blur, effect, first, last }: { blur: Blur; effect: Effect; first: boolean; last: boolean }) {
  const info = EFFECTS[effect.type];
  const session = useEditSession();
  return (
    <li className={cx('flex flex-col gap-2 rounded-md border border-line bg-raised p-2', !effect.on && 'opacity-70')} data-effect={effect.type}>
      <div className="flex items-center gap-1">
        <label className="flex min-w-0 flex-1 items-center gap-2 font-medium text-fg">
          <input type="checkbox" checked={effect.on} onChange={e => updateEffect(blur.id, effect.id, { on: e.target.checked })} className={cx('size-4 accent-[var(--wp-sel)]', focusRing)} />
          {info.name}
        </label>
        <IconButton size="sm" label={`Move ${info.name} up`} icon={<Icon icon={ChevronUp} />} disabled={first} onClick={() => moveEffect(blur.id, effect.id, -1)} />
        <IconButton size="sm" label={`Move ${info.name} down`} icon={<Icon icon={ChevronDown} />} disabled={last} onClick={() => moveEffect(blur.id, effect.id, 1)} />
        <IconButton size="sm" label={`Remove ${info.name}`} icon={<Icon icon={Trash2} />} onClick={() => removeEffect(blur.id, effect.id)} />
      </div>
      <div {...session.bind}>
        <ParamRow label={info.label} value={effect.amount} min={0} max={100} unit={info.unit} defaultValue={info.amount} onChange={v => updateEffect(blur.id, effect.id, { amount: v }, session.key())} />
      </div>
      {info.colors && (
        <ColorSwatchPicker
          label={`${info.name} colour`}
          colors={info.colors.map(c => ({ id: c, name: capital(c), value: EFFECT_COLORS[c] }))}
          value={effect.color ?? ''}
          onChange={color => updateEffect(blur.id, effect.id, { color })}
        />
      )}
    </li>
  );
}

function EffectPanel({ project, blur, source }: { project: Project; blur: Blur; source: Source }) {
  const playhead = useEditor(s => s.playhead);
  const name = useEditSession();
  const look = useEditSession();
  const fades = useEditSession();
  const geometry = useEditSession();
  const tl = (t: number) => srcToTl(project.timeline, source.id, t);
  const src = (t: number) => tlToSrc(project.timeline, t)?.time ?? 0;
  const start = tl(blur.start), end = tl(blur.end);
  const total = totalDuration(project);
  const layers = topLayer(project.blurs) + 1;
  const ends = layerEnd(project.blurs, blur.id);
  const now = sourceTimeAt(project, playhead);
  const rect = blurRectAt(blur, now);
  const keyframeHere = blurKeyframeHere(blur);
  const [W, H] = source.size;
  const [adding, setAdding] = useState('');

  /** typed timing, in timeline time; refused when it would run past the end, into its neighbour or below the minimum length */
  const time = (from: number, to: number): boolean | string => {
    if (from < -1e-6 || to > total + 1e-6) return `That's outside the guide (0:00.00 to ${tc(total)}).`;
    if (to - from < MIN_REGION - 1e-6) return 'An effect region needs to be at least 0.1 s long.';
    placeBlur(blur.id, { start: src(Math.max(0, from)), end: src(Math.min(total, to)), shift: false });
    const after = selectProject(getEditor())?.blurs.find(b => b.id === blur.id);
    if (after && (Math.abs(tl(after.start) - from) > 0.02 || Math.abs(tl(after.end) - to) > 0.02)) notify('It stops at the next region on its layer.', 'info');
    return true;
  };

  const setRect = (i: 0 | 1 | 2 | 3, px: number) => {
    const size = i % 2 ? H : W;
    const n = px / size;
    const r: Rect = [...rect];
    if (i < 2) r[i] = Math.min(Math.max(0, n), 1 - r[i + 2]!);
    else r[i] = Math.min(Math.max(8 / size, n), 1 - r[i - 2]!);
    setBlurRectHere(blur.id, r, 'Resize effect region', geometry.key());
  };

  return (
    <div>
      <Title icon={<Icon icon={Grid3x3} />} title={blur.name || 'Effect region'} sub={`${tc(start)}–${tc(end)} · ${(end - start).toFixed(2)} s · layer ${blur.layer + 1}`} />
      <div {...name.bind} className="pt-2">
        <TextField label="Name" maxLength={60} value={blur.name} onChange={e => updateBlur(blur.id, { name: e.target.value }, 'Rename effect region', name.key())} />
      </div>
      <InspectorSection id="blur-fx" title={`Effects · ${blur.effects.length}`}>
        {blur.effects.length ? (
          <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`Effect stack: ${effectSummary(blur)}`}>
            {blur.effects.map((e, i) => (
              <EffectRow key={e.id} blur={blur} effect={e} first={i === 0} last={i === blur.effects.length - 1} />
            ))}
          </ol>
        ) : (
          <Help>No effects, so this region leaves the recording as it is. Add one below.</Help>
        )}
        <SelectField
          label="Add an effect"
          value={adding}
          options={[{ value: '', label: 'Choose…' }, ...EFFECT_TYPES.map(t => ({ value: t, label: EFFECTS[t].name }))]}
          onChange={v => {
            setAdding('');
            if (v) addEffect(blur.id, v as EffectType);
          }}
        />
        {blur.effects.length > 1 && <Help>Effects apply from the top of the list down. Untick one to compare without it.</Help>}
        <div {...look.bind}>
          <ParamRow label="Opacity" value={Math.round(blur.opacity * 100)} min={10} max={100} unit="%" defaultValue={100} onChange={v => updateBlur(blur.id, { opacity: v / 100 }, 'Change opacity', look.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="blur-layer" title="Layer">
        <Help>
          Layer {blur.layer + 1} of {layers}. Higher layers draw on top. You can also drag the bar up or down in the Effects lane.
        </Help>
        <ButtonRow>
          <Button size="sm" disabled={ends.top} onClick={() => moveBlurLayer(blur.id, 'up')}>
            Bring forward
          </Button>
          <Button size="sm" disabled={ends.bottom} onClick={() => moveBlurLayer(blur.id, 'down')}>
            Send backward
          </Button>
        </ButtonRow>
        <ButtonRow>
          <Button size="sm" variant="ghost" disabled={ends.top} onClick={() => moveBlurLayer(blur.id, 'front')}>
            Bring to front
          </Button>
          <Button size="sm" variant="ghost" disabled={ends.bottom} onClick={() => moveBlurLayer(blur.id, 'back')}>
            Send to back
          </Button>
        </ButtonRow>
      </InspectorSection>
      <InspectorSection id="blur-timing" title="Timing">
        <div className="grid grid-cols-3 gap-2">
          <TimecodeField label="Start" value={start} format={tc} parse={parseTimecode} onCommit={v => (v > end - MIN_REGION ? 'The start has to be before the end.' : time(v, end))} onRefuse={refuse} />
          <TimecodeField label="End" value={end} format={tc} parse={parseTimecode} onCommit={v => (v < start + MIN_REGION ? 'The end has to be after the start.' : time(start, v))} onRefuse={refuse} />
          <TimecodeField label="Length" value={end - start} format={tc} parse={parseTimecode} onCommit={v => time(start, start + v)} onRefuse={refuse} />
        </div>
        <ButtonRow>
          <Button size="sm" onClick={() => time(Math.min(playhead, end - MIN_REGION), end)}>
            Start at playhead
          </Button>
          <Button size="sm" onClick={() => time(start, Math.max(playhead, start + MIN_REGION))}>
            End at playhead
          </Button>
        </ButtonRow>
        <div {...fades.bind} className="flex flex-col gap-3">
          <ParamRow label="Fade in" value={blur.fadeIn} min={0} max={3} step={0.1} unit="s" defaultValue={0} onChange={v => updateBlur(blur.id, { fadeIn: v }, 'Change fade', fades.key())} />
          <ParamRow label="Fade out" value={blur.fadeOut} min={0} max={3} step={0.1} unit="s" defaultValue={0} onChange={v => updateBlur(blur.id, { fadeOut: v }, 'Change fade', fades.key())} />
        </div>
      </InspectorSection>
      <InspectorSection id="blur-geom" title="Position and size">
        <div {...geometry.bind} className="flex flex-col gap-3">
          <ParamRow label="X" value={Math.round(rect[0] * W)} min={0} max={W} unit="px" onChange={v => setRect(0, v)} />
          <ParamRow label="Y" value={Math.round(rect[1] * H)} min={0} max={H} unit="px" onChange={v => setRect(1, v)} />
          <ParamRow label="Width" value={Math.round(rect[2] * W)} min={8} max={W} unit="px" onChange={v => setRect(2, v)} />
          <ParamRow label="Height" value={Math.round(rect[3] * H)} min={8} max={H} unit="px" onChange={v => setRect(3, v)} />
          <ParamRow label="Corner radius" value={blur.radius} min={0} max={40} unit="px" defaultValue={4} onChange={v => updateBlur(blur.id, { radius: v }, 'Change corner radius', geometry.key())} />
        </div>
        <Help>
          {blur.keyframes.length > 1
            ? `It moves between ${blur.keyframes.length} keyframes. Scrub and drag it to add another.`
            : 'Drag the box on the frame, or its handles to resize it. Scrub to another frame and drag it there to make it follow what it hides.'}
        </Help>
        {blur.keyframes.length > 1 && (
          <ButtonRow>
            <Button size="sm" disabled={keyframeHere === null} onClick={() => removeBlurKeyframeHere(blur)}>
              Delete keyframe here
            </Button>
            <Button size="sm" variant="ghost" onClick={() => flattenBlurHere(blur.id)}>
              Stop it moving
            </Button>
          </ButtonRow>
        )}
      </InspectorSection>
      <Help>Effects are burned into every export and the published guide. Nobody can remove them afterwards.</Help>
      <div className="flex flex-wrap gap-2 pt-3">
        {(now < blur.start || now > blur.end) && (
          <Button size="sm" onClick={() => seekTimeline(start)}>
            Go to its start
          </Button>
        )}
        <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={() => removeBlur(blur.id)}>
          Delete effect region
        </Button>
      </div>
    </div>
  );
}

// ----- the Guide tab: framing, logo, player and call to action -------------------------------------------------------

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

function FramingSection({ project }: { project: Project }) {
  const frame = project.frame;
  const session = useEditSession();
  const bg = frame.background;
  const kind = bg.type;
  const image = bg.type === 'image' ? project.assets.find(a => a.id === bg.asset) : undefined;
  return (
    <InspectorSection id="guide-frame" title="Background and framing">
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
    </InspectorSection>
  );
}

function LogoSection({ project }: { project: Project }) {
  const logo = project.logo;
  const session = useEditSession();
  const asset = logo ? project.assets.find(a => a.id === logo.asset) : undefined;
  return (
    <InspectorSection id="guide-logo" title="Logo">
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
    </InspectorSection>
  );
}

/* the accents offered for the player (docs/03-design-system.md); each reads with white or ink text, picked for contrast */
const ACCENTS = [
  { id: 'coral', name: 'Coral', value: '#D13A30' },
  { id: 'lagoon', name: 'Lagoon', value: '#0B7568' },
  { id: 'iris', name: 'Iris', value: '#4F4BD6' },
  { id: 'marigold', name: 'Marigold', value: '#FFB020' },
];
const MODE_HELP: Record<PlaybackMode, string> = {
  guided: 'Stops at every step until the viewer clicks Next.',
  auto: 'Pauses on each step for its pause time, then carries on. Viewers can pause it.',
  video: 'Plays straight through, with the steps marked on its progress bar in time.',
};

function PlayerSection({ project }: { project: Project }) {
  const g = project.guide;
  return (
    <InspectorSection id="guide-player" title="Player">
      <div className="flex flex-col gap-1">
        <Segmented
          label="Playback"
          options={[
            { value: 'guided', label: 'Guided' },
            { value: 'auto', label: 'Auto' },
            { value: 'video', label: 'Video' },
          ]}
          value={g.mode}
          onChange={mode => setGuide({ mode }, 'Change playback mode')}
        />
        <Help>{MODE_HELP[g.mode]}</Help>
      </div>
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
      <ButtonRow>
        <Button size="sm" onClick={() => setPreviewOpen(true)}>
          Preview guide
        </Button>
      </ButtonRow>
    </InspectorSection>
  );
}

function CtaSection({ project }: { project: Project }) {
  const cta = project.guide.cta;
  const session = useEditSession();
  const url = cta?.url.trim() ?? '';
  const urlProblem = cta && url !== '' && !/^https?:\/\/\S+$/i.test(url) ? 'Start the address with https:// so the button can open it.' : null;
  const showAt = [{ value: 'end', label: 'On the end card' }, ...project.steps.map((s, i) => ({ value: s.id, label: `From step ${i + 1}${s.title.trim() ? `, ${s.title.trim()}` : ''}` }))];
  return (
    <InspectorSection id="guide-cta" title="Call to action">
      <Switch
        label="Show a button"
        checked={!!cta}
        onChange={on => setGuide({ cta: on ? { label: 'Try it yourself', url: '', newTab: true, showAt: 'end' } : null }, on ? 'Add call to action' : 'Remove call to action')}
        hint={cta ? undefined : 'A button to a signup, booking or documentation page, in the accent colour.'}
      />
      {cta && (
        <>
          <div {...session.bind} className="flex flex-col gap-3">
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
          <SelectField label="Show it" value={showAt.some(o => o.value === cta.showAt) ? cta.showAt : 'end'} options={showAt} onChange={v => setGuide({ cta: { ...cta, showAt: v } }, 'Move call to action')} />
          <Switch label="Open in a new tab" checked={cta.newTab} onChange={newTab => setGuide({ cta: { ...cta, newTab } }, 'Change call to action')} />
        </>
      )}
    </InspectorSection>
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
        <p className="m-0 text-fg-muted">Background, framing, logo, audio and player settings appear here once a recording is open.</p>
      </>
    );
  }
  return (
    <div>
      <h3 className="m-0 mb-1 text-md font-semibold text-fg">Guide settings</h3>
      <FramingSection project={project} />
      <LogoSection project={project} />
      <PlayerSection project={project} />
      <CtaSection project={project} />
      <InspectorSection id="guide-recording" title="Recording">
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
          <dd className="m-0 font-mono text-fg">{tc(source.duration)}</dd>
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
    </div>
  );
}
