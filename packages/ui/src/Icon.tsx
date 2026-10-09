import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  size?: 14 | 16 | 20;
  /** give a label only when the icon carries meaning on its own; otherwise it is hidden from screen readers */
  label?: string;
  className?: string;
}

/** Lucide icons at the kit's fixed sizes and stroke. */
export function Icon({ icon: Glyph, size = 16, label, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.8} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} className={className} focusable="false" />;
}
