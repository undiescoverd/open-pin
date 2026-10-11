import { ArrowUpRight, EyeOff, Flashlight, Grid3x3, Highlighter, MapPin, MessageSquare, MousePointer2, MousePointerClick, Square, ZoomIn, type LucideIcon } from 'lucide-react';

/* The canvas tools and their keys, as in docs/05-editor-interactions.md (section 9). There is no palette for them any more: the Add
   buttons at the top of the right panel place things with one click, and a tool's key still picks it, to draw the thing exactly
   where you click or drag on the frame. */
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

/** H picks the spotlight too, since Highlight starts as one. */
const ALIASES: Readonly<Record<string, ToolId>> = { h: 'spotlight' };

/** The tool a key picks, if any. */
export function toolForKey(key: string): ToolId | undefined {
  return ALIASES[key] ?? TOOLS.find(t => t.key === key)?.id;
}

export const DRAWING_TOOLS: readonly ToolId[] = ['callout', 'arrow', 'spotlight', 'box', 'zoom', 'blur'];

/* What the Add buttons at the top of the right panel put on a step (docs/06-simplify-plan.md, "Add, then adjust"). */
export type AddKind = 'callout' | 'arrow' | 'highlight' | 'zoom' | 'hide' | 'click';

export interface AddItem {
  kind: AddKind;
  label: string;
  /** the key that picks the matching tool, to draw it exactly on the frame instead */
  key: string;
  tool: ToolId;
  icon: LucideIcon;
}

export const ADD_ITEMS: readonly AddItem[] = [
  { kind: 'callout', label: 'Callout', key: 'c', tool: 'callout', icon: MessageSquare },
  { kind: 'arrow', label: 'Arrow', key: 'a', tool: 'arrow', icon: ArrowUpRight },
  { kind: 'highlight', label: 'Highlight', key: 'h', tool: 'spotlight', icon: Highlighter },
  { kind: 'zoom', label: 'Zoom', key: 'z', tool: 'zoom', icon: ZoomIn },
  { kind: 'hide', label: 'Hide', key: 'x', tool: 'blur', icon: EyeOff },
  { kind: 'click', label: 'Click', key: 'p', tool: 'pin', icon: MousePointerClick },
];
