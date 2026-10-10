import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** one line under the title; also read out by screen readers */
  description?: string;
  children: ReactNode;
  /** width of the panel */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const WIDTHS = { sm: 'w-[380px]', md: 'w-[560px]', lg: 'w-[760px]', xl: 'w-[1080px]' };

/** A modal panel. Focus is trapped inside while it is open, Esc closes it, and keyboard shortcuts in the app pause. */
export function Dialog({ open, onOpenChange, title, description, children, size = 'md' }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          className={cx(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-panel shadow-pop outline-none',
            WIDTHS[size],
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="m-0 text-lg font-semibold text-fg">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="m-0 mt-0.5 text-fg-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={<Icon icon={X} />} size="sm" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
