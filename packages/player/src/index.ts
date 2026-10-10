/* @waypost/player: the embeddable guide player. The editor imports it from here for its preview; published guides load the
   standalone build (standalone.ts → player.js), which also mounts itself on [data-waypost] elements. */
export { mount, Player, type MountOptions, type PlayerHandle } from './player';
export { urlMedia, type GuideMedia, type SegmentDriver, type SegmentSurface } from './media';
export { checkGuide, GuideError } from './check';
export { transition, stepNumber, type Event as PlayerEvent, type Shape, type State as PlayerState } from './machine';
