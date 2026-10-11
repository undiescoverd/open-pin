import type { CapturedClick } from '@waypost/capture';
import type { BridgeReply, StateReply, ToBackground, ToPage } from './messages';

/* The extension's service worker. It switches logging on and off when the editor asks, keeps the clicks the pages report, and
   hands them to the editor when the recording stops. Everything stays in the browser: there is no network code here.
   A service worker can be stopped at any moment, so the state lives in session storage, which survives that and is cleared when
   the browser closes. */

const KEY = 'recording';
const MAX_CLICKS = 2000;
/** a recording that nobody stopped is dropped after this long, so the REC badge can't stay on for ever */
const MAX_MS = 4 * 60 * 60 * 1000;

interface State {
  startedAt: number;
  editorTab: number | null;
  clicks: CapturedClick[];
}

async function load(): Promise<State | null> {
  const stored = (await chrome.storage.session.get(KEY))[KEY] as State | undefined;
  if (stored && Date.now() - stored.startedAt > MAX_MS) {
    await finish();
    return null;
  }
  return stored ?? null;
}

const save = (state: State): Promise<void> => chrome.storage.session.set({ [KEY]: state });

async function arm(on: boolean): Promise<void> {
  const message: ToPage = { kind: 'arm', on };
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => (tab.id === undefined ? undefined : chrome.tabs.sendMessage(tab.id, message).catch(() => undefined))));
  if (on) {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D13A30' });
    await chrome.action.setTitle({ title: 'Waypost is recording the clicks in this browser' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Waypost click capture' });
  }
}

async function finish(): Promise<CapturedClick[]> {
  const state = (await chrome.storage.session.get(KEY))[KEY] as State | undefined;
  await chrome.storage.session.remove(KEY);
  await arm(false);
  return state?.clicks ?? [];
}

async function handle(message: ToBackground, tab: chrome.tabs.Tab | undefined): Promise<BridgeReply | StateReply | undefined> {
  switch (message.kind) {
    case 'state':
      return { recording: (await load()) !== null };
    case 'click': {
      const state = await load();
      if (!state || tab?.id === undefined || tab.id === state.editorTab || state.clicks.length >= MAX_CLICKS) return undefined;
      state.clicks.push({ ...message.click, tab: tab.id });
      await save(state);
      return undefined;
    }
    case 'bridge':
      if (message.type === 'ping') return { type: 'hello' };
      if (message.type === 'start') {
        await save({ startedAt: Date.now(), editorTab: tab?.id ?? null, clicks: [] });
        await arm(true);
        return { type: 'started' };
      }
      return { type: 'stopped', clicks: await finish() };
  }
}

chrome.runtime.onMessage.addListener((message: ToBackground, sender, sendResponse) => {
  /* the bridge only runs on the editor's pages and the capture script on web pages: nothing else may start or stop a recording */
  if (sender.id !== chrome.runtime.id || (message.kind === 'bridge' && !sender.tab)) return false;
  void handle(message, sender.tab).then(sendResponse, () => sendResponse(undefined));
  return true;
});

/* closing the editor tab ends the recording: nobody is left to receive the clicks */
chrome.tabs.onRemoved.addListener(tabId => {
  void load().then(state => {
    if (state && state.editorTab === tabId) return finish();
    return undefined;
  });
});

/* a browser restart clears session storage, but the badge can outlive a worker restart: put it right */
void load().then(state => arm(state !== null));
