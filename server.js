'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chat, status: aiStatus, catalogPublic } = require('./lib/ai-gateway');
const { evaluate } = require('./lib/calc-engine');
const store = require('./lib/settings-store');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');

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
      if (size > 65536) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, type) {
  const buf = typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
  });
  res.end(buf);
}

async function handleApi(req, res, url) {
  if (url === '/health' && req.method === 'GET') {
    return send(res, 200, 'OK', 'text/plain');
  }

  // SHFH config
  if (url === '/api/shfh-config' && req.method === 'GET') {
    return send(res, 200, {
      hubId: process.env.SHFH_HUB_ID || 'SHFH-CANNOI-0905428801',
      hubUrl: (process.env.SHFH_HUB_URL || 'http://14.176.78.46:8090').replace(/\/$/, ''),
      formUrl: process.env.SHFH_FORM_URL || '',
      ingestToken: process.env.SHFH_INGEST_TOKEN || 'cannoi_7Kp9xV2mQ8rN4tY6cL3wA5zD1eF0uH9',
      appId: process.env.SHFH_APP_ID || 'futuristic-calculator',
      appName: process.env.SHFH_APP_NAME || 'Futuristic Calculator',
      version: process.env.SHFH_APP_VERSION || '1.2.0',
      platform: 'solohost',
      enabled: process.env.SHFH_ENABLED !== '0',
    });
  }

  if (url === '/api/shfh-proxy/feedback' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const hubUrl = (process.env.SHFH_HUB_URL || 'http://14.176.78.46:8090').replace(/\/$/, '');
      const token = process.env.SHFH_INGEST_TOKEN || 'cannoi_7Kp9xV2mQ8rN4tY6cL3wA5zD1eF0uH9';
      const r = await fetch(hubUrl + '/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: raw,
        signal: AbortSignal.timeout(12000),
      });
      const j = await r.json().catch(() => ({}));
      return send(res, r.status, j);
    } catch (e) {
      store.appendLog('error', 'shfh.proxy', { error: e.message });
      return send(res, 502, { ok: false, error: e.message });
    }
  }

  if (url === '/api/calculate' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.expression) return send(res, 400, { ok: false, error: 'expression required' });
      const result = evaluate(String(body.expression));
      store.appendLog('info', 'calculate', { expr: body.expression, ok: result.ok });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (url === '/api/ai/status' && req.method === 'GET') {
    return send(res, 200, aiStatus());
  }

  if (url === '/api/ai/catalog' && req.method === 'GET') {
    return send(res, 200, { providers: catalogPublic() });
  }

  if (url === '/api/ai/settings' && req.method === 'GET') {
    return send(res, 200, store.publicSettings());
  }

  if (url === '/api/ai/settings' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const pub = store.writeSettings(body);
      store.appendLog('info', 'settings.saved', { provider: pub.provider, hasKey: pub.hasKey });
      return send(res, 200, { ok: true, settings: pub, status: aiStatus() });
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (url === '/api/ai/chat' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.message || typeof body.message !== 'string') {
        return send(res, 400, { ok: false, error: 'message required' });
      }
      const out = await chat({
        message: body.message.slice(0, 2000),
        context: body.context || {},
        history: Array.isArray(body.history) ? body.history.slice(-8) : [],
      });
      return send(res, 200, out);
    } catch (e) {
      store.appendLog('error', 'ai.chat', { error: e.message });
      return send(res, 500, { ok: false, error: 'AI unavailable', detail: e.message });
    }
  }

  if (url === '/api/logs' && req.method === 'GET') {
    const limit = Math.min(200, parseInt(new URL(req.url, 'http://x').searchParams.get('limit') || '80', 10) || 80);
    return send(res, 200, { logs: store.readLogs(limit) });
  }

  if (url === '/api/logs' && req.method === 'DELETE') {
    store.clearLogs();
    return send(res, 200, { ok: true });
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    const api = await handleApi(req, res, u.pathname);
    if (api !== null) return;

    let filePath = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!filePath.startsWith(PUBLIC)) {
      return send(res, 403, 'Forbidden', 'text/plain');
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
    store.appendLog('error', 'server', { error: e.message });
    send(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  store.appendLog('info', 'server.start', { port: PORT });
  console.log(`Futuristic Calculator AI v1.3.0 on port ${PORT}`);
  console.log('AI:', aiStatus().message);
});
