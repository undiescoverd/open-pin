import { proposeSteps } from '@waypost/capture';
import { importRecording } from '../state/project';
import { notify, patchEditor } from '../state/store';
import { startClickCapture, stopClickCapture } from './extension';
import { PickerCancelled, startTabRecording, type TabRecording } from './recorder';
import { getCapture, patchCapture } from './state';

/* Record a tab: pick the tab, record it, and when it stops open it as a new project. If the extension was logging clicks, the
   steps they suggest wait in the review list (ClickReview) for the person to keep, merge or drop. Without it this is just a
   recording. */

let active: TabRecording | null = null;
const TITLE = document.title;

/** Ends the recording in progress (the editor's Stop button). */
export function stopRecording(): void {
  active?.stop();
}

export async function recordTab(): Promise<void> {
  if (active || getCapture().recording) return;
  let recording: TabRecording;
  try {
    recording = await startTabRecording();
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    notify(error instanceof Error && error.message ? error.message : "Couldn't record that tab.", 'error');
    return;
  }
  active = recording;
  /* the clicks are logged from here on; if the extension doesn't answer, the recording is still good and goes on without them */
  const wantsClicks = getCapture().suggest && getCapture().extension;
  const withClicks = wantsClicks && (await startClickCapture());
  if (wantsClicks && !withClicks) notify("Couldn't start click capture, so this will be a plain recording.", 'error');
  patchCapture({ recording: { startedAt: recording.startedAt, withClicks } });
  document.title = '● Recording — Waypost';
  try {
    const tab = await recording.done;
    patchEditor({ busy: 'Finishing the recording…' });
    const clicks = withClicks ? await stopClickCapture() : [];
    patchCapture({ recording: null });
    document.title = TITLE;
    const project = await importRecording(tab.file, { quiet: withClicks });
    if (!project) return;
    if (!withClicks) return;
    const source = project.sources[0]!;
    const steps = proposeSteps({ clicks, startedAt: tab.startedAt, duration: source.duration, trackLabel: tab.trackLabel });
    if (steps.length === 0) notify('Recording ready. No clicks were captured, so press P, then click the frame where viewers should click.');
    else patchCapture({ review: { source: source.id, steps } });
  } catch (error) {
    if (withClicks) await stopClickCapture();
    patchEditor({ busy: null });
    notify(error instanceof Error && error.message ? error.message : "Couldn't save that recording.", 'error');
  } finally {
    active = null;
    patchCapture({ recording: null });
    document.title = TITLE;
  }
}
