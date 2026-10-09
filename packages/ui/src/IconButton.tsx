import type { ComponentProps, ReactNode } from 'react';
import { cx, focusRing } from './cx';
import { formatShortcut } from './keys';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label' | 'children'> {
  /** required: it is the accessible name and the tooltip text */
  label: string;
  icon: ReactNode;
  shortcut?: readonly string[];
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary';
  /** set for toggles and tools; renders aria-pressed */
  pressed?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/** An icon-only button. It always has a tooltip, and its shortcut, if any, is shown there and exposed to assistive tech. */
export function IconButton({ label, icon, shortcut, size = 'md', variant = 'ghost', pressed, tooltipSide, type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut ? formatShortcut(shortcut).aria : undefined}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-md border text-fg transition-colors duration-[var(--wp-motion-ui)] ease-ui',
          'hover:bg-raised aria-pressed:bg-sel-tint aria-pressed:text-sel-strong',
          'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-fg-disabled',
          variant === 'secondary' ? 'border-line-strong bg-panel' : 'border-transparent bg-transparent',
          size === 'sm' ? 'size-7' : 'size-8',
          focusRing,
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
