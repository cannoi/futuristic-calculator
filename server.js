'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { evaluate } = require('./lib/calc-engine');
const adapter = require('./lib/app-adapter');
const { createAIService } = require('./lib/ai-module/ai-service');
const { mountAIRoutes } = require('./lib/ai-module/routes');
const { createFeedbackService, mountFeedbackRoutes } = require('./lib/feedback-module/feedback-service');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 65536) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': type && type.startsWith('text/') ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(buf);
}

/*
 * Tiny router bridge: dependency-free Node server + Express-style route mounting
 * from the universal AI + Feedback modules.
 */
function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => routes.push({ method, pattern, handler });
  const match = (pattern, pathname) => {
    const a = pattern.split('/').filter(Boolean);
    const b = pathname.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i += 1) {
      if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return params;
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    delete: (p, h) => add('DELETE', p, h),
    async dispatch(req, res, pathname) {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const params = match(route.pattern, pathname);
        if (!params) continue;
        req.params = params;
        if (req.method === 'POST') {
          try {
            const raw = await readBody(req);
            req.body = raw ? JSON.parse(raw) : {};
          } catch (e) {
            return send(res, 400, { ok: false, error: 'Invalid JSON request body' });
          }
        }
        // Parse query for GET handlers that need it (feedback sync)
        try {
          const u = new URL(req.url || '/', 'http://localhost');
          req.query = Object.fromEntries(u.searchParams.entries());
        } catch {
          req.query = {};
        }
        let pendingStatus = 200;
        res.status = (code) => {
          pendingStatus = Number(code) || 200;
          return res;
        };
        res.json = (body) => {
          send(res, pendingStatus, body);
          return res;
        };
        try {
          await route.handler(req, res);
        } catch (e) {
          if (!res.writableEnded) send(res, 500, { ok: false, error: 'Internal error' });
        }
        return true;
      }
      return false;
    },
  };
}

const ai = createAIService({
  dataDir: DATA_DIR,
  appName: 'Futuristic Calculator',
  adapter,
});

const fbOpts = {
  appId: process.env.SHFH_APP_ID || 'futuristic-calculator',
  appName: process.env.SHFH_APP_NAME || 'Futuristic Calculator',
  version: require('./package.json').version || '1.0.0',
};
if (process.env.SHFH_HUB_ID) fbOpts.hubId = process.env.SHFH_HUB_ID;
if (process.env.SHFH_HUB_URL) fbOpts.baseUrl = process.env.SHFH_HUB_URL;
if (process.env.SHFH_INGEST_TOKEN) fbOpts.ingestToken = process.env.SHFH_INGEST_TOKEN;
const fb = createFeedbackService(fbOpts);

const router = createRouter();
mountAIRoutes(router, ai);
mountFeedbackRoutes(router, fb);

async function handleApi(req, res, url) {
  if (url === '/health' && req.method === 'GET') {
    return send(res, 200, 'OK', 'text/plain; charset=utf-8');
  }

  if (url === '/api/calculate' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.expression) return send(res, 400, { ok: false, error: 'expression required' });
      const result = evaluate(String(body.expression));
      ai.log('info', 'calculate', { expr: String(body.expression).slice(0, 200), ok: result.ok });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (await router.dispatch(req, res, url)) return true;
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    const api = await handleApi(req, res, u.pathname);
    if (api !== null) return;

    let filePath = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!filePath.startsWith(PUBLIC)) {
      return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    try {
      ai.log('error', 'server', { error: e.message });
    } catch (_) {}
    if (!res.writableEnded) send(res, 500, { ok: false, error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Futuristic Calculator listening on 0.0.0.0:${PORT}`);
});
