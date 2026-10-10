/* Colour helpers with no dependencies, shared by the editor and the player. */

/** Relative luminance of a `#RRGGBB` colour (WCAG 2). */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Text that reads on a background of this colour: white, or ink on light colours such as marigold. */
export function textOn(hex: string): '#FFFFFF' | '#0E1116' {
  const l = luminance(hex);
  /* contrast against white and against ink (#0E1116, luminance about 0.0056); the larger one wins */
  return (1.05 / (l + 0.05) >= (l + 0.05) / 0.0556 ? '#FFFFFF' : '#0E1116');
}
