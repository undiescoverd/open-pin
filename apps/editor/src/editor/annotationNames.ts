import type { Annotation } from '@waypost/core';

export const TYPE_LABEL: Record<Annotation['type'], string> = { callout: 'Callout', arrow: 'Arrow', spotlight: 'Spotlight', box: 'Box', click: 'Click marker' };

export function annotationName(a: Annotation): string {
  if (a.type === 'callout') return `Callout “${a.text.length > 26 ? `${a.text.slice(0, 25)}…` : a.text}”`;
  return TYPE_LABEL[a.type];
}
