import {
  EFFECTS,
  EFFECT_COLORS,
  EFFECT_TYPES,
  HIDE_LOOKS,
  HIDE_MIN_STRENGTH,
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
  hideLook,
  hideSpanOf,
  layerEnd,
  parseTimecode,
  srcToTl,
  stepSpanAt,
  tlToSrc,
  topLayer,
  trimLimits,
  zoomAmount,
  zoomBox,
  type Annotation,
  type Blur,
  type CalloutPlacement,
  type Clip,
  type ClipEdge,
  type Effect,
  type EffectType,
  type HideLook,
  type HideSpan,
  type Project,
  type Rect,
  type Source,
  type Step,
} from '@waypost/core';
import { ANNOTATION_COLORS } from '@waypost/render';
import {
  Advanced,
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
import { ChevronDown, ChevronUp, EyeOff, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  addEffect,
  blurKeyframeHere,
  deleteClip,
  flattenBlurHere,
  getEditor,
  moveBlurLayer,
  moveEffect,
  notify,
  placeBlur,
  removeAnnotation,
  removeBlur,
  removeBlurKeyframeHere,
  removeEffect,
  removeStep,
  seekTimeline,
  selectedAnnotation,
  selectedBlur,
  selectedStep,
  selectProject,
  setBlurRectHere,
  setClipAudio,
  setClipSpeed,
  setRightTab,
  setGap,
  setHideLook,
  setHideSpan,
  setHighlightKind,
  setStepZoom,
  sourceTimeAt,
  splitAtPlayhead,
  totalDuration,
  trimClip,
  updateAnnotation,
  updateBlur,
  updateEffect,
  useEditor,
} from '../state/store';
import { AddButtons } from './AddPanel';
import { CanvasPanel } from './CanvasPanel';
import { useEditSession } from './useEditSession';
import { switchView } from './visible';

const TABS = [
  { id: 'selection', label: 'Inspector' },
  { id: 'canvas', label: 'Canvas' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tc = (t: number): string => formatTimecode(t);
const refuse = (m: string): void => notify(m, 'error');

/* Context inspector (docs/03-design-system.md; docs/05-editor-interactions.md, section 7): the first tab edits whatever is
   selected, the second is the canvas: its background, frame and logo, and the recording and saving. A new project opens on the
   canvas; selecting something shows the Inspector. Selecting something new scrolls the panel to the top. */
export function Inspector() {
  const tab = useEditor(s => s.rightTab);
  const setTab = setRightTab;
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ selection: null, canvas: null });
  const panel = useRef<HTMLDivElement>(null);
  const selection = useEditor(s => s.selection);
  const selectionKey = selection ? JSON.stringify(selection) : '';

  /* a new selection shows the Inspector tab, scrolled to the top */
  useEffect(() => {
    if (selectionKey) setRightTab('selection');
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
          {t.id === 'selection' ? <SelectionPanel /> : <CanvasPanel />}
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
  return (
    <div className="flex flex-col gap-4">
      <AddButtons />
      <div className="border-t border-line pt-3">
        <SelectedItem />
      </div>
    </div>
  );
}

function SelectedItem() {
  const project = useEditor(selectProject);
  const selection = useEditor(s => s.selection);
  if (!project || !selection) {
    return (
      <>
        <h3 className="m-0 mb-1 text-md font-semibold text-fg">Nothing selected</h3>
        <p className="m-0 text-fg-muted">Add something above, or click a step or something on the frame to adjust it here.</p>
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
      return selection.kind === 'clip' ? <ClipPanel key={clip.id} project={project} clip={clip} index={index} /> : <GapPanel key={clip.id} project={project} clip={clip} index={index} />;
    }
    case 'blur': {
      const blur = selectedBlur(project, selection);
      return blur ? <HidePanel key={blur.id} project={project} blur={blur} source={source} /> : null;
    }
    default: {
      const step = selectedStep(project, selection);
      if (!step) return null;
      const number = project.steps.findIndex(s => s.id === step.id) + 1;
      if (selection.kind === 'zoom' && step.zoom) return <ZoomPanel key={step.id} step={step} number={number} source={source} />;
      const annotation = selectedAnnotation(project, selection);
      return annotation ? <AnnotationPanel key={annotation.id} step={step} number={number} annotation={annotation} source={source} /> : <StepPanel key={step.id} step={step} number={number} />;
    }
  }
}

/** Remove, at the end of every item's panel. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="pt-3">
      <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

// ----- step -----------------------------------------------------------------------------------------------------------

const REVEAL_OPTIONS = Array.from({ length: REVEAL_GROUPS }, (_, g) => ({ value: String(g), label: g === 0 ? 'With the step' : `Then, group ${g + 1}` }));

/* A step with nothing on it selected: its words, pause and what's on it are on the step card, so this only says where things are. */
function StepPanel({ step, number }: { step: Step; number: number }) {
  return (
    <div>
      <Title icon={<span className="grid size-6 place-items-center rounded-pill bg-pin text-sm font-semibold text-on-pin">{number}</span>} title={`Step ${number}`} sub={step.title.trim() || undefined} />
      <Help>
        {step.annotations.length || step.zoom
          ? 'Click something on the frame, or a chip on the step card, to adjust it here.'
          : 'Add a callout, a highlight or a zoom above. The title and note are on the step card.'}
      </Help>
      <RemoveButton label="Delete step" onClick={() => removeStep(step.id)} />
    </div>
  );
}

/** How close the zoom is, 1.25× to 4×: the box grows or shrinks about its centre. */
function ZoomAmount({ step, sessionKey }: { step: Step; sessionKey: () => string }) {
  const rect = step.zoom!.rect;
  const amount = Math.round(zoomAmount(rect) * 100) / 100;
  return (
    <ParamRow
      label="How close"
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

function ZoomPanel({ step, number, source }: { step: Step; number: number; source: Source }) {
  const session = useEditSession();
  const exact = useEditSession();
  const view = useEditor(s => s.view);
  const click = step.annotations.find(a => a.type === 'click');
  const rect = step.zoom!.rect;
  const [W, H] = source.size;
  /** the box's left or top edge, in pixels of the recording, kept on the frame */
  const moveTo = (i: 0 | 1, px: number) => {
    const r: Rect = [...rect];
    r[i] = Math.min(Math.max(0, px / (i === 0 ? W : H)), 1 - r[i + 2]!);
    setStepZoom(step.id, r, 'Move zoom', exact.key());
  };
  return (
    <div>
      <Title title="Zoom" sub={`Step ${number} · ${Math.round(zoomAmount(rect) * 100) / 100}×`} />
      <Help>When viewers reach the step the view eases into the box. Drag it or its handles on the frame.</Help>
      <div {...session.bind} className="flex flex-col gap-3 pt-3">
        <ZoomAmount step={step} sessionKey={session.key} />
        <ButtonRow>
          <Button size="sm" aria-pressed={view === 'viewer'} onClick={() => switchView(view === 'viewer' ? 'edit' : 'viewer')}>
            {view === 'viewer' ? 'Back to editing' : 'See it zoomed'}
          </Button>
        </ButtonRow>
      </div>
      <Advanced id="zoom" summary="Exact area, centre on the click" className="mt-3">
        <div {...exact.bind} className="flex flex-col gap-3">
          <ParamRow label="Left" value={Math.round(rect[0] * W)} min={0} max={W} unit="px" onChange={v => moveTo(0, v)} />
          <ParamRow label="Top" value={Math.round(rect[1] * H)} min={0} max={H} unit="px" onChange={v => moveTo(1, v)} />
        </div>
        <ButtonRow>
          <Button size="sm" disabled={click?.type !== 'click'} onClick={() => click?.type === 'click' && setStepZoom(step.id, zoomBox(click.at, rect[2]), 'Centre zoom')}>
            Centre on the click
          </Button>
        </ButtonRow>
      </Advanced>
      <RemoveButton label="Remove zoom" onClick={() => setStepZoom(step.id, null)} />
    </div>
  );
}

const PLACEMENTS: ReadonlyArray<{ value: CalloutPlacement; label: string }> = [
  { value: 'bottom', label: 'Below the point' },
  { value: 'top', label: 'Above the point' },
  { value: 'right', label: 'To the right' },
  { value: 'left', label: 'To the left' },
];

const SWATCHES = ANNOTATION_COLORS.map(c => ({ id: c.id, name: c.name, value: c.stroke }));

/** What each kind of annotation is called in its panel: spotlights and outlines are both Highlights, as on the Add button. */
const ITEM_NAME: Record<Annotation['type'], string> = { callout: 'Callout', arrow: 'Arrow', spotlight: 'Highlight', box: 'Highlight', click: 'Click' };
/** What's under each panel's Advanced, for its closed line. */
const ADVANCED_SUMMARY: Record<Annotation['type'], string> = {
  callout: 'Side, position, when it appears',
  arrow: 'Exact ends, when it appears',
  spotlight: 'Exact box, when it appears',
  box: 'Exact box, when it appears',
  click: 'Position, colour, when it appears',
};

/** The step's title and note, as a callout's words. */
const stepWords = (step: Step): string => [step.title.trim(), step.body.trim()].filter(Boolean).join('\n').slice(0, 300);

function AnnotationPanel({ step, number, annotation: a, source }: { step: Step; number: number; annotation: Annotation; source: Source }) {
  const session = useEditSession();
  const [W, H] = source.size;
  const name = ITEM_NAME[a.type];
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

  const colour = 'color' in a && <ColorSwatchPicker label="Colour" colors={SWATCHES} value={a.color} onChange={color => edit({ color }, 'Change colour')} />;
  const words = stepWords(step);

  return (
    <div>
      <Title title={name} sub={`Step ${number}`} />
      <Help>Drag it on the frame to move it.</Help>
      <div {...session.bind} className="flex flex-col gap-3 pt-3">
        {a.type === 'callout' && (
          <>
            <TextArea label="Words" maxLength={300} value={a.text} onChange={e => edit({ text: e.target.value })} />
            <ButtonRow>
              <Button size="sm" disabled={!words || words === a.text} onClick={() => updateAnnotation(step.id, a.id, { text: words }, "Use the step's words")}>
                Use the step's title and note
              </Button>
            </ButtonRow>
          </>
        )}
        {(a.type === 'spotlight' || a.type === 'box') && (
          <Segmented
            label="Look"
            options={[
              { value: 'spotlight', label: 'Spotlight', title: 'The rest of the frame is dimmed' },
              { value: 'box', label: 'Outline', title: 'A box drawn around it' },
            ]}
            value={a.type}
            onChange={kind => setHighlightKind(step.id, a.id, kind)}
          />
        )}
        {a.type !== 'click' && colour}
      </div>
      <Advanced id={`annotation-${a.type}`} summary={ADVANCED_SUMMARY[a.type]} className="mt-3">
        {a.type === 'callout' && <SelectField label="Bubble placement" value={a.placement} options={PLACEMENTS} onChange={v => edit({ placement: v as CalloutPlacement })} />}
        {a.type === 'click' && colour}
        <div {...session.bind} className="flex flex-col gap-3">
          {geometry}
        </div>
        <SelectField label="Appears" value={String(a.reveal)} options={REVEAL_OPTIONS} onChange={v => updateAnnotation(step.id, a.id, { reveal: Number(v) }, 'Change reveal order')} />
        <Help>Groups appear one after another when the guide reaches the step.</Help>
      </Advanced>
      <RemoveButton label={`Remove ${name.toLowerCase()}`} onClick={() => removeAnnotation(step.id, a.id)} />
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

// ----- hidden areas (effect regions) ---------------------------------------------------------------------------------

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

const LOOK_OPTIONS: ReadonlyArray<{ value: HideLook; label: string; title: string }> = [
  { value: 'cover', label: 'Cover', title: 'A solid block: nothing shows through' },
  { value: 'pixelate', label: 'Pixelate', title: 'Large blocks of colour' },
  { value: 'blur', label: 'Blur', title: 'A heavy blur' },
];
const SPAN_OPTIONS: ReadonlyArray<{ value: HideSpan; label: string }> = [
  { value: 'step', label: 'This step only' },
  { value: 'rest', label: 'From here to the end' },
  { value: 'all', label: 'The whole video' },
];

/* Hide (docs/06-simplify-plan.md, "Hiding something"): the look, its strength and how long, then everything an effect region can do
   (its stack of effects, layer, exact timing, fades, position and keyframes) under Advanced. A region whose stack or timing isn't
   one of the simple choices shows no choice picked there, and keeps what it has until one is picked. */
function HidePanel({ project, blur, source }: { project: Project; blur: Blur; source: Source }) {
  const playhead = useEditor(s => s.playhead);
  const name = useEditSession();
  const look = useEditSession();
  const strength = useEditSession();
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
  const simpleLook = hideLook(blur);
  const span = hideSpanOf(project, blur);
  const effect = blur.effects[0];
  const onStep = !!stepSpanAt(project, source.id, now);

  /** typed timing, in timeline time; refused when it would run past the end, into its neighbour or below the minimum length */
  const time = (from: number, to: number): boolean | string => {
    if (from < -1e-6 || to > total + 1e-6) return `That's outside the guide (0:00.00 to ${tc(total)}).`;
    if (to - from < MIN_REGION - 1e-6) return 'A hidden area needs to be at least 0.1 s long.';
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
    setBlurRectHere(blur.id, r, 'Resize hidden area', geometry.key());
  };

  return (
    <div>
      <Title icon={<Icon icon={EyeOff} />} title="Hide" sub={`${blur.name || 'Hidden area'} · ${tc(start)}–${tc(end)}`} />
      <Help>Drag it on the frame to move it, or its handles to resize it.</Help>
      <div className="flex flex-col gap-3 pt-3">
        <Segmented label="Look" options={LOOK_OPTIONS} value={simpleLook} onChange={v => setHideLook(blur.id, v)} />
        {simpleLook === null && <Help>It has its own mix of effects, under Advanced. Pick a look to replace it.</Help>}
        {simpleLook === 'cover' && <Help>Nothing shows through a cover, so it can't leak.</Help>}
        {(simpleLook === 'pixelate' || simpleLook === 'blur') && effect && (
          <div {...strength.bind}>
            <ParamRow label="Strength" value={effect.amount} min={HIDE_MIN_STRENGTH} max={100} unit="" defaultValue={HIDE_LOOKS[simpleLook].amount} onChange={v => updateEffect(blur.id, effect.id, { amount: v }, strength.key())} />
          </div>
        )}
        <Segmented
          label="How long"
          stacked
          options={SPAN_OPTIONS.map(o => (o.value === 'step' && !onStep ? { ...o, title: 'Move to a step first' } : o))}
          value={span}
          onChange={v => setHideSpan(blur.id, v)}
        />
        <Help>
          Hidden from {tc(start)} to {tc(end)}
          {span === null ? ', its own timing. Change it under Advanced.' : '.'}
        </Help>
        <Help>Hidden areas are burned into every export and the published guide. Nobody can remove them afterwards.</Help>
      </div>
      <Advanced id="hide" summary="Effects, layers, timing, fades, position" className="mt-3">
        <div {...name.bind}>
          <TextField label="Name" maxLength={60} value={blur.name} onChange={e => updateBlur(blur.id, { name: e.target.value }, 'Rename hidden area', name.key())} />
        </div>
        <InspectorSection id="blur-fx" title={`Effects · ${blur.effects.length}`}>
          {blur.effects.length ? (
            <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`Effect stack: ${effectSummary(blur)}`}>
              {blur.effects.map((e, i) => (
                <EffectRow key={e.id} blur={blur} effect={e} first={i === 0} last={i === blur.effects.length - 1} />
              ))}
            </ol>
          ) : (
            <Help>No effects, so this area leaves the recording as it is. Add one below.</Help>
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
              : 'To follow something that moves, scrub to another frame and drag it there: it moves between the two.'}
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
      </Advanced>
      <div className="flex flex-wrap gap-2 pt-3">
        {(now < blur.start || now > blur.end) && (
          <Button size="sm" onClick={() => seekTimeline(start)}>
            Go to its start
          </Button>
        )}
        <Button variant="danger" icon={<Icon icon={Trash2} />} onClick={() => removeBlur(blur.id)}>
          Remove hidden area
        </Button>
      </div>
    </div>
  );
}
