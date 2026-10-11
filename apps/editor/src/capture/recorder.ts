/* Records a browser tab into a video file with the browser's own screen-capture and recording (getDisplayMedia and MediaRecorder).
   Recording inside the editor, rather than importing a file, is what keeps the video and the clicks on one clock. */

export interface RecordedTab {
  file: File;
  /** `Date.now()` when the recorder started: the moment the clicks are measured from */
  startedAt: number;
  /** the shared tab's name as the browser reports it */
  trackLabel: string;
}

export interface TabRecording {
  /** when it began, `Date.now()` */
  startedAt: number;
  /** ends the recording; `done` then settles. Pressing the browser's own "Stop sharing" does the same. */
  stop: () => void;
  done: Promise<RecordedTab>;
}

/** The person closed the picker without choosing a tab. */
export class PickerCancelled extends Error {
  constructor() {
    super('No tab was chosen.');
    this.name = 'PickerCancelled';
  }
}

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export function canRecordTab(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && typeof MediaRecorder !== 'undefined';
}

export async function startTabRecording(): Promise<TabRecording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      /* offer tabs first, leave this editor tab out of the list, and don't let the person swap to a window mid-recording */
      video: { displaySurface: 'browser', frameRate: { ideal: 30 } },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) throw new PickerCancelled();
    throw error;
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error("The browser didn't share any video.");
  }
  const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let startedAt = 0;
  const started = new Promise<void>(resolve => {
    recorder.onstart = () => {
      startedAt = Date.now();
      resolve();
    };
  });
  const done = new Promise<RecordedTab>((resolve, reject) => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (blob.size === 0) {
        reject(new Error('Nothing was recorded.'));
        return;
      }
      const when = new Date(startedAt);
      const name = `Tab recording ${String(when.getHours()).padStart(2, '0')}.${String(when.getMinutes()).padStart(2, '0')}.webm`;
      resolve({ file: new File([blob], name, { type: 'video/webm' }), startedAt, trackLabel: track.label });
    };
    recorder.onerror = () => reject(new Error('The recording stopped unexpectedly.'));
  });
  const stop = (): void => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  /* "Stop sharing" in the browser's own bar */
  track.addEventListener('ended', stop);
  recorder.start(1000);
  await started;
  return { startedAt, stop, done };
}
