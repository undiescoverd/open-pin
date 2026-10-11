import { createContext } from 'react';

/* A tooltip left open under a dialog would take the dialog's first Esc, so while a dialog is open only the tooltips inside it open. */

/** closes each open tooltip */
export const tooltipClosers = new Set<() => void>();
let dialogs = 0;

/** true inside a dialog */
export const InDialog = createContext(false);

export const openDialogs = (): number => dialogs;

/** Called by a dialog as it opens: closes the tooltips behind it and keeps them shut until it closes (call what it returns). */
export function dialogOpened(): () => void {
  dialogs++;
  for (const close of tooltipClosers) close();
  return () => void dialogs--;
}
