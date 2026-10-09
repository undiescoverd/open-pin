/* Shortcut keys are written platform-neutrally (`['mod', 'shift', 'z']`); `mod` is ⌘ on a Mac and Ctrl elsewhere. */

export type Platform = 'mac' | 'other';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '') ? 'mac' : 'other';
}

interface KeyName { mac: string; other: string; spokenMac: string; spokenOther: string; aria: string }
const k = (mac: string, other: string, spokenMac: string, spokenOther = spokenMac, aria = spokenOther): KeyName => ({ mac, other, spokenMac, spokenOther, aria });

const KEYS: Record<string, KeyName> = {
  mod: k('⌘', 'Ctrl', 'Command', 'Control', 'Meta'),
  ctrl: k('⌃', 'Ctrl', 'Control'),
  alt: k('⌥', 'Alt', 'Option', 'Alt'),
  shift: k('⇧', 'Shift', 'Shift'),
  enter: k('↩', 'Enter', 'Return', 'Enter'),
  backspace: k('⌫', 'Backspace', 'Delete', 'Backspace'),
  delete: k('⌦', 'Delete', 'Forward Delete', 'Delete'),
  escape: k('Esc', 'Esc', 'Escape'),
  space: k('Space', 'Space', 'Space', 'Space', 'Space'),
  tab: k('⇥', 'Tab', 'Tab'),
  left: k('←', '←', 'Left Arrow', 'Left Arrow', 'ArrowLeft'),
  right: k('→', '→', 'Right Arrow', 'Right Arrow', 'ArrowRight'),
  up: k('↑', '↑', 'Up Arrow', 'Up Arrow', 'ArrowUp'),
  down: k('↓', '↓', 'Down Arrow', 'Down Arrow', 'ArrowDown'),
};

function lookup(key: string): KeyName {
  const known = KEYS[key.toLowerCase()];
  if (known) return known;
  const shown = key.length === 1 ? key.toUpperCase() : key;
  return k(shown, shown, shown, shown, shown);
}

export interface FormattedShortcut {
  /** what the key cap shows: ⌘⇧Z on a Mac, Ctrl+Shift+Z elsewhere */
  text: string;
  /** what a screen reader says: "Command Shift Z" */
  spoken: string;
  /** the value for aria-keyshortcuts: "Meta+Shift+Z" */
  aria: string;
}

export function formatShortcut(keys: readonly string[], platform: Platform = detectPlatform()): FormattedShortcut {
  const names = keys.map(lookup);
  const mac = platform === 'mac';
  /* Mac shortcuts read as one glyph run (⌘⇧Z); elsewhere modifiers are joined with + (Ctrl+Shift+Z) */
  const text = mac ? names.map(n => n.mac).join('') : names.map(n => n.other).join('+');
  const spoken = names.map(n => (mac ? n.spokenMac : n.spokenOther)).join(' ');
  const aria = keys.map((key, i) => (key.toLowerCase() === 'mod' ? (mac ? 'Meta' : 'Control') : names[i]!.aria)).join('+');
  return { text, spoken, aria };
}
