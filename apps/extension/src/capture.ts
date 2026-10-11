import { describeClick } from './describe';
import type { StateReply, ToBackground, ToPage } from './messages';

/* Runs in every page. It does nothing until Waypost is recording, then reports each click (what was clicked and where) to the
   extension's background script, which keeps them for the editor. It never reads the page beyond the clicked control's name. */

let armed = false;

function send(message: ToBackground): Promise<unknown> {
  try {
    return chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    /* the extension was reloaded or removed while this page was open */
    return Promise.resolve(undefined);
  }
}

/** The editor's own page isn't logged: the click that stops a recording isn't a step. */
const isEditorPage = (): boolean => document.querySelector('meta[name="waypost-editor"]') !== null;

function onClick(event: MouseEvent): void {
  if (!armed || !event.isTrusted || event.button !== 0 || isEditorPage()) return;
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  let { clientX: x, clientY: y } = event;
  /* a click made with the keyboard (Enter on a button) has no position: use the middle of the control */
  if (event.detail === 0 && event.target instanceof Element) {
    const box = event.target.getBoundingClientRect();
    x = box.left + box.width / 2;
    y = box.top + box.height / 2;
  }
  const { kind, label } = describeClick(event.target);
  void send({ kind: 'click', click: { t: Date.now(), x: x / width, y: y / height, label, kind, title: document.title } });
}

try {
  chrome.runtime.onMessage.addListener((message: ToPage) => {
    if (message?.kind === 'arm') armed = message.on;
  });
} catch {
  /* see send() */
}
void send({ kind: 'state' }).then(reply => {
  armed = (reply as StateReply | undefined)?.recording === true;
});
/* capture phase, so a page that stops the event from travelling still gets its click logged */
document.addEventListener('click', onClick, true);
