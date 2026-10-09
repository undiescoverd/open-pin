/* @waypost/media: reads recordings in a worker: what they contain, the time of every frame, exact frame reads. */
export { createMediaClient, MediaUnsupportedError, type MediaClient, type MediaHandle } from './client';
export { FrameIndex } from './frame-index';
export type { MediaInfo } from './reader';
