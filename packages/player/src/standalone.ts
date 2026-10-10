import { mount, type PlayerHandle } from './player';

/* player.js, the file every published guide carries (F11). The two-line embed is

     <div data-waypost="https://you.github.io/guides/onboarding/guide.json"></div>
     <script src="https://you.github.io/guides/onboarding/player.js" async></script>

   It mounts a player on every [data-waypost] element, now and whenever one appears later (React and Vue apps, CMS editors), mounts
   again when the attribute changes, and stops a player whose element leaves the page. `Waypost.mount(el, url)` does it by hand. */

const players = new Map<HTMLElement, { url: string; player: PlayerHandle }>();

function scan(root: ParentNode): void {
  const found = root instanceof HTMLElement && root.matches('[data-waypost]') ? [root] : [];
  found.push(...root.querySelectorAll<HTMLElement>('[data-waypost]'));
  for (const el of found) {
    const url = el.dataset.waypost?.trim();
    const mounted = players.get(el);
    if (!url || mounted?.url === url) continue;
    mounted?.player.destroy();
    players.set(el, { url, player: mount(el, url) });
  }
}

function sweep(): void {
  for (const [el, { player }] of players) {
    if (el.isConnected) continue;
    player.destroy();
    players.delete(el);
  }
}

function start(): void {
  scan(document);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') scan(r.target as HTMLElement);
      else for (const node of r.addedNodes) if (node instanceof HTMLElement) scan(node);
    }
    if (records.some(r => r.removedNodes.length)) sweep();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-waypost'] });
}

declare global {
  interface Window {
    Waypost?: { mount: typeof mount; version: string };
  }
}

if (!window.Waypost) {
  window.Waypost = { mount, version: '1' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
