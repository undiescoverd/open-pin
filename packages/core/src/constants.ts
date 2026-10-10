/* Plain values shared by the schema and the pure helpers. They live apart from schema.ts so code that only needs them (the
   player, which has a size budget) never pulls in Zod. */

/** Reveal groups (F6): 0 appears with the step, 1 after it, and so on up to this many groups. */
export const REVEAL_GROUPS = 4;

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 8;

/** Zoom box limits: a share of the frame, so 0.25 is 4× and 0.8 is 1.25× (docs/05-editor-interactions.md, section 2). */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 0.8;

/** The published guide's format (docs/02-architecture.md, "The published guide bundle"). */
export const GUIDE_SCHEMA = 'waypost.guide/1';
