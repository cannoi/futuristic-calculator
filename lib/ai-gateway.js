'use strict';

const { evaluate, percentage } = require('./calc-engine');
const store = require('./settings-store');

const PROVIDER_CATALOG = [
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com' },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'xai', name: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1' },
  { id: 'custom', name: 'Custom OpenAI-compatible', kind: 'openai', baseUrl: '' },
];

const TOOLS = {
  calculate: {
    name: 'calculate',
    description: 'Evaluate a math expression with the verified calculator engine. Supports + - * / ( ) %. Use for any arithmetic.',
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'e.g. "2000000 * 0.15" or "(10e6 - 2e6) / 4"' } },
      required: ['expression'],
    },
    handler: async ({ expression }) => {
      const r = evaluate(expression);
      if (!r.ok) return { error: r.error, verified: false };
      return { result: r.value, expression: r.expression, verified: true };
    },
  },
  percentage: {
    name: 'percentage',
    description: 'Compute percent of a value. e.g. 15% of 2000000',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        percent: { type: 'number' },
      },
      required: ['value', 'percent'],
    },
    handler: async ({ value, percent }) => {
      const r = percentage(value, percent);
      if (!r.ok) return { error: r.error, verified: false };
      return { result: r.value, expression: r.expression, verified: true };
    },
  },
};

function cfg() {
  return store.getSecrets();
}

function isConfigured() {
  const c = cfg();
  if (!c.provider || c.provider === 'none') return false;
  if (c.provider === 'custom') return !!(c.baseUrl);
  return !!(c.apiKey);
}

function catalogPublic() {
  return PROVIDER_CATALOG.map(({ id, name, kind }) => ({ id, name, kind }));
}

function buildSystemPrompt(context) {
  const ctx = context || {};
  const hist = Array.isArray(ctx.calcHistory) ? ctx.calcHistory.slice(-8) : [];
  return `You are the AI assistant of Futuristic Calculator — a simple, clean calculator app.
Help users calculate in natural language (Vietnamese or English). Reply in the user's language.

CRITICAL:
1. NEVER do arithmetic yourself. ALWAYS call calculate or percentage tools so results are VERIFIED by the engine.
2. When user says "kết quả này", "this result", "current" → use context result.
3. You can EXPLAIN how a result was obtained (show steps) after tools return.
4. You can RECALL recent calculation history provided in context.
5. Suggest actions like "Use in Calculator" but never change the calculator yourself.
6. Keep answers concise and useful.

Current calculator:
- Expression: ${ctx.expression || '(empty)'}
- Result: ${ctx.result != null ? ctx.result : '(none)'}
Recent history:
${hist.length ? hist.map((h, i) => `${i + 1}. ${h.expr} = ${h.result}`).join('\n') : '(none)'}

Tools: calculate(expression), percentage(value, percent).`;
}

async function callOpenAICompat({ baseUrl, apiKey, model, messages, tools }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: model === 'auto' ? 'gpt-4o-mini' : model,
    messages,
    temperature: 0.2,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'local') headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
    store.appendLog('error', 'openai-compat', { status: res.status, detail: text.slice(0, 120) });
    throw err;
  }
  return res.json();
}

