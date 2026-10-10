import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx, focusRing } from './cx';
import { Icon } from './Icon';

/* Which Advanced sections the person has opened while working, so a section stays open as the selection moves between items. */
const opened = new Set<string>();

export interface AdvancedProps {
  /** remembers whether this section is open while you work; give each panel its own */
  id: string;
  /** one line saying what's inside while it's closed, e.g. "Exact position, size, pointer side" */
  summary: string;
  children: ReactNode;
  className?: string;
}

/**
 * The house pattern for precise or rarely used controls: a collapsed disclosure at the end of a panel. Closed, it is one line
 * ("Advanced · Exact position, size, pointer side"); open, it shows the controls. It always sits in the same place, so people learn
 * there is more without being shown it.
 */
export function Advanced({ id, summary, children, className }: AdvancedProps) {
  const [open, setOpen] = useState(() => opened.has(id));
  return (
    <details
      open={open}
      onToggle={e => {
        const isOpen = e.currentTarget.open;
        if (isOpen) opened.add(id);
        else opened.delete(id);
        setOpen(isOpen);
      }}
      className={cx('group border-t border-line pt-3', className)}
    >
      <summary className={cx('flex cursor-default list-none items-center gap-1.5 text-sm select-none', focusRing)}>
        <Icon icon={ChevronRight} size={14} className="shrink-0 text-fg-muted transition-transform group-open:rotate-90" />
        <span className="font-semibold text-fg">Advanced</span>
        {/* the summary is for the closed state only; once open the controls say for themselves what they are */}
        <span className="min-w-0 truncate text-fg-muted group-open:sr-only">{summary}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}
