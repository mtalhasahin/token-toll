/**
 * Serves `docs/` for looking at it before it is published.
 *
 * The page fetches its own results file, so `file://` will not do — a browser
 * refuses that as a cross-origin read. This is the smallest thing that makes
 * the page behave the way GitHub Pages will.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const root = join(import.meta.dirname, '..', 'docs');
const port = Number(process.env['PORT'] ?? 4173);

createServer((request, response) => {
  const asked = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const relative = normalize(asked === '/' ? 'index.html' : asked.replace(/^\/+/, ''));

  // Nothing above the docs directory is servable, whatever the path says.
  if (relative.startsWith('..')) {
    response.writeHead(403).end('no');
    return;
  }

  const path = join(root, relative);
  stat(path).then(
    (info) => {
      if (!info.isFile()) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      createReadStream(path).pipe(response);
    },
    () => response.writeHead(404).end('not found'),
  );
}).listen(port, () => process.stdout.write(`docs/ on http://localhost:${port}\n`));
