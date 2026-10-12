import type { CapturedClick } from '@waypost/capture';

/* What the extension's own scripts say to each other (the editor-facing messages are in @waypost/capture). */

export type ToBackground =
  /** from the bridge on the editor's page */
  | { kind: 'bridge'; type: 'start' | 'stop' | 'ping' }
  /** from a page's capture script: a click, and a request for whether to be logging */
  | { kind: 'click'; click: Omit<CapturedClick, 'tab'> }
  | { kind: 'state' };

export type BridgeReply = { type: 'hello' } | { type: 'started' } | { type: 'stopped'; clicks: CapturedClick[] };
export type StateReply = { recording: boolean };

/** sent to every tab when logging starts or stops */
export type ToPage = { kind: 'arm'; on: boolean };
