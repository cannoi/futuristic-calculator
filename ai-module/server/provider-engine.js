/**
 * Universal AI provider engine.
 * Provider-agnostic by default: discover capabilities first, then call the
 * provider with the protocol it actually exposes. No provider model is
 * required to be hard-coded for `auto`.
 */
'use strict';

const DEFAULT_TIMEOUT_MS = 30000;
const CLIENT_ID = 'universal-ai-feedback-modules/1.2.0';

function cleanBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}
function timeoutSignal(ms = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
function geminiHeaders(apiKey) {
  return apiKey ? {'x-goog-api-key': apiKey, 'x-goog-api-client': CLIENT_ID} : {'x-goog-api-client': CLIENT_ID};
}
function authFor(provider, apiKey) {
  if (!apiKey || apiKey === 'local') return {};
  if (provider === 'anthropic') return {'x-api-key': apiKey, 'anthropic-version':'2023-06-01'};
  return {'Authorization':'Bearer ' + apiKey};
}

async function requestJson(url, {method='GET', body, headers={}, timeoutMs=DEFAULT_TIMEOUT_MS}={}) {
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: { Accept:'application/json', 'User-Agent': CLIENT_ID, ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutSignal(timeoutMs),
    });
  } catch (err) {
    const e = new Error(`Network error: ${err?.name === 'AbortError' ? 'request timed out' : String(err?.message || err)}`);
    e.code = err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
    throw e;
  }
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!r.ok) {
    const message = json?.error?.message || json?.error?.error?.message || json?.error || json?.message || text || `HTTP ${r.status}`;
    const e = new Error(`HTTP ${r.status}: ${String(message).slice(0,700)}`);
    e.status = r.status;
    e.providerBody = json;
    e.retryAfter = r.headers?.get?.('retry-after') || null;
    throw e;
  }
  return json;
}

function normalizeModel(model) {
  // `auto` means real-time provider discovery. Never turn it into a stale ID.
  return model && model !== 'auto' ? String(model) : 'auto';
}

function modelItems(j) {
  const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  return arr.map(x => ({
    id: String(x.id || x.name || '').replace(/^models\//,''),
    name: x.displayName || x.display_name || x.name || x.id || '',
    ownedBy: x.owned_by || x.ownedBy || x.publisher || '',
    methods: x.supportedGenerationMethods || x.supported_generation_methods || x.supported_actions || [],
    createdAt: x.created_at || x.createTime || x.created || null,
    capabilities: x.capabilities || null,
  })).filter(x => x.id);
}

async function listModels({provider,baseUrl,apiKey}) {
  const base = cleanBase(baseUrl);
  if (!base) throw new Error('Base URL is required for this provider');

  if (provider === 'gemini') {
    // Google documents models.list and generateContent under v1beta. Keep the
    // key in a header so it cannot leak into URL/access logs.
    const j = await requestJson(`${base}/models?pageSize=100`, {headers:geminiHeaders(apiKey)});
    return modelItems(j).filter(m => !m.methods.length || m.methods.includes('generateContent'));
  }

  // OpenAI-compatible providers: /models + /chat/completions.
  const j = await requestJson(`${base}/models`, {headers:authFor(provider,apiKey)});
  return modelItems(j);
}

function chooseAutoModel(models, provider) {
  // Prefer a text/chat-capable model using only what the provider actually
  // returned. Regexes are hints, never fallbacks to invented model IDs.
  const usable = (models || []).filter(Boolean);
  const score = (id) => {
    const s = String(id).toLowerCase();
    let n = 0;
    if (/tts|embedding|embed|moderation|image|audio|transcrib|rerank|search/.test(s)) n -= 1000;
    if (/flash|mini|haiku|small|nano/.test(s)) n += 30;
    if (/chat|instruct|sonnet|opus|pro|gpt|gemini|deepseek|llama|mistral|grok|qwen/.test(s)) n += 20;
    if (/latest|stable/.test(s)) n += 5;
    const versions=[...s.matchAll(/(?:^|[-_])([0-9]{1,2})(?:\.([0-9]{1,2}))?/g)].map(m=>Number(m[1]||0)*100+Number(m[2]||0));
    if(versions.length) n += Math.max(...versions)/100;
    if (provider === 'anthropic' && /sonnet/.test(s)) n += 10;
    return n;
  };
  const textModels = usable.filter(m => score(m.id) > -500);
  return textModels.sort((a,b) => score(b.id)-score(a.id))[0]?.id || 'auto';
}

async function resolveModel({provider,baseUrl,apiKey,model}) {
  const requested = normalizeModel(model);
  if (requested !== 'auto') return {model:requested,discovered:false,models:[]};
  const models = await listModels({provider,baseUrl,apiKey});
  const selected = chooseAutoModel(models, provider);
  if (!selected || selected === 'auto') throw new Error('Provider returned no usable text/chat model');
  return {model:selected,discovered:true,models};
}

async function runProvider({provider,baseUrl,apiKey,model,messages}) {
  const resolved = await resolveModel({provider,baseUrl,apiKey,model});
  return runWithModel({provider,baseUrl,apiKey,model:resolved.model,messages});
}

async function runWithModel({provider,baseUrl,apiKey,model,messages}) {
  const mid = normalizeModel(model);
  if (mid === 'auto') throw new Error('Model resolution failed');
  const base = cleanBase(baseUrl);

  if (provider === 'gemini') {
    const contents = messages.filter(x=>x.role!=='system').map(x=>({
      role:x.role==='assistant'?'model':'user',
      parts:[{text:String(x.content||'')}]
    }));
    const system = messages.find(x=>x.role==='system')?.content;
    const url = `${base}/models/${encodeURIComponent(mid)}:generateContent`;
    const j = await requestJson(url, {
      method:'POST',
      headers:geminiHeaders(apiKey),
      body:{contents, ...(system ? {systemInstruction:{parts:[{text:system}]}} : {}), generationConfig:{temperature:.2}}
    });
    const text = j?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('') || '';
    if (!text) throw new Error('Gemini returned no text candidate');
    return text;
  }

  if (provider === 'anthropic') {
    const system = messages.find(x=>x.role==='system')?.content||'';
    const msgs = messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')}));
    const j = await requestJson(`${base}/messages`, {
      method:'POST', headers:authFor('anthropic',apiKey),
      body:{model:mid,max_tokens:1500,system,messages:msgs}
    });
    const text = j?.content?.map(x=>x.text||'').join('') || '';
    if (!text) throw new Error('Anthropic returned no text content');
    return text;
  }

  const j = await requestJson(`${base}/chat/completions`, {
    method:'POST', headers:authFor(provider,apiKey),
    body:{model:mid,messages,temperature:.2}
  });
  const text = j?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${provider} returned no text content`);
  return text;
}

async function testProvider({provider,baseUrl,apiKey,model='auto'}) {
  const started = Date.now();
  const models = await listModels({provider,baseUrl,apiKey});
  const selected = model && model !== 'auto' ? model : chooseAutoModel(models,provider);
  if (!selected || selected === 'auto') throw new Error('Provider connected but returned no usable text/chat model');
  return {ok:true,provider,model:selected,modelCount:models.length,models:models.slice(0,100),latencyMs:Date.now()-started};
}

module.exports={runProvider,runWithModel,normalizeModel,listModels,chooseAutoModel,resolveModel,testProvider};
