import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';

/* A plain static file host for the Phase 3 tests: what GitHub Pages or S3 does with a guide folder. It serves files with their
   types, index.html for folders, and byte ranges (browsers ask for ranges when they play video). Extra pages can be given as
   strings by path. */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export interface StaticHost {
  url: string;
  /** every path asked for, in order */
  requests: string[];
  close(): Promise<void>;
}

export async function serveStatic(root: string, pages: Record<string, string> = {}): Promise<StaticHost> {
  const requests: string[] = [];
  const base = resolve(root);
  const server: Server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    requests.push(path);
    if (pages[path] !== undefined) {
      res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] ?? 'text/html; charset=utf-8' });
      res.end(pages[path]);
      return;
    }
    let file = normalize(join(base, path));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, 'index.html');
        info = await stat(file);
      }
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) {
        const start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'accept-ranges': 'bytes' });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise(done => server.close(() => done())),
  };
}
