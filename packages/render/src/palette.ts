/* The annotation palette (docs/03-design-system.md, "Annotation palette"). Annotations sit on arbitrary recordings, so every colour
   carries a halo in the opposite tone, and callouts use a darker fill than the stroke so white text passes contrast. */

export interface AnnotationColour {
  id: string;
  name: string;
  /** strokes, arrows, markers */
  stroke: string;
  /** callout bubble */
  fill: string;
  /** callout text */
  text: string;
  /** the 2 px outline that makes strokes read on both light and dark recordings */
  halo: string;
}

export const ANNOTATION_COLORS: readonly AnnotationColour[] = [
  { id: 'coral', name: 'Coral', stroke: '#FF5A4E', fill: '#D13A30', text: '#FFFFFF', halo: '#FFFFFF' },
  { id: 'marigold', name: 'Marigold', stroke: '#FFB020', fill: '#FFB020', text: '#0E1116', halo: '#0E1116' },
  { id: 'lagoon', name: 'Lagoon', stroke: '#13B8A6', fill: '#0B7568', text: '#FFFFFF', halo: '#FFFFFF' },
  { id: 'iris', name: 'Iris', stroke: '#6E6BFF', fill: '#4F4BD6', text: '#FFFFFF', halo: '#FFFFFF' },
  { id: 'snow', name: 'Snow', stroke: '#FFFFFF', fill: '#FFFFFF', text: '#0E1116', halo: '#0E1116' },
  { id: 'ink', name: 'Ink', stroke: '#0E1116', fill: '#0E1116', text: '#FFFFFF', halo: '#FFFFFF' },
];

/** The colour a callout starts with: ink bubbles with white text read on any recording. */
export const DEFAULT_CALLOUT_COLOR = '#0E1116';

const byStroke = new Map(ANNOTATION_COLORS.map(c => [c.stroke.toLowerCase(), c]));

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Looks a stored hex up in the palette; any other colour gets a halo and text colour chosen by its brightness. */
export function colourFor(hex: string): AnnotationColour {
  const known = byStroke.get(hex.toLowerCase());
  if (known) return known;
  const light = luminance(hex) > 0.4;
  return { id: 'custom', name: 'Custom', stroke: hex, fill: hex, text: light ? '#0E1116' : '#FFFFFF', halo: light ? '#0E1116' : '#FFFFFF' };
}
