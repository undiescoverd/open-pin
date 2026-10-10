import { ArrowUpRight, Flashlight, Grid3x3, MapPin, MessageSquare, MousePointer2, Square, ZoomIn, type LucideIcon } from 'lucide-react';

/* The canvas tools and their keys, as in docs/05-editor-interactions.md (section 9). */
export type ToolId = 'select' | 'pin' | 'callout' | 'arrow' | 'spotlight' | 'box' | 'zoom' | 'blur';

export interface Tool {
  id: ToolId;
  label: string;
  key: string;
  icon: LucideIcon;
  /** what to do with the tool, shown under the canvas while it is picked */
  hint: string;
}

export const TOOLS: readonly Tool[] = [
  { id: 'select', label: 'Select', key: 'v', icon: MousePointer2, hint: 'Click anything on the frame to select it; drag it or its handles to change it.' },
  { id: 'pin', label: 'Pin', key: 'p', icon: MapPin, hint: 'Click where the viewer should click. This frame becomes a step.' },
  { id: 'callout', label: 'Callout', key: 'c', icon: MessageSquare, hint: 'Click where the note should point.' },
  { id: 'arrow', label: 'Arrow', key: 'a', icon: ArrowUpRight, hint: 'Drag from the tail to the tip.' },
  { id: 'spotlight', label: 'Spotlight', key: 's', icon: Flashlight, hint: 'Drag over the area that should stay bright.' },
  { id: 'box', label: 'Box', key: 'b', icon: Square, hint: 'Drag a box around what matters.' },
  { id: 'zoom', label: 'Zoom', key: 'z', icon: ZoomIn, hint: 'Drag the part of the frame viewers should zoom into at this step.' },
  { id: 'blur', label: 'Blur', key: 'x', icon: Grid3x3, hint: 'Drag over what should be hidden. It lasts from here to the end.' },
];

export const DRAWING_TOOLS: readonly ToolId[] = ['callout', 'arrow', 'spotlight', 'box', 'zoom', 'blur'];
