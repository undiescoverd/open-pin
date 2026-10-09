import { useCallback, useState } from 'react';

/* `system` follows the operating system; light and dark are remembered in this browser (index.html applies them before paint). */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'waypost.theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export const nextPreference = (p: ThemePreference): ThemePreference => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]!;
export const parsePreference = (raw: string | null | undefined): ThemePreference => (raw === 'light' || raw === 'dark' ? raw : 'system');

export function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function applyPreference(p: ThemePreference, root: HTMLElement = document.documentElement) {
  if (p === 'system') delete root.dataset.theme;
  else root.dataset.theme = p;
  try {
    if (p === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
  } catch {
    /* private windows can refuse storage; the choice still applies until reload */
  }
}

/** The current preference and a function that cycles System → Light → Dark. */
export function useThemePreference(): [ThemePreference, () => void] {
  const [pref, setPref] = useState(readPreference);
  const cycle = useCallback(() => {
    setPref(p => {
      const next = nextPreference(p);
      applyPreference(next);
      return next;
    });
  }, []);
  return [pref, cycle];
}
