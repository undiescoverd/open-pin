import type { ClickKind } from './protocol';

/* A step's title from what was clicked: "Click Invite", or "Click the Email field" for a text box. A click on something with no
   readable name gets no title, which is better than a wrong one; the marker still shows where it was. */

const MAX_TITLE = 60;

/** Collapses runs of whitespace and cuts a long label with an ellipsis. */
export function tidyLabel(label: string): string {
  const text = label.replace(/\s+/g, ' ').trim();
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1).trimEnd()}…` : text;
}

export function titleFor(kind: ClickKind, label: string): string {
  const text = tidyLabel(label);
  if (!text) return '';
  return kind === 'field' ? `Click the ${text} field` : `Click ${text}`;
}
