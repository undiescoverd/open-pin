import { REVEAL_GROUPS, formatTimecode, nativeOutputSize, parseTimecode, srcToTl, stepShown, tlToSrc, type Project, type Step } from '@waypost/core';
import type { MediaHandle } from '@waypost/media';
import { composeScene, sceneFor } from '@waypost/render';
import { Advanced, Button, Icon, KeyCap, ParamRow, SelectField, Surface, TextArea, TextField, TimecodeField, cx, focusRing } from '@waypost/ui';
import { Copy, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  duplicateStep,
  moveStep,
  notify,
  pinAtPlayhead,
  selectAnnotation,
  selectProject,
  selectStep,
  selectZoom,
  seekSource,
  setStepHold,
  setStepText,
  totalDuration,
  updateAnnotation,
  useEditor,
} from '../state/store';
import { TYPE_LABEL, annotationName } from './annotationNames';
import { useEditSession } from './useEditSession';

/* Small frames, cached per recording so changing an annotation never decodes the video again. */
const frames = new WeakMap<MediaHandle, Map<number, ImageBitmap>>();
const THUMB_WIDTH = 320;

async function thumbFrame(media: MediaHandle, index: number): Promise<ImageBitmap> {
  let cache = frames.get(media);
  if (!cache) frames.set(media, (cache = new Map()));
  const hit = cache.get(index);
  if (hit) return hit;
  const bitmap = await media.frame(index, THUMB_WIDTH);
  cache.set(index, bitmap);
  return bitmap;
}

/** The step as the guide shows it, framed, with its effects, zoom, annotations and logo. */
function StepThumb({ step }: { step: Step }) {
  const media = useEditor(s => s.media);
  const canvas = useRef<HTMLCanvasElement>(null);
  const project = useEditor(selectProject);
  const assets = useEditor(s => s.assetImages);
  const source = project?.sources[0];
  const native = source && project ? nativeOutputSize(project.frame, source.size) : [16, 10];
  const width = THUMB_WIDTH;
  const height = Math.round((width * native[1]!) / native[0]!);
  const blurs = project?.blurs, frame = project?.frame, logo = project?.logo;
  useEffect(() => {
    const el = canvas.current;
    const p = selectProject(useEditor.getState());
    if (!media || !el || !p) return;
    let cancelled = false;
    void thumbFrame(media, media.index.indexAt(step.anchor.time)).then(bitmap => {
      if (cancelled) return;
      const scene = sceneFor(p, { frame: bitmap, sourceTime: step.anchor.time, step, look: stepShown(step), assets: useEditor.getState().assetImages });
      composeScene(el.getContext('2d')!, width, height, scene);
    });
    return () => {
      cancelled = true;
    };
  }, [media, step, blurs, frame, logo, assets, width, height]);
  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" className="block h-auto w-full rounded-sm bg-raised" />;
}

const REVEAL_OPTIONS = Array.from({ length: REVEAL_GROUPS }, (_, g) => ({ value: String(g), label: g === 0 ? 'With the step' : `Then, group ${g + 1}` }));
const tc = (t: number): string => formatTimecode(t);

/** One line for the closed row, e.g. "Click marker · Callout · Zoom". */
function stepSummary(step: Step): string {
  const parts = [...new Set(step.annotations.map(a => TYPE_LABEL[a.type]))];
  if (step.zoom) parts.push('Zoom');
  return parts.length ? parts.join(' · ') : 'Nothing added yet';
}

/** How the step behaves, in plain words. */
function behaviour(step: Step): string {
  const seconds = `${Math.round(step.minHold * 10) / 10} s`;
  return `Waits for a click, or ${seconds} in a video`;
}

/* The selected step, opened in place (docs/06-simplify-plan.md, "Editing a step"): its words, what is on it, how it behaves, and under
   Advanced the exact time, the pause and when each annotation appears. */
