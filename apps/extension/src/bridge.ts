import { EDITOR_SOURCE, EXTENSION_SOURCE, PROTOCOL_VERSION, parseEditorMessage, type ExtensionMessage } from '@waypost/capture';
import type { BridgeReply, ToBackground } from './messages';

/* Runs only on the Waypost editor's own pages (the manifest lists them). It carries the editor's `start` and `stop` to the
   background script and the answer back, and says hello so the editor knows the extension is installed. */

const post = (message: ExtensionMessage): void => window.postMessage(message, window.location.origin);

async function ask(type: 'start' | 'stop' | 'ping'): Promise<void> {
  let reply: BridgeReply | undefined;
  try {
    reply = (await chrome.runtime.sendMessage({ kind: 'bridge', type } satisfies ToBackground)) as BridgeReply | undefined;
  } catch {
    return;
  }
  if (!reply) return;
  if (reply.type === 'hello') post({ source: EXTENSION_SOURCE, type: 'hello', version: PROTOCOL_VERSION });
  else if (reply.type === 'started') post({ source: EXTENSION_SOURCE, type: 'started' });
  else post({ source: EXTENSION_SOURCE, type: 'stopped', clicks: reply.clicks });
}

window.addEventListener('message', event => {
  /* only the page itself, and only what the editor sends */
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = parseEditorMessage(event.data);
  if (message?.source === EDITOR_SOURCE) void ask(message.type);
});

if (document.querySelector('meta[name="waypost-editor"]')) post({ source: EXTENSION_SOURCE, type: 'hello', version: PROTOCOL_VERSION });
