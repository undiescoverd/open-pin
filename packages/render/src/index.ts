/* @waypost/render: the canvas compositor shared by the editor, the player and every export. */
export { composeFrame, loadRenderFonts, type ComposeOptions } from './compose';
export { drawAnnotations, type DrawOptions } from './draw';
export {
  FONT_FAMILY,
  REFERENCE_WIDTH,
  annotationBox,
  arrowGeometry,
  calloutFont,
  clamp,
  hitTest,
  hits,
  layoutCallout,
  unit,
  type CalloutLayout,
  type Ctx,
  type PxRect,
  type Size,
} from './geometry';
export { ANNOTATION_COLORS, DEFAULT_CALLOUT_COLOR, colourFor, type AnnotationColour } from './palette';
