import { ArrowUpRight, Flashlight, Grid3x3, MapPin, MessageSquare, MousePointer2, Square, ZoomIn, type LucideIcon } from 'lucide-react';

/* The canvas tools and their keys, as in docs/05-editor-interactions.md (section 9). */
export type ToolId = 'select' | 'pin' | 'callout' | 'arrow' | 'spotlight' | 'box' | 'zoom' | 'blur';

export interface Tool {
  id: ToolId;
  label: string;
  key: string;
  icon: LucideIcon;
}

export const TOOLS: readonly Tool[] = [
  { id: 'select', label: 'Select', key: 'v', icon: MousePointer2 },
  { id: 'pin', label: 'Pin', key: 'p', icon: MapPin },
  { id: 'callout', label: 'Callout', key: 'c', icon: MessageSquare },
  { id: 'arrow', label: 'Arrow', key: 'a', icon: ArrowUpRight },
  { id: 'spotlight', label: 'Spotlight', key: 's', icon: Flashlight },
  { id: 'box', label: 'Box', key: 'b', icon: Square },
  { id: 'zoom', label: 'Zoom', key: 'z', icon: ZoomIn },
  { id: 'blur', label: 'Blur', key: 'x', icon: Grid3x3 },
];
