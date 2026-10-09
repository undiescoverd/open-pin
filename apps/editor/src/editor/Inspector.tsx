import { cx, focusRing, Surface } from '@waypost/ui';
import { useRef, useState, type KeyboardEvent } from 'react';

const TABS = [
  { id: 'selection', label: 'Inspector' },
  { id: 'guide', label: 'Guide' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/* Context inspector (docs/03-design-system.md): the first tab edits whatever is selected, the second holds guide-wide settings. */
export function Inspector() {
  const [tab, setTab] = useState<TabId>('selection');
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ selection: null, guide: null });

  /* arrow keys move between tabs, as the WAI-ARIA tabs pattern expects */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex(t => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <Surface as="aside" aria-label="Inspector" className="flex min-h-0 min-w-0 flex-col overflow-hidden [grid-area:insp]">
      <div role="tablist" aria-label="Inspector panels" className="flex gap-1 border-b border-line p-2" onKeyDown={onKeyDown}>
        {TABS.map(t => (
          <button
            key={t.id}
            ref={el => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cx(
              'h-8 flex-1 rounded-md border-0 font-medium text-fg-muted hover:text-fg aria-selected:bg-raised aria-selected:text-fg',
              focusRing,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map(t => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={tab !== t.id}
          tabIndex={0}
          className={cx('flex-1 overflow-auto p-4', focusRing)}
        >
          {t.id === 'selection' ? (
            <>
              <h3 className="m-0 mb-1 text-md font-semibold text-fg">Nothing selected</h3>
              <p className="m-0 text-fg-muted">Click a step, an annotation on the frame, or anything on the timeline to edit it here.</p>
            </>
          ) : (
            <>
              <h3 className="m-0 mb-1 text-md font-semibold text-fg">Guide settings</h3>
              <p className="m-0 text-fg-muted">Frame, logo, player, audio and analytics settings appear here once a recording is open.</p>
            </>
          )}
        </div>
      ))}
    </Surface>
  );
}
