'use strict';
/**
 * Custom / Local provider tests. Uses REAL HTTP servers on 127.0.0.1 (no fetch mocks),
 * so URL handling, error causes, timeouts and parsing are exercised end-to-end.
 */
const assert = require('assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const eng = require('../lib/ai-module/provider-engine');
const { createAIService } = require('../lib/ai-module/ai-service');
const { mountAIRoutes } = require('../lib/ai-module/routes');

function serve(handler) {
  return new Promise(resolve => {
    const hits = [];
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        let json; try { json = body ? JSON.parse(body) : undefined; } catch { json = undefined; }
        const rec = { method: req.method, url: req.url, headers: req.headers, body: json };
        hits.push(rec);
        const send = (status, obj, type = 'application/json') => {
          res.writeHead(status, { 'Content-Type': type });
          res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
        };
        handler(rec, send);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, hits, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
const ok = content => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });
const T = [];
const test = (name, fn) => T.push([name, fn]);

/* ---- 1. Base URL variants all resolve to a working endpoint ---- */
for (const [label, suffix] of [['root without /v1', ''], ['with /v1', '/v1'], ['with trailing slash', '/v1/'], ['full chat URL pasted', '/v1/chat/completions']]) {
  test(`custom: Base URL ${label}`, async () => {
    eng.clearCaches();
    const s = await serve((r, send) => {
      if (r.url === '/v1/models') return send(200, { object: 'list', data: [{ id: 'my-chat-model' }] });
      if (r.url === '/v1/chat/completions') return send(200, ok('{"reply":"hi","actions":[]}'));
      send(404, { error: { message: 'not found' } });
    });
    const base = s.url + suffix;
    const models = await eng.listModels({ provider: 'custom', baseUrl: base, apiKey: '' });
    assert.deepStrictEqual(models.map(m => m.id), ['my-chat-model']);
    const txt = await eng.runProvider({ provider: 'custom', baseUrl: base, apiKey: '', model: 'auto', messages: [{ role: 'user', content: 'x' }] });
    assert.ok(txt.includes('reply'));
    s.srv.close();
  });
}

/* ---- 2. /models shapes ---- */
const shapes = {
  'bare array of objects': [{ id: 'a-instruct' }],
  'bare array of strings': ['a-instruct'],
  '{models:[{model}]}': { models: [{ model: 'a-instruct' }] },
  '{data:{models:[]}}': { data: { models: [{ name: 'a-instruct' }] } },
  '{result:[]}': { result: [{ id: 'a-instruct' }] },
};
for (const [label, payload] of Object.entries(shapes)) {
  test(`local: /models shape ${label}`, async () => {
    eng.clearCaches();
    const s = await serve((r, send) => r.url === '/v1/models' ? send(200, payload) : send(200, ok('ok')));
    const m = await eng.listModels({ provider: 'local', baseUrl: s.url + '/v1', apiKey: '' });
    assert.strictEqual(m[0].id, 'a-instruct');
    s.srv.close();
  });
}

test('local: embedding models are never auto-selected', async () => {
  assert.strictEqual(eng.chooseAutoModel([{ id: 'nomic-embed-text:latest' }, { id: 'bge-m3' }, { id: 'llama3.1:8b-instruct' }], 'local'), 'llama3.1:8b-instruct');
  assert.strictEqual(eng.chooseAutoModel([{ id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'gpt-4o-mini' }], 'openai'), 'gpt-4o-mini');
  assert.strictEqual(eng.chooseAutoModel([{ id: 'only-embed-embedding' }], 'custom'), 'only-embed-embedding'); // last resort
  assert.strictEqual(eng.chooseAutoModel([{ id: 'foo-model' }], 'custom'), 'foo-model');
});

test('local: Ollama-native /api/tags fallback when /v1/models is absent', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => {
    if (r.url === '/api/tags') return send(200, { models: [{ name: 'qwen2.5:7b', model: 'qwen2.5:7b' }] });
    if (r.url === '/v1/chat/completions') return send(200, ok('pong'));
    send(404, { error: 'nope' });
  });
  const txt = await eng.runProvider({ provider: 'local', baseUrl: s.url, apiKey: '', model: 'auto', messages: [{ role: 'user', content: 'x' }] });
  assert.strictEqual(txt, 'pong');
  assert.strictEqual(s.hits.find(h => h.url === '/v1/chat/completions').body.model, 'qwen2.5:7b');
  s.srv.close();
});

