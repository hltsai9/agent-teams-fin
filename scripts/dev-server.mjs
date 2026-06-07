#!/usr/bin/env node
/**
 * Local dev harness — no Vercel CLI needed.
 *
 * Serves public/ statically and mounts api/quotes.js + api/news.js
 * as request handlers at /api/quotes and /api/news.
 *
 * Usage:  node scripts/dev-server.mjs [PORT]
 *   Default port: 3000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = parseInt(process.argv[2] ?? process.env.PORT ?? '3000', 10);

// Lazy-import the api handlers so hot-reload is possible without a watcher.
async function loadHandler(name) {
  // Cache-bust with a timestamp so re-runs pick up edits (Node ESM caches by URL).
  const modPath = path.join(ROOT, 'api', `${name}.js`);
  const url = `file://${modPath}?t=${Date.now()}`;
  try {
    const mod = await import(url);
    return mod.default ?? mod;
  } catch (err) {
    return null;
  }
}

// Minimal MIME map for static files.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://localhost`).pathname;
  // Default to index.html for directory-style requests.
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Prevent path traversal outside PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try appending .html (cleanUrls behaviour).
      const withHtml = filePath + '.html';
      fs.readFile(withHtml, (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`404 Not Found: ${urlPath}`);
        } else {
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data2);
        }
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

// Shim the Vercel-style req/res API onto a Node IncomingMessage/ServerResponse.
function shimVercelReq(nodeReq) {
  const parsedUrl = new URL(nodeReq.url, `http://localhost`);
  const query = {};
  for (const [k, v] of parsedUrl.searchParams) {
    query[k] = v;
  }
  return Object.assign(nodeReq, { query });
}

function shimVercelRes(nodeRes) {
  const shim = {
    _headers: {},
    status(code) {
      nodeRes.statusCode = code;
      return shim;
    },
    setHeader(k, v) {
      nodeRes.setHeader(k, v);
      return shim;
    },
    json(data) {
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.end(JSON.stringify(data));
    },
    send(data) {
      nodeRes.end(typeof data === 'string' ? data : JSON.stringify(data));
    },
    end(data) {
      nodeRes.end(data);
    },
  };
  return shim;
}

const server = http.createServer(async (req, res) => {
  // CORS headers for local dev convenience.
  res.setHeader('Access-Control-Allow-Origin', '*');

  const pathname = new URL(req.url, `http://localhost`).pathname;

  // Route /api/quotes and /api/news to their handlers.
  const apiMatch = pathname.match(/^\/api\/(quotes|news)(\/.*)?$/);
  if (apiMatch) {
    const handlerName = apiMatch[1];
    const handler = await loadHandler(handlerName);
    if (!handler) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `api/${handlerName}.js not found or failed to load` }));
      return;
    }
    try {
      await handler(shimVercelReq(req), shimVercelRes(res));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Everything else: static files from public/.
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`  Static root : ${PUBLIC_DIR}`);
  console.log(`  API handlers: api/quotes.js, api/news.js`);
  console.log(`Press Ctrl+C to stop.`);
});
