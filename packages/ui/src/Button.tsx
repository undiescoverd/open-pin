import type { ComponentProps, ReactNode } from 'react';
import { cx, focusRing } from './cx';
import { KeyCap } from './KeyCap';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** an icon before the label */
  icon?: ReactNode;
  /** a key cap after the label, e.g. ['shift', 'p'] */
  shortcut?: readonly string[];
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border-line-strong bg-panel text-fg hover:bg-raised',
  ghost: 'border-transparent bg-transparent text-fg hover:bg-raised',
  danger: 'border-transparent bg-transparent text-danger hover:bg-danger-tint',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-sm',
  md: 'h-8 gap-1.5 px-3 text-base',
  lg: 'h-10 gap-2 px-4 text-md',
};

/** Coral `primary` is for the one main action in view (Share, Pin step); everything else is secondary or ghost. */
export function Button({ variant = 'secondary', size = 'md', icon, shortcut, type = 'button', className, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors duration-[var(--wp-motion-ui)] ease-ui select-none',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-raised disabled:text-fg-disabled',
        focusRing,
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {shortcut && <KeyCap keys={shortcut} className={variant === 'primary' ? 'border-on-primary/40 bg-transparent text-on-primary/85' : undefined} />}
    </button>
  );
}
