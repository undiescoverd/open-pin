/** Joins class names, skipping falsy ones. */
export const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ');

/** The teal keyboard focus ring every control uses. */
export const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sel';
