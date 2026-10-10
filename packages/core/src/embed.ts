import type { Guide } from './guide';

/* How a published guide goes on a page (F11): its folder name and the snippets to paste. Plain strings, so the editor's Share
   dialog shows them without loading the exporters. */

/** `connect-calendar`: the guide's folder name, from its title. */
export function guideSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'guide';
}

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Height of the player's control bar in CSS pixels, so an iframe or a page can leave room for it under the picture. */
export const PLAYER_BAR_HEIGHT = 96;

export interface Snippets {
  /** the standalone page */
  link: string;
  /** the two-line embed */
  script: string;
  /** for sites that strip scripts */
  iframe: string;
}

/** The ways to put a guide on a page, given the address its folder will be served from. */
export function embedSnippets(guide: Pick<Guide, 'title' | 'size'>, base: string): Snippets {
  const root = base.trim().replace(/\/*$/, '/');
  const width = 960;
  const height = Math.round((width * guide.size[1]) / guide.size[0]) + PLAYER_BAR_HEIGHT;
  return {
    link: root,
    script: `<div data-waypost="${escapeHtml(root)}guide.json"></div>\n<script src="${escapeHtml(root)}player.js" async></script>`,
    iframe: `<iframe src="${escapeHtml(root)}" width="${width}" height="${height}" style="border:0;max-width:100%" allow="fullscreen" title="${escapeHtml(guide.title || 'Guide')}"></iframe>`,
  };
}
