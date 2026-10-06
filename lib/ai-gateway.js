/**
 * Lightweight AI Gateway for Futuristic Calculator.
 * Supports OpenAI-compatible endpoints + Gemini via env configuration.
 * No hard-coded keys. Secrets only from process.env.
 *
 * Env:
 *   AI_PROVIDER=openai|gemini|deepseek|openrouter|custom|none
 *   AI_API_KEY=...
 *   AI_BASE_URL=... (for custom / openai-compat)
 *   AI_MODEL=... or "auto"
 *   AI_MODE=local_only|prefer_local|balanced|cloud_enabled|custom
 */
'use strict';

const { evaluate, percentage } = require('./calc-engine');

const PROVIDERS = {
  openai: { baseUrl: 'https://api.openai.com/v1', kind: 'openai' },
  deepseek: { baseUrl: 'https://api.deepseek.com', kind: 'openai' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', kind: 'openai' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', kind: 'openai' },
  xai: { baseUrl: 'https://api.x.ai/v1', kind: 'openai' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini' },
  custom: { baseUrl: '', kind: 'openai' },
};

function getConfig() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase();
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';
  const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'auto';
  const mode = process.env.AI_MODE || 'cloud_enabled';
  return { provider, apiKey, baseUrl, model, mode };
}

function isConfigured() {
  const cfg = getConfig();
  if (cfg.provider === 'none' || !cfg.provider) return false;
  if (cfg.provider === 'custom' && !cfg.baseUrl) return false;
  // Local-only without key still possible if baseUrl is set
  if (cfg.mode === 'local_only' && cfg.baseUrl) return true;
  return !!cfg.apiKey || (cfg.provider === 'custom' && cfg.baseUrl);
}

/**
 * Tool registry — only real implementations.
 */
const TOOLS = {
  calculate: {
    name: 'calculate',
    description: 'Evaluate a math expression using the verified calculator engine. Supports + - * / ( ) and %.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression, e.g. "1250000 * 0.15" or "10e6 - 2e6"' },
      },
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
    description: 'Compute percentage of a value. e.g. 15% of 2_000_000',
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

function buildSystemPrompt(context) {
  const ctx = context || {};
  return `You are the AI assistant of Futuristic Calculator.
You help users perform calculations in natural language (Vietnamese or English).

CRITICAL RULES:
1. NEVER compute arithmetic yourself. Always call the calculate or percentage tool.
2. Use the calculator engine for every numeric result so it is VERIFIED.
3. When the user refers to "kết quả này", "this result", "current", use the provided context.
4. Reply in the same language the user used.
5. After tool results, explain briefly and mark verified results with ✓ Verified.
6. Do not invent numbers. If a tool fails, say so clearly.
7. Suggest next actions: Add to Workspace, Use in Calculator — but do not apply them yourself.

Current calculator context:
- Expression: ${ctx.expression || '(empty)'}
- Result: ${ctx.result != null ? ctx.result : '(none)'}
- Workspace summary: ${ctx.workspace || '(empty)'}

Available tools: calculate(expression), percentage(value, percent).`;
}

async function callOpenAICompat({ baseUrl, apiKey, model, messages, tools }) {
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: model === 'auto' ? 'gpt-4o-mini' : model,
    messages,
    temperature: 0.2,
  };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = 'auto';
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function callGemini({ apiKey, model, messages, tools }) {
  // Simplified Gemini: convert to generateContent, tool calling is limited
  const mid = model === 'auto' ? 'gemini-1.5-flash' : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mid}:generateContent?key=${apiKey}`;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));
  const system = messages.find((m) => m.role === 'system');
  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
    generationConfig: { temperature: 0.2 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return {
    choices: [{ message: { role: 'assistant', content: text } }],
  };
}

async function executeTools(toolCalls) {
  const results = [];
  for (const tc of toolCalls || []) {
    const name = tc.function?.name || tc.name;
    const args = typeof tc.function?.arguments === 'string'
      ? JSON.parse(tc.function.arguments || '{}')
      : (tc.function?.arguments || tc.arguments || {});
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

/**
 * Main entry: process a user message with optional context.
 */
async function chat({ message, context, history = [] }) {
  const cfg = getConfig();
  if (!isConfigured()) {
    return {
      ok: false,
      error: 'AI unavailable',
      detail: cfg.provider === 'none'
        ? 'AI provider not configured. Set AI_PROVIDER and AI_API_KEY (or AI_BASE_URL for local).'
        : 'Local AI: Not configured',
      verified: false,
    };
  }

  const system = buildSystemPrompt(context);
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6),
    { role: 'user', content: message },
  ];

  const toolDefs = Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  try {
    let providerMeta = PROVIDERS[cfg.provider] || PROVIDERS.custom;
    let baseUrl = cfg.baseUrl || providerMeta.baseUrl;
    let data;

    if (cfg.provider === 'gemini' || providerMeta.kind === 'gemini') {
      data = await callGemini({ apiKey: cfg.apiKey, model: cfg.model, messages, tools: toolDefs });
    } else {
      if (!baseUrl) throw new Error('No base URL for provider');
      data = await callOpenAICompat({
        baseUrl,
        apiKey: cfg.apiKey || 'local',
        model: cfg.model,
        messages,
        tools: toolDefs,
      });
    }

    let choice = data.choices?.[0]?.message;
    if (!choice) {
      return { ok: false, error: 'Empty response from AI', verified: false };
    }

    // Handle tool calls (OpenAI style)
    let toolResults = [];
    let verifiedResults = [];
    if (choice.tool_calls && choice.tool_calls.length) {
      toolResults = await executeTools(choice.tool_calls);
      for (const tr of toolResults) {
        try {
          const parsed = JSON.parse(tr.content);
          if (parsed.verified && parsed.result != null) {
            verifiedResults.push(parsed);
          }
        } catch { /* ignore */ }
      }

      // Second turn with tool results
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
        apiKey: cfg.apiKey || 'local',
        model: cfg.model,
        messages: followMessages,
        tools: toolDefs,
      });
      choice = follow.choices?.[0]?.message || choice;
    }

    // Fallback: if no tools used but user asked a calculation, try to extract expression
    // and force verify via engine (safety net)
    let content = choice.content || '';
    if (verifiedResults.length === 0) {
      // Heuristic: look for simple math patterns the model might have answered directly
      // Do not invent; only if we can re-verify
    }

    return {
      ok: true,
      reply: content,
      verifiedResults,
      toolResults: toolResults.map((t) => ({ name: t.name, content: t.content })),
      verified: verifiedResults.length > 0,
    };
  } catch (e) {
    return {
      ok: false,
      error: 'AI connection failed',
      detail: e.message,
      verified: false,
    };
  }
}

function status() {
  const cfg = getConfig();
  return {
    configured: isConfigured(),
    provider: cfg.provider,
    model: cfg.model,
    mode: cfg.mode,
    hasKey: !!cfg.apiKey,
    baseUrl: cfg.baseUrl || (PROVIDERS[cfg.provider]?.baseUrl || ''),
    message: isConfigured()
      ? `AI ready (${cfg.provider})`
      : (cfg.provider === 'none' ? 'AI not configured' : 'Local AI: Not configured'),
  };
}

module.exports = {
  chat,
  status,
  isConfigured,
  getConfig,
  TOOLS,
  evaluate, // re-export for tests
};
