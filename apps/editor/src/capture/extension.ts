import { EDITOR_SOURCE, parseExtensionMessage, type CapturedClick, type EditorMessage, type ExtensionMessage } from '@waypost/capture';
import { patchCapture } from './state';

/* Talks to the click-capture extension, if there is one. Its script on this page answers messages posted to the window. With no
   extension nothing answers, and every call here quietly gives up after a moment: nothing in the editor depends on it. */

type Waiter = { type: ExtensionMessage['type']; resolve: (message: ExtensionMessage | null) => void };
const waiters = new Set<Waiter>();
let listening = false;

function onMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = parseExtensionMessage(event.data);
  if (!message) return;
  if (message.type === 'hello') patchCapture({ extension: true });
  for (const waiter of [...waiters]) {
    if (waiter.type !== message.type) continue;
    waiters.delete(waiter);
    waiter.resolve(message);
  }
}

const send = (type: EditorMessage['type']): void => window.postMessage({ source: EDITOR_SOURCE, type } satisfies EditorMessage, window.location.origin);

/** Starts listening for the extension and asks whether it is there. Safe to call again. */
export function lookForExtension(): void {
  if (!listening) {
    listening = true;
    window.addEventListener('message', onMessage);
  }
  send('ping');
}

function ask(type: EditorMessage['type'], expect: ExtensionMessage['type'], timeout: number): Promise<ExtensionMessage | null> {
  return new Promise(resolve => {
    const waiter: Waiter = { type: expect, resolve };
    waiters.add(waiter);
    setTimeout(() => {
      if (waiters.delete(waiter)) resolve(null);
    }, timeout);
    send(type);
  });
}

/** Asks the extension to start logging clicks. False if it didn't answer, so the recording goes on without them. */
export async function startClickCapture(): Promise<boolean> {
  lookForExtension();
  return (await ask('start', 'started', 2500))?.type === 'started';
}

/** Stops the logging and returns every click it made. Empty if the extension didn't answer. */
export async function stopClickCapture(): Promise<CapturedClick[]> {
  const reply = await ask('stop', 'stopped', 4000);
  return reply?.type === 'stopped' ? reply.clicks : [];
}
