// Minimal static file server for local development and the end-to-end tests.
// ES modules do not load from file://, so the page needs to be served over HTTP.
//   npm start            -> http://127.0.0.1:4173
//   PORT=5000 npm start  -> another port
//
// Serves only the files the page needs, and only on the loopback interface.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = ['index.html', 'css', 'js', 'evals', 'docs'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Map a request path to a file inside a public folder, or null if it is not allowed. */
export function resolvePublicPath(urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed escape such as "/%"
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(ROOT, path));
  const rel = relative(ROOT, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  const top = rel.split(sep)[0];
  return PUBLIC.includes(top) ? file : null;
}

/** Start the server; resolves with the server once it is listening. */
export function serve(port = Number(process.env.PORT) || 4173) {
  const server = createServer(async (req, res) => {
    try {
      const file = resolvePublicPath(new URL(req.url, 'http://localhost').pathname);
      if (!file) {
        res.writeHead(404).end('Not found');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await serve();
  console.log(`Puente running at http://127.0.0.1:${server.address().port}`);
}
