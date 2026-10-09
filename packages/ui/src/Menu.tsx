import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx';
import { KeyCap } from './KeyCap';

export interface MenuProps {
  /** the button that opens the menu (a single element) */
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A dropdown menu with arrow-key navigation and type-ahead, from Radix. */
export function Menu({ trigger, children, align = 'end', open, onOpenChange }: MenuProps) {
  return (
    <RadixMenu.Root open={open} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 min-w-[220px] rounded-lg border border-line bg-panel p-1 shadow-pop"
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  shortcut?: readonly string[];
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}

export function MenuItem({ icon, shortcut, disabled, onSelect, children }: MenuItemProps) {
  return (
    <RadixMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cx(
        'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-base text-fg outline-none select-none',
        'data-[highlighted]:bg-raised data-[disabled]:text-fg-disabled',
      )}
    >
      {icon && <span className="grid size-4 place-items-center text-fg-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <KeyCap keys={shortcut} />}
    </RadixMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="px-2 pt-2 pb-1 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{children}</RadixMenu.Label>;
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-line" />;
}
