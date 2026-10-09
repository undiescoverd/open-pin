import type { Step } from '@waypost/core';

/** A step's title for export; steps without one are called "Step N". */
export function stepTitle(step: Step, index: number): string {
  return step.title.trim() || `Step ${index + 1}`;
}

/** `01-open-settings`: sorts in step order and reads well in a file browser. */
export function stepSlug(step: Step, index: number, total: number): string {
  const digits = Math.max(2, String(total).length);
  const words = step.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `${String(index + 1).padStart(digits, '0')}-${words || 'step'}`;
}

/** A name safe to use as a file name. */
export function safeFileName(name: string, fallback = 'Waypost guide'): string {
  const printable = Array.from(name).filter(ch => ch.charCodeAt(0) >= 32).join('');
  return printable.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
}
