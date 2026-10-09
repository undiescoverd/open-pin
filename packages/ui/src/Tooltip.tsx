import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';
import { KeyCap } from './KeyCap';

/** Wrap the app once. Moving between tooltips after the first one opens is instant. */
export function TooltipProvider({ children, delayDuration = 400 }: { children: ReactNode; delayDuration?: number }) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={250}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  /** shown as a key cap after the text */
  shortcut?: readonly string[];
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** a single focusable element */
  children: ReactElement;
}

/** A short label on hover or keyboard focus. Needs a TooltipProvider above it. */
export function Tooltip({ content, shortcut, side = 'bottom', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-w-xs items-center gap-2 rounded-sm bg-inverse px-2 py-1 font-ui text-sm text-on-inverse shadow-pop"
        >
          {content}
          {shortcut && <KeyCap keys={shortcut} tone="inverse" />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
