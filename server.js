'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chat, status: aiStatus } = require('./lib/ai-gateway');
const { evaluate } = require('./lib/calc-engine');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
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
    'Cache-Control': type && type.startsWith('text/html') ? 'no-cache' : 'public, max-age=60',
  });
  res.end(buf);
}

async function handleApi(req, res, url) {
  if (url === '/health' && req.method === 'GET') {
    return send(res, 200, 'OK', 'text/plain');
  }
  if (url === '/api/shfh-config' && req.method === 'GET') {
    return send(res, 200, {
      hubId: process.env.SHFH_HUB_ID || 'SHFH-CANNOI-0905428801',
      hubUrl: (process.env.SHFH_HUB_URL || 'http://14.176.78.46:8090').replace(/\/$/, ''),
      formUrl: process.env.SHFH_FORM_URL || '',
      ingestToken: process.env.SHFH_INGEST_TOKEN || 'cannoi_7Kp9xV2mQ8rN4tY6cL3wA5zD1eF0uH9',
      appId: process.env.SHFH_APP_ID || 'futuristic-calculator',
      appName: process.env.SHFH_APP_NAME || 'Futuristic Calculator',
      version: process.env.SHFH_APP_VERSION || '1.1.0',
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
      return send(res, 502, { ok: false, error: e.message });
    }
  }
  if (url === '/api/calculate' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.expression) return send(res, 400, { ok: false, error: 'expression required' });
      return send(res, 200, evaluate(String(body.expression)));
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }
  if (url === '/api/ai/status' && req.method === 'GET') {
    return send(res, 200, aiStatus());
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
      return send(res, 500, { ok: false, error: 'AI unavailable', detail: e.message });
    }
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
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    send(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Futuristic Calculator AI running on port ${PORT}`);
  console.log('AI:', aiStatus().message);
});
