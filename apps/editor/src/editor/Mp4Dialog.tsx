import { exportPlan, formatTimecode, outputSizeForHeight } from '@waypost/core';
import { Button, Dialog, Icon, Segmented, Switch } from '@waypost/ui';
import { Film } from 'lucide-react';
import { useState } from 'react';
import { exportMp4 } from '../state/exporting';
import { selectProject, setExportOpen, useEditor } from '../state/store';

/* Export › MP4 video (F13): the size, captions and sound, with the length and pixel size it will come out at. */

const HEIGHTS = [
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '1440', label: '1440p' },
  { value: '2160', label: '4K' },
] as const;

export function Mp4Dialog() {
  const open = useEditor(s => s.exportOpen);
  const project = useEditor(selectProject);
  const [height, setHeight] = useState<(typeof HEIGHTS)[number]['value']>('1080');
  const [captions, setCaptions] = useState(true);
  const [audio, setAudio] = useState(true);
  const source = project?.sources[0];
  const plan = project ? exportPlan(project) : null;
  const [w, h] = project && source ? outputSizeForHeight(project.frame, source.size, Number(height)) : [0, 0];
  const holds = plan?.items.filter(i => i.kind === 'hold').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setExportOpen} title="Export MP4 video" description="The guide as a video, pausing on every step, with your framing, effects and annotations." size="sm">
      <div className="flex flex-col gap-4">
        <Segmented label="Size" options={HEIGHTS} value={height} onChange={setHeight} />
        <Switch label="Step titles as captions" checked={captions} onChange={setCaptions} />
        <Switch label="The recording's own sound" checked={audio} onChange={setAudio} hint="Sped-up and slowed clips are silent." />
        {plan && (
          <p className="m-0 text-fg-muted">
            {w} × {h} · {formatTimecode(plan.duration)} long, with {holds} step pause{holds === 1 ? '' : 's'}.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExportOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Icon icon={Film} />}
            disabled={!project}
            onClick={() => {
              setExportOpen(false);
              void exportMp4({ height: Number(height) as 720 | 1080 | 1440 | 2160, fps: 30, captions, audio });
            }}
          >
            Export
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