/* ---- 3. THE reported error ---- */
test('REPORTED BUG: server with no /models -> actionable NO_MODEL error, explicit model still works', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => {
    if (r.url === '/v1/chat/completions') return send(200, ok('works'));
    send(404, { error: { message: 'Not Found' } });
  });
  await assert.rejects(
    eng.runProvider({ provider: 'custom', baseUrl: s.url + '/v1', apiKey: '', model: 'auto', messages: [{ role: 'user', content: 'x' }] }),
    e => e.code === 'NO_MODEL' && /Settings → Model/.test(e.message) && /^Provider returned no usable text model/.test(e.message));
  const txt = await eng.runProvider({ provider: 'custom', baseUrl: s.url + '/v1', apiKey: '', model: 'any-name', messages: [{ role: 'user', content: 'x' }] });
  assert.strictEqual(txt, 'works');
  s.srv.close();
});

test('REPORTED BUG: HTML page at /models (wrong URL) -> BAD_BASE_URL style error, not silent empty list', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => send(200, '<!doctype html><html><body>Web UI</body></html>', 'text/html'));
  // /models HTML => treated as endpoint miss => [] => NO_MODEL with guidance
  await assert.rejects(eng.runProvider({ provider: 'custom', baseUrl: s.url, apiKey: '', model: 'auto', messages: [{ role: 'user', content: 'x' }] }),
    e => e.code === 'NO_MODEL');
  await assert.rejects(eng.runProvider({ provider: 'custom', baseUrl: s.url, apiKey: '', model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    e => e.code === 'NOT_JSON' && /Base URL/.test(e.message));
  s.srv.close();
});

/* ---- 4. Response extraction ---- */
const extractCases = {
  'string content': [ok('plain'), 'plain'],
  'parts array': [{ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] }, 'ab'],
  'legacy choices[].text': [{ choices: [{ text: 'legacy' }] }, 'legacy'],
  '<think> block stripped': [ok('<think>reasoning...</think>\n{"reply":"x","actions":[]}'), '{"reply":"x","actions":[]}'],
  'orphan </think>': [ok('hidden thoughts</think>answer'), 'answer'],
  'ollama native': [{ message: { role: 'assistant', content: 'native' }, done: true }, 'native'],
  'responses api output_text': [{ output_text: 'resp' }, 'resp'],
  'responses api output[]': [{ output: [{ type: 'message', content: [{ type: 'output_text', text: 'resp2' }] }] }, 'resp2'],
};
for (const [label, [payload, expected]] of Object.entries(extractCases)) {
  test(`extract: ${label}`, () => assert.strictEqual(eng.extractText(payload, 'custom'), expected));
}
test('extract: reasoning-only reply gives a precise error', () => {
  assert.throws(() => eng.extractText({ choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'length' }] }, 'custom'),
    e => e.code === 'EMPTY_RESPONSE' && /reasoning/.test(e.message));
});
test('extract: refusal / tool call / 200-with-error-body', () => {
  assert.throws(() => eng.extractText({ choices: [{ message: { content: null, refusal: 'no' } }] }, 'x'), /refused/);
  assert.throws(() => eng.extractText({ choices: [{ message: { content: null, tool_calls: [{}] } }] }, 'x'), /tool call/);
  assert.throws(() => eng.extractText({ error: { message: 'quota' } }, 'x'), /quota/);
});

test('SSE body (server ignores stream:false) is assembled', async () => {
  eng.clearCaches();
  const sse = ['data: {"choices":[{"delta":{"content":"Hel"}}]}', 'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}', 'data: [DONE]', ''].join('\n\n');
  const s = await serve((r, send) => send(200, sse, 'text/event-stream'));
  const t = await eng.runWithModel({ provider: 'custom', baseUrl: s.url + '/v1', apiKey: '', model: 'm', messages: [{ role: 'user', content: 'x' }] });
  assert.strictEqual(t, 'Hello');
  s.srv.close();
});

