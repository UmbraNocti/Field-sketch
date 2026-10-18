// Shared bits for the browser tests: a tiny static server for the repo and Playwright loading.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export function loadPlaywright() {
  const require = createRequire(process.env.PLAYWRIGHT_PATH ? path.join(process.env.PLAYWRIGHT_PATH, '/') : path.join(process.execPath, '../../lib/node_modules/'));
  return require('playwright');
}

// Serves the repo on a free port. Set BASE_URL to test a server you started yourself.
export async function serve() {
  if (process.env.BASE_URL) return { base: process.env.BASE_URL, close() {} };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/index.html`, close: () => server.close() };
}
