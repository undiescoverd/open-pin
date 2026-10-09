import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export type SurfaceVariant = 'panel' | 'raised' | 'floating';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  variant?: SurfaceVariant;
  as?: 'div' | 'section' | 'aside' | 'header' | 'main' | 'nav' | 'footer';
}

const VARIANTS: Record<SurfaceVariant, string> = {
  /** the editor's main panes */
  panel: 'rounded-lg border border-line bg-panel shadow-panel',
  /** wells inside a panel: inputs, lanes, cards */
  raised: 'rounded-md border border-line bg-raised',
  /** toolbars and popovers over the canvas: translucent and blurred */
  floating: 'rounded-lg border border-line bg-glass shadow-pop backdrop-blur-md',
};

export function Surface({ variant = 'panel', as: Tag = 'div', className, ...rest }: SurfaceProps) {
  return <Tag className={cx(VARIANTS[variant], className)} {...rest} />;
}