/* ---- 5. Parameter adaptation ---- */
test('retries without temperature when the server rejects it', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => {
    if (r.body && 'temperature' in r.body) return send(400, { error: { message: "Unsupported value: 'temperature' does not support 0.2" } });
    send(200, ok('fine'));
  });
  assert.strictEqual(await eng.runWithModel({ provider: 'custom', baseUrl: s.url + '/v1', model: 'm', messages: [{ role: 'user', content: 'x' }] }), 'fine');
  s.srv.close();
});
test('folds system prompt into user turn when template rejects system role', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => {
    if (r.body.messages.some(m => m.role === 'system')) return send(500, { error: { message: 'Conversation roles must alternate user/assistant; System role not supported' } });
    send(200, ok(r.body.messages[0].content));
  });
  const out = await eng.runWithModel({ provider: 'local', baseUrl: s.url + '/v1', model: 'm', messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USR' }] });
  assert.ok(out.includes('SYS') && out.includes('USR'));
  s.srv.close();
});

/* ---- 6. Fallback protocols ---- */
test('falls back to /responses when /chat/completions is missing', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => r.url === '/v1/responses' ? send(200, { output_text: 'from-responses' }) : send(404, { error: 'x' }));
  assert.strictEqual(await eng.runWithModel({ provider: 'custom', baseUrl: s.url + '/v1', model: 'm', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] }), 'from-responses');
  assert.strictEqual(s.hits.find(h => h.url === '/v1/responses').body.instructions, 's');
  s.srv.close();
});
test('falls back to Ollama native /api/chat', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => r.url === '/api/chat' ? send(200, { message: { content: 'from-ollama' } }) : send(404, { error: 'x' }));
  assert.strictEqual(await eng.runWithModel({ provider: 'local', baseUrl: s.url, model: 'm', messages: [{ role: 'user', content: 'u' }] }), 'from-ollama');
  s.srv.close();
});

/* ---- 7. Auth ---- */
test('auth: no header without key; Bearer once; pasted "Bearer " prefix cleaned; extra headers sent', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => send(200, r.url.endsWith('/models') ? { data: [{ id: 'm' }] } : ok('x')));
  await eng.listModels({ provider: 'local', baseUrl: s.url + '/v1', apiKey: '' });
  assert.strictEqual(s.hits.at(-1).headers.authorization, undefined);
  await eng.listModels({ provider: 'custom', baseUrl: s.url + '/v1', apiKey: 'Bearer sk-abc', extraHeaders: { 'X-Gateway': 'g1', 'Host': 'evil' } });
  assert.strictEqual(s.hits.at(-1).headers.authorization, 'Bearer sk-abc');
  assert.strictEqual(s.hits.at(-1).headers['x-gateway'], 'g1');
  s.srv.close();
});
test('auth errors are reported, not swallowed into "no model"', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => send(401, { error: { message: 'Invalid API key' } }));
  await assert.rejects(eng.listModels({ provider: 'custom', baseUrl: s.url + '/v1', apiKey: 'bad' }), e => e.status === 401);
  s.srv.close();
});

