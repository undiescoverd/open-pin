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
  /** also show the label beside the icon (the picked tool in a toolbar); the accessible name is the label either way */
  showLabel?: boolean;
  /** classes for the visible label, e.g. to hide it when there is no room */
  labelClassName?: string;
}

/** An icon-only button. It always has a tooltip, and its shortcut, if any, is shown there and exposed to assistive tech. */
export function IconButton({ label, icon, shortcut, size = 'md', variant = 'ghost', pressed, tooltipSide, showLabel, labelClassName, type = 'button', className, ...rest }: IconButtonProps) {
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
          size === 'sm' ? 'h-7' : 'h-8',
          showLabel ? 'gap-1.5 pr-2.5 pl-2' : size === 'sm' ? 'w-7' : 'w-8',
          focusRing,
          className,
        )}
        {...rest}
      >
        {icon}
        {showLabel && <span className={cx('text-sm font-semibold', labelClassName)}>{label}</span>}
      </button>
    </Tooltip>
  );
}
