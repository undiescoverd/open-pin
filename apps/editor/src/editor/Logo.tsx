/* The app mark: a coral pin. The wordmark uses the brand font (Figtree once it is bundled; the system font until then). */
export function Logo() {
  return (
    <div className="flex items-center gap-2 pr-1">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
        <path fill="var(--wp-pin)" d="M16 30s-10-8.6-10-17a10 10 0 0 1 20 0c0 8.4-10 17-10 17z" />
        <circle cx="16" cy="13" r="3.8" fill="var(--wp-panel)" />
      </svg>
      <span className="font-brand text-lg font-bold tracking-tight text-fg">Waypost</span>
    </div>
  );
}