async function callGemini({ apiKey, model, messages }) {
  const mid = model === 'auto' ? 'gemini-1.5-flash' : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mid}:generateContent?key=${apiKey}`;
  const system = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));
  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
    generationConfig: { temperature: 0.2 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    store.appendLog('error', 'gemini', { status: res.status, detail: text.slice(0, 120) });
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

async function callAnthropic({ apiKey, model, messages }) {
  const mid = model === 'auto' ? 'claude-3-5-haiku-20241022' : model;
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const msgs = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content || '',
  }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: mid,
      max_tokens: 1024,
      system,
      messages: msgs,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    store.appendLog('error', 'anthropic', { status: res.status });
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

async function executeTools(toolCalls) {
  const results = [];
  for (const tc of toolCalls || []) {
    const name = tc.function?.name || tc.name;
    let args = {};
    try {
      args = typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments || '{}')
        : (tc.function?.arguments || tc.arguments || {});
    } catch { args = {}; }
    const tool = TOOLS[name];
    if (!tool) {
      results.push({ tool_call_id: tc.id, name, content: JSON.stringify({ error: 'Unknown tool' }) });
      continue;
    }
    try {
      const out = await tool.handler(args);
      results.push({ tool_call_id: tc.id, name, content: JSON.stringify(out) });
    } catch (e) {
      results.push({ tool_call_id: tc.id, name, content: JSON.stringify({ error: e.message }) });
    }
  }
  return results;
}

async function chat({ message, context, history = [] }) {
  if (!isConfigured()) {
    return {
      ok: false,
      error: 'AI unavailable',
      detail: 'Set provider & API key in Settings (AI panel).',
      verified: false,
    };
  }

  const c = cfg();
  const meta = PROVIDER_CATALOG.find((p) => p.id === c.provider) || PROVIDER_CATALOG.find((p) => p.id === 'custom');
  const baseUrl = (c.baseUrl || meta.baseUrl || '').replace(/\/$/, '');
  const system = buildSystemPrompt(context);
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6),
    { role: 'user', content: message },
  ];
  const toolDefs = Object.values(TOOLS);

  try {
    store.appendLog('info', 'ai.chat', { provider: c.provider, model: c.model });
    let data;
    if (c.provider === 'gemini' || meta.kind === 'gemini') {
      // Gemini path: inject tool instruction into system for simple flow
      const toolHint = '\n\nWhen you need a calculation, reply ONLY with JSON: {"tool":"calculate","expression":"..."} or {"tool":"percentage","value":N,"percent":P}. Otherwise reply normally.';
      messages[0].content += toolHint;
      data = await callGemini({ apiKey: c.apiKey, model: c.model, messages });
      // Try parse tool JSON from reply
      const raw = data.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (m) {
        try {
          const j = JSON.parse(m[0]);
          if (j.tool === 'calculate' && j.expression) {
            const out = await TOOLS.calculate.handler({ expression: j.expression });
            const verifiedResults = out.verified ? [out] : [];
            const explain = out.verified
              ? `${out.expression} = ${out.result}\n✓ Verified by Calculator Engine`
              : (out.error || 'Calculation failed');
            return { ok: true, reply: explain, verifiedResults, verified: !!out.verified };
          }
          if (j.tool === 'percentage') {
            const out = await TOOLS.percentage.handler({ value: j.value, percent: j.percent });
            const verifiedResults = out.verified ? [out] : [];
            return {
              ok: true,
              reply: out.verified ? `${out.expression} = ${out.result}\n✓ Verified` : (out.error || 'Failed'),
              verifiedResults,
              verified: !!out.verified,
            };
          }
        } catch { /* fall through */ }
      }
    } else if (c.provider === 'anthropic' || meta.kind === 'anthropic') {
      data = await callAnthropic({ apiKey: c.apiKey, model: c.model, messages });
    } else {
      if (!baseUrl) throw new Error('No base URL for provider. Set Base URL in Settings.');
      data = await callOpenAICompat({
        baseUrl,
        apiKey: c.apiKey || 'local',
        model: c.model,
        messages,
        tools: toolDefs,
      });
    }

    let choice = data.choices?.[0]?.message;
    if (!choice) return { ok: false, error: 'Empty response from AI', verified: false };

    let toolResults = [];
    let verifiedResults = [];
    if (choice.tool_calls?.length) {
      toolResults = await executeTools(choice.tool_calls);
      for (const tr of toolResults) {
        try {
          const parsed = JSON.parse(tr.content);
          if (parsed.verified && parsed.result != null) verifiedResults.push(parsed);
        } catch { /* ignore */ }
      }
      // second turn
      const followMessages = [
        ...messages,
        choice,
        ...toolResults.map((tr) => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: tr.content,
        })),
      ];
      const follow = await callOpenAICompat({
        baseUrl,
        apiKey: c.apiKey || 'local',
        model: c.model,
        messages: followMessages,
        tools: toolDefs,
      });
      choice = follow.choices?.[0]?.message || choice;
    }

    return {
      ok: true,
      reply: choice.content || '',
      verifiedResults,
      toolResults: toolResults.map((t) => ({ name: t.name, content: t.content })),
      verified: verifiedResults.length > 0,
    };
  } catch (e) {
    store.appendLog('error', 'ai.chat.fail', { error: e.message });
    return {
      ok: false,
      error: 'AI connection failed',
      detail: e.message,
      verified: false,
    };
  }
}

function status() {
  const pub = store.publicSettings();
  const configured = isConfigured();
  return {
    configured,
    provider: pub.provider,
    model: pub.model,
    mode: pub.mode,
    hasKey: pub.hasKey,
    maskedKey: pub.maskedKey,
    baseUrl: pub.baseUrl,
    catalog: catalogPublic(),
    message: configured
      ? `AI ready (${pub.provider}${pub.model && pub.model !== 'auto' ? ' / ' + pub.model : ''})`
      : (pub.provider === 'none' || !pub.provider
        ? 'AI not configured — open Settings'
        : 'Local AI: Not configured'),
  };
}

module.exports = {
  chat,
  status,
  isConfigured,
  catalogPublic,
  TOOLS,
  evaluate,
  PROVIDER_CATALOG,
};
