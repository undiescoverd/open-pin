/** True while the person is typing, so single-letter shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && /^(text|search|url|number|email|tel|password)$/.test(target.type);
}

/** A press on the frame or the timeline takes focus away from a text field, so the next shortcut isn't typed into it. */
export function releaseFocus(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && isTyping(el)) el.blur();
}
