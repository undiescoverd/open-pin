import type { ClickKind } from '@waypost/capture';

/* What was clicked, in words, from the page. It reads names a person would read (button text, link text, `aria-label`, a field's
   label), and never what someone typed: the value of a text box is not looked at. */

export interface Described {
  kind: ClickKind;
  label: string;
}

const INTERACTIVE =
  'a[href],button,summary,select,textarea,input,label,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=option],[contenteditable=""],[contenteditable=true],[onclick]';
const BUTTON_INPUTS = new Set(['button', 'submit', 'reset', 'image']);
const MAX_TEXT = 200;

const squash = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

function textOf(el: Element): string {
  const own = (el as HTMLElement).innerText ?? el.textContent;
  const text = squash(own) || squash(el.textContent);
  if (text) return text;
  /* an icon button: the name of the picture inside it */
  const img = el.querySelector('img[alt],svg[aria-label],[aria-label]');
  return squash(img?.getAttribute('alt') ?? img?.getAttribute('aria-label'));
}

function labelledBy(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  return squash(ids.map(id => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' '));
}

function fieldLabel(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  const fromLabel = labels && labels.length > 0 ? squash(labels[0]!.textContent) : '';
  return squash(el.getAttribute('aria-label')) || labelledBy(el) || fromLabel || squash(el.getAttribute('placeholder')) || squash(el.getAttribute('title')) || squash(el.getAttribute('name'));
}

function kindOf(el: Element): ClickKind {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (tag === 'input') return BUTTON_INPUTS.has((el as HTMLInputElement).type) ? 'button' : 'field';
  if (tag === 'textarea' || tag === 'select' || el.getAttribute('contenteditable') !== null) return 'field';
  if (tag === 'a' || role === 'link') return 'link';
  if (tag === 'button' || tag === 'summary' || role === 'button' || role === 'menuitem' || role === 'tab') return 'button';
  return 'other';
}

/** The nearest thing a person would call a control, starting from what was actually hit. */
export function controlAt(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target : (target as Node | null)?.parentElement ?? null;
  return el?.closest(INTERACTIVE) ?? null;
}

export function describeClick(target: EventTarget | null): Described {
  const control = controlAt(target);
  if (!control) {
    /* not on a control: a short piece of text is still a better title than none (a heading, a table cell) */
    const el = target instanceof Element ? target : null;
    const text = el ? textOf(el) : '';
    return { kind: 'other', label: text.length <= 60 ? text : '' };
  }
  const kind = kindOf(control);
  const tag = control.tagName.toLowerCase();
  if (kind === 'field') return { kind, label: fieldLabel(control) };
  if (tag === 'label') return { kind: 'other', label: squash(control.getAttribute('aria-label')) || textOf(control) };
  if (tag === 'input') {
    /* a button input is named by its value (Submit, Save); that is the button's caption, not something typed */
    const input = control as HTMLInputElement;
    return { kind, label: squash(input.getAttribute('aria-label')) || labelledBy(input) || squash(input.value) || squash(input.getAttribute('alt')) || fieldLabel(input) };
  }
  return { kind, label: squash(control.getAttribute('aria-label')) || labelledBy(control) || textOf(control) || squash(control.getAttribute('title')) };
}
