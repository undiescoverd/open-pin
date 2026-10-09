import { createMediaClient, type MediaClient } from '@waypost/media';
import type { Playback } from './playback';

/* Long-lived objects that are not React state: the media worker and the running playback. The stage creates and disposes the
   playback as a recording opens and closes; the store reaches it through here. */

let client: MediaClient | null = null;

/** The media worker, started on first use. */
export function mediaClient(): MediaClient {
  client ??= createMediaClient();
  return client;
}

let playback: Playback | null = null;
export function currentPlayback(): Playback | null {
  return playback;
}
export function setPlayback(next: Playback | null): void {
  playback = next;
}
