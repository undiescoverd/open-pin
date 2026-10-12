import { expect, type Page } from '@playwright/test';

/* Stand-ins for the two things a headless browser can't do: choose a tab to share, and run the click-capture extension. The tab
   is a canvas that keeps changing (so the recording has frames throughout), and the "extension" answers the editor's messages the
   way the real one's bridge does, with clicks at the times it is given (milliseconds after the editor starts it). The real
   extension is driven in extension.spec.ts. */

export interface FakeClick {
  /** ms after capture starts */
  at: number;
  x: number;
  y: number;
  label: string;
  kind?: 'button' | 'link' | 'field' | 'other';
}

export async function fakeTabSharing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d')!;
      let n = 0;
      const draw = () => {
        n++;
        ctx.fillStyle = `hsl(${(n * 3) % 360} 60% 45%)`;
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#fff';
        ctx.font = '48px sans-serif';
        ctx.fillText(String(n), 40 + (n % 400), 200);
      };
      draw();
      const timer = setInterval(draw, 50);
      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0]!;
      Object.defineProperty(track, 'label', { value: 'Acme · Dashboard' });
      track.addEventListener('ended', () => clearInterval(timer));
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      return stream;
    };
  });
}

export async function fakeExtension(page: Page, clicks: FakeClick[]): Promise<void> {
  await page.addInitScript(config => {
    let began = 0;
    const reply = (message: Record<string, unknown>) => window.postMessage({ source: 'waypost-extension', ...message }, location.origin);
    window.addEventListener('message', event => {
      const data = event.data as { source?: string; type?: string } | null;
      if (event.source !== window || data?.source !== 'waypost-editor') return;
      if (data.type === 'ping') reply({ type: 'hello', version: 1 });
      if (data.type === 'start') {
        began = Date.now();
        reply({ type: 'started' });
      }
      if (data.type === 'stop') {
        reply({
          type: 'stopped',
          clicks: config.map(c => ({ t: began + c.at, x: c.x, y: c.y, label: c.label, kind: c.kind ?? 'button', tab: 5, title: 'Acme · Dashboard' })),
        });
      }
    });
    document.addEventListener('DOMContentLoaded', () => reply({ type: 'hello', version: 1 }));
  }, clicks);
}

export interface SavedProject {
  sources: { duration: number }[];
  steps: { title: string; anchor: { time: number }; annotations: { type: string; at: [number, number]; reveal: number }[] }[];
}

/** The most recently saved project, as the editor wrote it. */
export async function savedProject(page: Page): Promise<SavedProject> {
  const read = () =>
    page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const projects = await (await root.getDirectoryHandle('waypost')).getDirectoryHandle('projects');
      let newest: { time: number; text: string } | null = null;
      for await (const [, handle] of (projects as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        const file = await (await (handle as FileSystemDirectoryHandle).getFileHandle('project.json')).getFile();
        if (!newest || file.lastModified >= newest.time) newest = { time: file.lastModified, text: await file.text() };
      }
      return newest?.text ?? null;
    });
  await expect.poll(read).not.toBeNull();
  return JSON.parse((await read())!) as SavedProject;
}
