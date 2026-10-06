'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { evaluate } = require('./lib/calc-engine');
const { createAIService } = require('./ai-module/server/ai-service');
const { mountAIRoutes, safePublicError, errorCode } = require('./ai-module/server/routes');
const { createFeedbackService, mountFeedbackRoutes } = require('./feedback-module/server/feedback-service');

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
 * Tiny router bridge: the app intentionally keeps its dependency-free Node
 * server, while the universal modules retain their reusable Express-style
 * route mounting contract.
 */
function createRouter() {
  const routes = [];
  for (const method of ['GET', 'POST', 'DELETE']) {
    const key = method.toLowerCase();
    routes.push;
  }
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
        const originalJson = res.json;
        const originalStatus = res.status;
        let pendingStatus = 200;
        res.status = (code) => { pendingStatus = Number(code) || 200; return res; };
        res.json = (body) => {
          send(res, pendingStatus, body);
          return res;
        };
        try {
          await route.handler(req, res);
        } finally {
          if (originalJson) res.json = originalJson; else delete res.json;
          if (originalStatus) res.status = originalStatus; else delete res.status;
        }
        return true;
      }
      return false;
    },
  };
}

const appAdapter = {
  knowledge: `
APP NAME: Futuristic Calculator
PURPOSE: A lightweight futuristic calculator for common arithmetic.
FEATURES:
- Basic arithmetic: addition, subtraction, multiplication and division.
- Decimal numbers, delete and clear.
- Verified calculation engine shared by the app and AI integration.
- AI Assistant is provided by the Universal AI Module.
- Feedback, provider settings and logs are provided by the Universal AI + Feedback Modules.
USER WORKFLOWS:
- Enter numbers and operators, then press = to calculate.
- AC clears the current calculation.
- DEL removes the last digit.
- AI can explain the current result or help the user understand how to use the calculator.
LIMITATIONS:
- AI must never invent calculator capabilities.
- Calculator results should be treated as authoritative when the live context marks them verified.
SAFE ACTIONS:
- clear_all: clear the calculator.
- set_result: put a verified numeric value into the display.
- set_expression: place an expression into the calculator for the user to review.
`,
  async getContext(context = {}) {
    return {
      screen: 'calculator',
      expression: context.expression || '',
      result: context.result ?? null,
      calcHistory: Array.isArray(context.calcHistory) ? context.calcHistory.slice(-10) : [],
    };
  },
  actions: [
    { name: 'clear_all', description: 'Clear the calculator display and current expression.', requiresConfirmation: false },
    { name: 'set_result', description: 'Set a numeric result in the calculator display.', requiresConfirmation: false },
    { name: 'set_expression', description: 'Put a safe arithmetic expression into the calculator for the user to review.', requiresConfirmation: false },
  ],
  async executeAction(action) {
    const name = String(action?.name || '');
    const args = action?.args || {};
    if (!['clear_all', 'set_result', 'set_expression'].includes(name)) {
      return { ok: false, error: 'Action not allowed' };
    }
    // The browser owns the calculator state. Return a verified instruction;
    // the browser adapter applies only these whitelisted actions.
    if (name === 'clear_all') return { ok: true, action: name };
    if (name === 'set_result') {
      const value = Number(args.value);
      if (!Number.isFinite(value)) return { ok: false, error: 'set_result requires a finite number' };
      return { ok: true, action: name, value: String(value) };
    }
    const expression = String(args.expression || '');
    const checked = evaluate(expression);
    if (!checked.ok) return { ok: false, error: checked.error };
    return { ok: true, action: name, value: checked.expression, verifiedResult: checked.value };
  },
};

const ai = createAIService({
  appName: 'Futuristic Calculator',
  dataDir: DATA_DIR,
  adapter: appAdapter,
});

const feedback = createFeedbackService({
  appId: process.env.SHFH_APP_ID || 'futuristic-calculator',
  appName: process.env.SHFH_APP_NAME || 'Futuristic Calculator',
  version: process.env.SHFH_APP_VERSION || '1.3.1',
});

const router = createRouter();
// The calculator has no separate authentication system. The SoloHost/container
// boundary remains the app's access boundary. If auth is added later, replace
// authorize with the host's authenticated-user check.
mountAIRoutes(router, ai, { rateLimit: true, maxChatPerWindow: 30 });
mountFeedbackRoutes(router, feedback);

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
    ai.log('error', 'server', { error: e.message });
    send(res, 500, { ok: false, error: safePublicError(e), code: errorCode(e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  ai.log('info', 'server.start', { port: PORT });
  console.log(`Futuristic Calculator v1.3.1 on port ${PORT}`);
});
