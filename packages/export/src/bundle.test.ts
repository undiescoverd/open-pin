import { commands, createProject, embedSnippets, guideSlug, planGuide, type Project, type Source } from '@waypost/core';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { embedText, guideIndexHtml, zipBundle } from './bundle';

/* The published guide folder (F11): its page, its embed snippets and its zip. */

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 10, size: [1280, 800], fps: 30 };
function guide(name = 'Connect <your> calendar') {
  const p: Project = createProject({ id: 'p1', name, source, now: 1 });
  commands.pinStep({ stepId: 's1', annotationId: 'a1', source: 'src1', time: 4, now: 2 }).run(p);
  return planGuide(p, { pdf: true }).guide;
}

describe('the guide bundle', () => {
  it('names the folder after the guide', () => {
    expect(guideSlug('Connect your Calendar!')).toBe('connect-your-calendar');
    expect(guideSlug('Café déjà vu')).toBe('cafe-deja-vu');
    expect(guideSlug('***')).toBe('guide');
  });

  it('writes the two-line embed and an iframe that leaves room for the controls', () => {
    const s = embedSnippets(guide(), 'https://me.github.io/guides/connect');
    expect(s.link).toBe('https://me.github.io/guides/connect/');
    expect(s.script).toBe('<div data-waypost="https://me.github.io/guides/connect/guide.json"></div>\n<script src="https://me.github.io/guides/connect/player.js" async></script>');
    expect(s.iframe).toContain('src="https://me.github.io/guides/connect/"');
    expect(s.iframe).toContain('height="696"');
    expect(s.iframe).toContain('title="Connect &lt;your&gt; calendar"');
  });

  it('gives the guide a standalone page that loads the player and links the PDF, with the title escaped', () => {
    const html = guideIndexHtml(guide());
    expect(html).toContain('<div data-waypost="guide.json"></div>');
    expect(html).toContain('<script src="player.js" async></script>');
    expect(html).toContain('<title>Connect &lt;your&gt; calendar</title>');
    expect(html).toContain('href="guide.pdf"');
  });

  it('explains hosting with placeholders, or with the address given', () => {
    expect(embedText(guide(), 'connect')).toContain('https://YOUR-SITE/guides/connect/guide.json');
    const filled = embedText(guide(), 'connect', 'https://docs.example.com/g/connect');
    expect(filled).toContain('https://docs.example.com/g/connect/player.js');
    expect(filled).not.toContain('YOUR-SITE');
  });

  it('zips every file inside the guide folder', async () => {
    const zip = await zipBundle(
      [
        { path: 'guide.json', data: '{"a":1}' },
        { path: 'seg/s1.mp4', data: new Blob([new Uint8Array([1, 2, 3])]) },
      ],
      'connect',
    );
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['connect/guide.json', 'connect/seg/s1.mp4']);
    expect(strFromU8(files['connect/guide.json']!)).toBe('{"a":1}');
    expect([...files['connect/seg/s1.mp4']!]).toEqual([1, 2, 3]);
  });
});
