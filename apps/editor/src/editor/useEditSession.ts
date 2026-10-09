import { useRef } from 'react';

/**
 * One undo step per editing session on a field (docs/05-editor-interactions.md, 7.1): the first change after it gains focus starts a
 * session and the rest merge into it. Spread `bind` on the control, and pass `key()` as the command's coalesce key.
 */
let counter = 0;
export function useEditSession() {
  const current = useRef<string | null>(null);
  return {
    /** the key for edits made now; a fresh one starts after focus leaves */
    key: () => (current.current ??= `session-${++counter}`),
    bind: {
      onBlur: () => {
        current.current = null;
      },
      onPointerUp: () => {
        current.current = null;
      },
    },
  };
}
