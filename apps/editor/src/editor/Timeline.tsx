import { formatTimecode } from '@waypost/core';
import { Icon, IconButton, Surface } from '@waypost/ui';
import { ChevronLeft, ChevronRight, Film, Grid3x3, Magnet, MapPin, Mic, Music, Play, SkipBack, SkipForward, StretchHorizontal, type LucideIcon } from 'lucide-react';

const LANES: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: 'Video', icon: Film },
  { label: 'Steps', icon: MapPin },
  { label: 'Blur', icon: Grid3x3 },
  { label: 'Voice', icon: Mic },
  { label: 'Music', icon: Music },
];

interface TimelineProps {
  snap: boolean;
  ripple: boolean;
  onToggleSnap: () => void;
  onToggleRipple: () => void;
}

export function Timeline({ snap, ripple, onToggleSnap, onToggleRipple }: TimelineProps) {
  return (
    <Surface as="section" aria-label="Timeline" className="flex min-w-0 flex-col overflow-hidden [grid-area:tl]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-3 py-2">
        <output className="font-mono text-sm tabular-nums text-fg" aria-label="Playhead position and length">
          {formatTimecode(0)} <span className="text-fg-muted">/ {formatTimecode(0)}</span>
        </output>
        <div className="flex items-center gap-1" role="group" aria-label="Transport">
          <IconButton label="Previous step" shortcut={['alt', 'left']} icon={<Icon icon={SkipBack} />} disabled />
          <IconButton label="Previous frame" shortcut={['left']} icon={<Icon icon={ChevronLeft} />} disabled />
          <IconButton label="Play" shortcut={['space']} variant="secondary" icon={<Icon icon={Play} />} disabled className="rounded-pill" />
          <IconButton label="Next frame" shortcut={['right']} icon={<Icon icon={ChevronRight} />} disabled />
          <IconButton label="Next step" shortcut={['alt', 'right']} icon={<Icon icon={SkipForward} />} disabled />
        </div>
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Snapping" shortcut={['n']} size="sm" icon={<Icon icon={Magnet} />} pressed={snap} onClick={onToggleSnap} />
          <IconButton label="Ripple trim" shortcut={['shift', 'r']} size="sm" icon={<Icon icon={StretchHorizontal} />} pressed={ripple} onClick={onToggleRipple} />
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2" role="list" aria-label="Lanes">
        <div className="ml-[92px] h-5 rounded-sm bg-raised" aria-hidden="true" />
        {LANES.map(lane => (
          <div key={lane.label} role="listitem" className="flex items-center gap-2">
            <span className="flex w-[84px] shrink-0 items-center gap-1.5 text-sm text-fg-muted">
              <Icon icon={lane.icon} size={14} />
              {lane.label}
            </span>
            <div className="h-7 flex-1 rounded-sm bg-raised" aria-label={`${lane.label} lane, empty`} />
          </div>
        ))}
      </div>
    </Surface>
  );
}