function StepCard({ project, step, number }: { project: Project; step: Step; number: number }) {
  const media = useEditor(s => s.media);
  const text = useEditSession();
  const hold = useEditSession();
  const refuse = (m: string): void => notify(m, 'error');

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

  const chips = [
    ...step.annotations.map(a => ({ key: a.id, label: annotationName(a), open: () => selectAnnotation(step.id, a.id) })),
    ...(step.zoom ? [{ key: 'zoom', label: 'Zoom', open: () => selectZoom(step.id) }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-line p-2 pt-3">
      <div {...text.bind} className="flex flex-col gap-3">
        <TextField label="Title" placeholder={`Step ${number}`} maxLength={120} value={step.title} onChange={e => setStepText(step.id, { title: e.target.value }, text.key())} />
        <TextArea label="Note" placeholder="Add a sentence of context (optional)" maxLength={2000} value={step.body} onChange={e => setStepText(step.id, { body: e.target.value }, text.key())} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg-muted">On this step</span>
        {chips.length === 0 ? (
          <span className="text-sm text-fg-muted">Nothing yet. Add a callout, highlight or zoom from the panel on the right.</span>
        ) : (
          <div role="group" aria-label="On this step" className="flex flex-wrap gap-1">
            {chips.map(c => (
              <button key={c.key} type="button" onClick={c.open} className={cx('min-w-0 max-w-full truncate rounded-pill border border-line-strong bg-panel px-2 py-0.5 text-sm text-fg hover:border-pin-line', focusRing)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm text-fg-muted">{behaviour(step)}</span>
        <Button size="sm" icon={<Icon icon={Copy} size={14} />} title="Copy this step onto the frame at the playhead (⌘D)" onClick={() => duplicateStep(step.id)}>
          Duplicate
        </Button>
      </div>
      <Advanced id="step-card" summary="Exact time, pause, appearing order" className="-mx-0">
        <TimecodeField label="Position" value={srcToTl(project.timeline, step.anchor.source, step.anchor.time)} format={tc} parse={parseTimecode} onCommit={place} onRefuse={refuse} />
        <div {...hold.bind}>
          <ParamRow label="Pause" value={step.minHold} min={1} max={8} step={0.1} unit="s" defaultValue={2.5} onChange={v => setStepHold(step.id, v, hold.key())} />
        </div>
        {step.annotations.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg-muted">When each appears</span>
            {step.annotations.map(a => (
              <SelectField
                key={a.id}
                label={annotationName(a)}
                value={String(a.reveal)}
                options={REVEAL_OPTIONS}
                onChange={v => updateAnnotation(step.id, a.id, { reveal: Number(v) }, 'Change reveal order')}
              />
            ))}
          </div>
        )}
      </Advanced>
    </div>
  );
}

export function StepRail() {
  const project = useEditor(selectProject);
  const selection = useEditor(s => s.selection);
  const phase = useEditor(s => s.phase);
  const steps = project?.steps ?? [];

  return (
    <Surface as="aside" aria-labelledby="steps-heading" className="flex min-h-0 min-w-0 flex-col overflow-hidden [grid-area:steps]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="steps-heading" className="m-0 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
          Steps <span className="ml-1 font-normal">{steps.length}</span>
        </h2>
        <Button size="sm" icon={<Icon icon={Plus} size={14} />} shortcut={['shift', 'p']} disabled={phase !== 'ready'} onClick={() => pinAtPlayhead()}>
          Add step
        </Button>
      </div>
      {steps.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 p-5 text-center text-fg-muted">
          <p className="m-0 font-medium text-fg">No steps yet</p>
          <p className="m-0">
            Press Add step <KeyCap keys={['shift', 'p']} /> where viewers should click, or use the Pin tool <KeyCap keys={['p']} />.
          </p>
        </div>
      ) : (
        <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-auto p-2">
          {steps.map((step, i) => {
            const active = selection !== null && 'stepId' in selection && selection.stepId === step.id;
            return (
              <li key={step.id} className={cx('overflow-hidden rounded-md border', active ? 'border-pin-line bg-pin-tint' : 'border-line bg-raised hover:border-line-strong')}>
                <button type="button" aria-current={active ? 'step' : undefined} onClick={() => selectStep(step.id)} className={cx('flex w-full flex-col gap-1.5 border-0 bg-transparent p-2 text-left', focusRing)}>
                  <StepThumb step={step} />
                  <span className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-pill bg-pin text-xs font-semibold text-on-pin">{i + 1}</span>
                    <span className={cx('min-w-0 flex-1 truncate font-medium', step.title ? 'text-fg' : 'text-fg-muted')}>{step.title || `Step ${i + 1}`}</span>
                    <span className="font-mono text-xs tabular-nums text-fg-muted">{formatTimecode(step.anchor.time)}</span>
                  </span>
                  <span className="truncate text-sm text-fg-muted">{stepSummary(step)}</span>
                </button>
                {active && project && <StepCard key={step.id} project={project} step={step} number={i + 1} />}
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}
