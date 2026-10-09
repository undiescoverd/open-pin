import { describe, expect, it } from 'vitest';
import { formatShortcut } from './keys';

describe('formatShortcut', () => {
  it('uses glyphs on a Mac', () => {
    expect(formatShortcut(['mod', 'shift', 'z'], 'mac')).toEqual({ text: '⌘⇧Z', spoken: 'Command Shift Z', aria: 'Meta+Shift+Z' });
  });

  it('spells modifiers out elsewhere', () => {
    expect(formatShortcut(['mod', 'shift', 'z'], 'other')).toEqual({ text: 'Ctrl+Shift+Z', spoken: 'Control Shift Z', aria: 'Control+Shift+Z' });
  });

  it('handles single keys, named keys and punctuation', () => {
    expect(formatShortcut(['p'], 'mac').text).toBe('P');
    expect(formatShortcut(['space'], 'mac').text).toBe('Space');
    expect(formatShortcut(['alt', 'left'], 'mac')).toEqual({ text: '⌥←', spoken: 'Option Left Arrow', aria: 'Alt+ArrowLeft' });
    expect(formatShortcut(['mod', ','], 'other').text).toBe('Ctrl+,');
    expect(formatShortcut(['mod', 'enter'], 'mac').text).toBe('⌘↩');
  });
});
