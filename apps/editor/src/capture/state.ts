import type { ProposedStep } from '@waypost/capture';
import { create } from 'zustand';

/* What the click-capture feature knows: whether the extension is installed, whether a tab is being recorded, the steps proposed
   from the clicks and waiting for a decision, and the person's two standing choices (suggest steps at all, and the install offer). */

export interface Review {
  /** the recording's source id */
  source: string;
  steps: ProposedStep[];
}

export interface CaptureState {
  /** the extension has said hello on this page */
  extension: boolean;
  /** a tab is being recorded: when it began, and whether the extension is logging its clicks */
  recording: { startedAt: number; withClicks: boolean } | null;
  review: Review | null;
  /** the "Suggest a step at each click" switch */
  suggest: boolean;
  /** "Not now" was pressed on the install offer */
  offerDismissed: boolean;
}

const SUGGEST_KEY = 'waypost.capture.suggest';
const OFFER_KEY = 'waypost.capture.offerDismissed';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the choice lasts until the page closes */
  }
}

export const useCapture = create<CaptureState>(() => ({
  extension: false,
  recording: null,
  review: null,
  suggest: read(SUGGEST_KEY) !== 'off',
  offerDismissed: read(OFFER_KEY) === '1',
}));
export const getCapture = useCapture.getState;
const set = useCapture.setState;

export const patchCapture = (patch: Partial<CaptureState>): void => set(patch);

/** The switch is remembered, so someone who never wants suggestions turns them off once. */
export function setSuggest(suggest: boolean): void {
  write(SUGGEST_KEY, suggest ? 'on' : 'off');
  set({ suggest });
}

/** "Not now" on the install offer: it doesn't come back. */
export function dismissOffer(): void {
  write(OFFER_KEY, '1');
  set({ offerDismissed: true });
}
