/* @waypost/render: the canvas compositor shared by the editor, the player and every export. */
export {
  BLUR_FILLS,
  GRADIENTS,
  OPAQUE_FALLBACK,
  composeScene,
  loadRenderFonts,
  makeCanvas,
  registerWorkerFonts,
  sceneFor,
  type AnyCanvas,
  type AssetImages,
  type Scene,
  type SceneBlur,
  type SceneOptions,
} from './compose';
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
