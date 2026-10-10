import { formatTimecode, nativeOutputSize, stepShown, type Step } from '@waypost/core';
import type { MediaHandle } from '@waypost/media';
import { composeScene, sceneFor } from '@waypost/render';
import { Button, Icon, KeyCap, Surface, cx, focusRing } from '@waypost/ui';
import { Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pinAtPlayhead, selectProject, selectStep, useEditor } from '../state/store';

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
          Pin step
        </Button>
      </div>
      {steps.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 p-5 text-center text-fg-muted">
          <p className="m-0 font-medium text-fg">No steps yet</p>
          <p className="m-0">
            Open a recording, then use the Pin tool <KeyCap keys={['p']} /> to pin the moments viewers should click.
          </p>
        </div>
      ) : (
        <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-auto p-2">
          {steps.map((step, i) => {
            const active = selection !== null && 'stepId' in selection && selection.stepId === step.id;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  onClick={() => selectStep(step.id)}
                  className={cx(
                    'flex w-full flex-col gap-1.5 rounded-md border p-2 text-left',
                    active ? 'border-pin-line bg-pin-tint' : 'border-line bg-raised hover:border-line-strong',
                    focusRing,
                  )}
                >
                  <StepThumb step={step} />
                  <span className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-pill bg-pin text-xs font-semibold text-on-pin">{i + 1}</span>
                    <span className={cx('min-w-0 flex-1 truncate font-medium', step.title ? 'text-fg' : 'text-fg-muted')}>{step.title || `Step ${i + 1}`}</span>
                    <span className="font-mono text-xs tabular-nums text-fg-muted">{formatTimecode(step.anchor.time)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}
