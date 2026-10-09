import { cx } from './cx';
import { formatShortcut, type Platform } from './keys';

export interface KeyCapProps {
  /** platform-neutral keys, e.g. ['mod', 'k'] or ['shift', 'p'] */
  keys: readonly string[];
  /** defaults to the visitor's platform */
  platform?: Platform;
  /** `inverse` sits on dark tooltips */
  tone?: 'default' | 'inverse';
  className?: string;
}

/** A shortcut hint: ⌘K on a Mac, Ctrl+K elsewhere. Screen readers hear the spelled-out version. */
export function KeyCap({ keys, platform, tone = 'default', className }: KeyCapProps) {
  const { text, spoken } = formatShortcut(keys, platform);
  return (
    <kbd
      className={cx(
        'inline-block min-w-[18px] rounded-[4px] border px-[5px] text-center font-ui text-xs leading-4 font-medium',
        tone === 'inverse' ? 'border-on-inverse/30 text-on-inverse/80' : 'border-line bg-raised text-fg-muted',
        className,
      )}
    >
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spoken}</span>
    </kbd>
  );
}