/* ---- 8. Network diagnostics (real sockets) ---- */
test('connection refused gives actionable message', async () => {
  const s = await serve(() => {}); const url = s.url; await new Promise(r => s.srv.close(r));
  await assert.rejects(eng.listModels({ provider: 'local', baseUrl: url + '/v1' }), e => e.code === 'NETWORK' && /refused/i.test(e.message) && /host\.docker\.internal/.test(e.message));
});
test('timeout gives actionable message', async () => {
  const s = await serve(() => { /* never answer */ });
  process.env.AI_TIMEOUT_MS = '1200';
  await assert.rejects(eng.runWithModel({ provider: 'custom', baseUrl: s.url + '/v1', model: 'm', messages: [{ role: 'user', content: 'x' }] }), e => e.code === 'TIMEOUT');
  delete process.env.AI_TIMEOUT_MS;
  s.srv.closeAllConnections?.(); s.srv.close();
});
test('Base URL without scheme gets http:// for private hosts', () => {
  assert.strictEqual(eng.normalizeBaseUrl('localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.strictEqual(eng.normalizeBaseUrl('192.168.1.5:1234'), 'http://192.168.1.5:1234');
  assert.strictEqual(eng.normalizeBaseUrl('api.example.com/v1/chat/completions'), 'https://api.example.com/v1');
});

/* ---- 9. testProvider on custom/local does a real generation ---- */
test('testProvider(local): lists + probes generation; failing generation is surfaced', async () => {
  eng.clearCaches();
  const good = await serve((r, send) => send(200, r.url.endsWith('/models') ? { data: [{ id: 'llama3' }] } : ok('ok')));
  const t = await eng.testProvider({ provider: 'local', baseUrl: good.url + '/v1', apiKey: '', model: 'auto' });
  assert.strictEqual(t.model, 'llama3'); assert.ok(t.generation.ok);
  good.srv.close();
  const bad = await serve((r, send) => r.url.endsWith('/models') ? send(200, { data: [{ id: 'llama3' }] }) : send(400, { error: { message: 'model failed to load' } }));
  await assert.rejects(eng.testProvider({ provider: 'local', baseUrl: bad.url + '/v1', apiKey: '', model: 'auto' }), /test generation.*llama3.*failed/);
  bad.srv.close();
  const none = await serve((r, send) => send(404, {}));
  await assert.rejects(eng.testProvider({ provider: 'custom', baseUrl: none.url + '/v1', model: 'auto' }), e => e.code === 'NO_MODEL');
  none.srv.close();
});

/* ---- 10. Full stack: ai-service + routes against a fake local server ---- */
test('ai-service end-to-end (local provider, empty Base URL uses built-in default; explicit custom works)', async () => {
  eng.clearCaches();
  const s = await serve((r, send) => {
    if (r.url === '/v1/models') return send(200, { data: [{ id: 'nomic-embed-text' }, { id: 'qwen2.5-instruct' }] });
    if (r.url === '/v1/chat/completions') return send(200, ok('<think>x</think>Sure! {"reply":"Xin chào","actions":[]}'));
    send(404, {});
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-'));
  const ai = createAIService({ dataDir: dir, appName: 'T' });
  // local provider with no Base URL: configured() must follow the built-in default (was false before 1.3.0)
  ai.saveSettings({ provider: 'local', baseUrl: '', model: 'auto', mode: 'cloud_enabled' });
  assert.strictEqual(ai.configured(), true);
  ai.saveSettings({ provider: 'custom', baseUrl: '  ' + s.url + '  ', model: 'auto', apiKey: 'Bearer k123' });
  assert.strictEqual(ai.getSecrets().baseUrl, s.url);
  assert.strictEqual(ai.getSecrets().apiKey, 'k123');
  const out = await ai.chat({ message: 'hello' });
  assert.strictEqual(out.reply, 'Xin chào');
  assert.strictEqual(out.resolvedModel, 'qwen2.5-instruct');
  assert.strictEqual(out.model, 'auto');
  const rm = await ai.refreshModels();
  assert.strictEqual(rm.models.length, 2);
  s.srv.close();

  // routes: codes
  const routes = {};
  const router = { get: (p, h) => routes['GET ' + p] = h, post: (p, h) => routes['POST ' + p] = h, delete: () => {} };
  mountAIRoutes(router, ai);
  const dead = await serve(() => {}); const deadUrl = dead.url; await new Promise(r => dead.srv.close(r));
  ai.saveSettings({ provider: 'local', baseUrl: deadUrl, model: 'auto' });
  let status, body;
  await routes['POST /api/ai/chat']({ body: { message: 'x' } }, { status(c) { status = c; return this; }, json(b) { body = b; } });
  assert.strictEqual(status, 502); assert.strictEqual(body.code, 'NETWORK_ERROR');
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ---- 11. Regression: built-in providers keep exact URL shapes ---- */
test('regression: OpenAI built-in uses exactly <base>/models and <base>/chat/completions', async () => {
  eng.clearCaches();
  const seen = []; const orig = global.fetch;
  global.fetch = async (url) => { seen.push(url); return { ok: true, status: 200, text: async () => JSON.stringify(url.endsWith('/models') ? { data: [{ id: 'gpt-4o-mini' }] } : ok('x')) }; };
  await eng.runProvider({ provider: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'K', model: 'auto', messages: [{ role: 'user', content: 'x' }] });
  global.fetch = orig;
  assert.deepStrictEqual(seen, ['https://example.test/v1/models', 'https://example.test/v1/chat/completions']);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of T) {
    try { await fn(); console.log('  ok  -', name); }
    catch (e) { failed++; console.log('  FAIL-', name, '\n      ', e && e.stack || e); }
  }
  console.log(failed ? `\ncustom/local tests: ${failed} FAILED of ${T.length}` : `\ncustom/local provider tests: OK (${T.length})`);
  process.exit(failed ? 1 : 0);
})();
