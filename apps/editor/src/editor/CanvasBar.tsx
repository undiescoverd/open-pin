import { type Aspect, type GradientPreset, type Project } from '@waypost/core';
import { GRADIENTS } from '@waypost/render';
import { Button, Icon, Segmented } from '@waypost/ui';
import { Palette } from 'lucide-react';
import { selectProject, setFrame, setRightTab, useEditor } from '../state/store';

/* The canvas bar (docs/06-simplify-plan.md, "The canvas"): directly above the frame, always in view. The shape is one click on
   visible buttons; Style brings up the rest (background, frame, annotation colour, logo) in the right panel, beside the frame, so a
   change can be watched as it is made. What the frame shows is what every export draws, so nothing about the canvas is chosen in Export. */

const SHAPES: ReadonlyArray<{ value: Aspect; label: string; title: string }> = [
  { value: 'source', label: 'Original', title: 'The recording’s own shape' },
  { value: '16:9', label: '16:9', title: 'Widescreen' },
  { value: '4:3', label: '4:3', title: 'Standard' },
  { value: '1:1', label: '1:1', title: 'Square' },
  { value: '4:5', label: '4:5', title: 'Portrait' },
];

const gradientCss = (g: GradientPreset): string => `linear-gradient(135deg, ${GRADIENTS[g].stops[0]}, ${GRADIENTS[g].stops[1]})`;

/** What the Style button shows of the background, so the current look is visible without opening anything. */
function backgroundCss(project: Project): string {
  const bg = project.frame.background;
  if (bg.type === 'gradient') return gradientCss(bg.preset);
  if (bg.type === 'color') return bg.color;
  return '#0E1116';
}

export function CanvasBar({ width }: { width: number }) {
  const project = useEditor(selectProject);
  const showing = useEditor(s => s.rightTab === 'canvas');
  if (!project) return null;
  return (
    <div role="toolbar" aria-label="Canvas" className="flex shrink-0 items-center gap-2" style={{ width: width > 0 ? width : '100%' }}>
      <div className="min-w-0 flex-1 sm:max-w-[26rem]">
        <Segmented label="Shape" hideLabel options={SHAPES} value={project.frame.aspect} onChange={aspect => setFrame({ aspect }, 'Change shape')} />
      </div>
      <Button
        size="sm"
        className="ml-auto shrink-0"
        aria-pressed={showing}
        title="Background, frame, annotation colour and logo"
        icon={<span aria-hidden="true" className="size-4 rounded-pill border border-line-strong" style={{ background: backgroundCss(project) }} />}
        onClick={() => setRightTab('canvas')}
      >
        Style
        <Icon icon={Palette} size={14} className="text-fg-muted" />
      </Button>
    </div>
  );
}
