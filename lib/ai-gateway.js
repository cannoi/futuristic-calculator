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

/** Full in-app knowledge base — AI acts as interactive user manual */
const APP_KNOWLEDGE = `
# Futuristic Calculator AI — App Guide

## What this app is
A simple futuristic calculator with an AI assistant. The main screen is ONLY the calculator keypad.
One floating robot button opens the AI panel (Chat, Feedback, Settings, Logs).

## Calculator (main screen)
- Number buttons 0–9 and decimal point (.)
- Operators: + − × ÷
- AC = clear all (expression + result)
- DEL = delete last digit
- = = compute using the built-in engine
- Display: top line = ongoing expression (history), bottom = current number / result
- Results are computed locally — works offline, no AI needed

## AI panel (robot button)
Four tabs:
1. **Chat** — Ask anything in Vietnamese or English:
   - Natural-language calculations ("15% của 2 triệu")
   - Explain a result ("giải thích kết quả này")
   - Recall history ("phép tính vừa rồi là gì?")
   - How to use the app ("làm sao bật AI?", "cách gửi feedback")
   - Ask AI to operate the calculator ("xóa máy tính", "điền 1000 vào máy tính", "tính 25*4 rồi đưa vào máy tính")
2. **Feedback** — Send bug/improvement/question + star rating. Donate info from the author appears here. No password needed.
3. **Settings** — Configure AI provider (OpenAI, Gemini, DeepSeek, Anthropic, OpenRouter, Groq, Mistral, xAI, Custom), API key, Base URL (required for Custom/Local), Model, Mode.
4. **Logs** — View/clear app diagnostic logs.

## AI status
- Green dot on robot = AI configured and ready
- Red/gray = not configured → open Settings and add a key
- Calculator always works even if AI is offline

## Donate / Feedback Hub
Feedback tab may show author donate links/addresses from SoloHost Feedback Hub.
Unread notices show a red badge on the robot button.

## Privacy
- API keys stored only on the server (masked in UI after save)
- Feedback sends only the message you type — never passwords or keys
`;

const TOOLS = {
  calculate: {
    name: 'calculate',
    description: 'Evaluate a math expression with the verified calculator engine. Supports + - * / ( ) %. Use for ANY arithmetic — never compute yourself.',
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
  get_app_info: {
    name: 'get_app_info',
    description: 'Return structured help about a feature of this app. Topics: calculator, ai_panel, feedback, settings, logs, donate, status, overview.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'calculator | ai_panel | feedback | settings | logs | donate | status | overview',
        },
      },
      required: ['topic'],
    },
    handler: async ({ topic }) => {
      const t = String(topic || 'overview').toLowerCase();
      const map = {
        overview: 'Futuristic Calculator AI: máy tính đơn giản + nút robot AI. Chat để tính toán ngôn ngữ tự nhiên, hỏi hướng dẫn, hoặc nhờ AI thao tác máy tính. Tab Feedback / Settings / Logs nằm trong panel AI.',
        calculator: 'Màn hình chính chỉ có máy tính: số 0-9, dấu ., + − × ÷, AC (xóa hết), DEL (xóa 1 ký tự), = (tính). Dòng trên = biểu thức, dòng dưới = số hiện tại/kết quả. Hoạt động offline.',
        ai_panel: 'Bấm nút robot góc dưới phải → panel AI với 4 tab: Chat, Feedback, Settings, Logs. Chấm xanh = AI sẵn sàng; đỏ/xám = chưa cấu hình key.',
        feedback: 'Tab Feedback: chọn loại (bug/improvement/question), rating sao, nhập nội dung → Send. Không cần mật khẩu. Thông tin ủng hộ tác giả (donate) hiện ở đầu tab nếu Hub có dữ liệu. Badge đỏ trên nút robot = tin chưa đọc.',
        settings: 'Tab Settings: chọn Provider (OpenAI, Gemini, DeepSeek, Anthropic, OpenRouter, Groq, Mistral, xAI, Custom), dán API Key, Base URL (bắt buộc với Custom/Local), Model (auto hoặc tên model), Mode. Save. Key chỉ hiện dạng che sau khi lưu.',
        logs: 'Tab Logs: xem log chẩn đoán app (AI errors, settings save, calculate…). Refresh / Clear.',
        donate: 'Thông tin ủng hộ lấy từ SoloHost Feedback Hub, hiển thị trong tab Feedback (link, địa chỉ ví, ghi chú tác giả nếu có).',
        status: 'AI status phụ thuộc Settings. Calculator luôn chạy độc lập. Nếu AI lỗi → vẫn dùng máy tính bình thường.',
      };
      return { topic: t, help: map[t] || map.overview, verified: true };
    },
  },
  app_action: {
    name: 'app_action',
    description: 'Request a UI action on the calculator app. The client will execute safe actions. Types: clear_all, set_result, set_expression, open_tab, use_result_in_calc.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'clear_all | set_result | set_expression | open_tab | use_result_in_calc',
        },
        value: { type: 'string', description: 'For set_result / set_expression: the number or expression. For open_tab: chat|feedback|settings|logs' },
      },
      required: ['action'],
    },
    handler: async ({ action, value }) => {
      const allowed = ['clear_all', 'set_result', 'set_expression', 'open_tab', 'use_result_in_calc'];
      const a = String(action || '');
      if (!allowed.includes(a)) return { error: 'Unknown action', ok: false };
      if ((a === 'set_result' || a === 'set_expression' || a === 'use_result_in_calc') && (value == null || value === '')) {
        return { error: 'value required', ok: false };
      }
      if (a === 'open_tab') {
        const tab = String(value || 'chat').toLowerCase();
        if (!['chat', 'feedback', 'settings', 'logs'].includes(tab)) {
          return { error: 'invalid tab', ok: false };
        }
        return { ok: true, action: a, value: tab, client_execute: true };
      }
      return { ok: true, action: a, value: value != null ? String(value) : undefined, client_execute: true };
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
  return `You are the built-in AI assistant and interactive user manual of **Futuristic Calculator AI**.
You know this app completely. Users ask you instead of reading a help document.

${APP_KNOWLEDGE}

## Current live context
- Expression on display: ${ctx.expression || '(empty)'}
- Current result / number: ${ctx.result != null ? ctx.result : '(none)'}
- Recent calculation history:
${hist.length ? hist.map((h, i) => `${i + 1}. ${h.expr} = ${h.result}`).join('\n') : '(none yet)'}

## Rules
1. NEVER compute arithmetic yourself. ALWAYS call tool **calculate** or **percentage** so results are ✓ Verified by the engine.
2. For "how do I…", "app này dùng thế nào", feature questions → call **get_app_info** (or answer from APP_KNOWLEDGE accurately).
3. When user asks you to operate the app ("xóa máy tính", "điền 500 vào", "mở settings", "đưa kết quả vào máy tính") → call **app_action**.
4. After tools return, explain briefly in the user's language (Vietnamese if they wrote Vietnamese).
5. Mark verified numeric results with ✓ Verified.
6. Keep replies concise, friendly, practical.
7. If AI provider is the only way to answer complex questions but tools already cover help/calc/actions, prefer tools.

Tools: calculate, percentage, get_app_info, app_action.`;
}

/**
 * Offline / no-key helper: answer common help & simple calc without LLM.
 */
function localAssist(message, context) {
  const msg = String(message || '').trim();
  const lower = msg.toLowerCase();
  const actions = [];
  const verifiedResults = [];
  let m;

  // App actions (local)
  if (/(xóa|xoá|clear|reset).*(máy|calc|hết|all)/i.test(msg) || /^(ac|clear all)$/i.test(msg)) {
    actions.push({ action: 'clear_all', client_execute: true });
    return { ok: true, reply: 'Đã xóa máy tính (AC).', actions, verified: false, source: 'local' };
  }
  if (/(mở|open).*(setting|cài đặt|cau hinh|cấu hình)/i.test(msg)) {
    actions.push({ action: 'open_tab', value: 'settings', client_execute: true });
    return { ok: true, reply: 'Mở tab Settings — chọn provider và dán API key tại đây.', actions, verified: false, source: 'local' };
  }
  if (/(mở|open).*(feedback|phản hồi)/i.test(msg)) {
    actions.push({ action: 'open_tab', value: 'feedback', client_execute: true });
    return { ok: true, reply: 'Mở tab Feedback — gửi góp ý hoặc xem thông tin ủng hộ.', actions, verified: false, source: 'local' };
  }
  if (/(mở|open).*(log)/i.test(msg)) {
    actions.push({ action: 'open_tab', value: 'logs', client_execute: true });
    return { ok: true, reply: 'Mở tab Logs.', actions, verified: false, source: 'local' };
  }

  // Set number into calculator
  m = msg.match(/(?:điền|nhập|set|đưa)\s*([\d.,]+)\s*(?:vào)?/i);
  if (m) {
    const v = m[1].replace(/,/g, '');
    actions.push({ action: 'set_result', value: v, client_execute: true });
    return { ok: true, reply: `Đã đưa ${v} vào máy tính.`, actions, verified: false, source: 'local' };
  }

  // Help topics
  const helpTriggers = [
    { re: /(cách dùng|hướng dẫn|help|how to|app này|tính năng|chức năng|hướng dẫn sử dụng)/i, topic: 'overview' },
    { re: /(feedback|phản hồi|góp ý|donate|ủng hộ)/i, topic: 'feedback' },
    { re: /(setting|api key|provider|cấu hình ai|bật ai)/i, topic: 'settings' },
    { re: /(log|nhật ký)/i, topic: 'logs' },
    { re: /(nút robot|panel ai|cửa sổ ai)/i, topic: 'ai_panel' },
    { re: /(keypad|cách dùng máy|phím ac|phím del|nút ac)/i, topic: 'calculator' },
  ];
  // Synchronous help
  for (const h of helpTriggers) {
    if (h.re.test(lower)) {
      // call handler sync-style
      let helpText = '';
      const map = {
        overview: 'Futuristic Calculator AI: màn hình chính là máy tính. Nút robot → Chat / Feedback / Settings / Logs. Hỏi tôi bất kỳ điều gì về app hoặc nhờ tính toán.',
        feedback: 'Vào tab Feedback trong panel AI: chọn loại, rating, nhập nội dung → Send. Thông tin donate (nếu có) hiện phía trên. Không cần mật khẩu.',
        settings: 'Tab Settings: chọn Provider → dán API Key → (Custom thì thêm Base URL) → Model (auto) → Save. Chấm xanh trên nút robot = AI sẵn sàng.',
        logs: 'Tab Logs xem lỗi/chẩn đoán. Refresh hoặc Clear khi cần.',
        ai_panel: 'Bấm nút robot góc dưới phải. 4 tab: Chat, Feedback, Settings, Logs.',
        calculator: 'Dùng như máy tính thường: số, + − × ÷, AC xóa hết, DEL xóa 1 ký tự, = ra kết quả. Hoạt động offline.',
      };
      helpText = map[h.topic] || map.overview;
      return { ok: true, reply: helpText, actions: [], verified: false, source: 'local' };
    }
  }

  // Simple pure math like "1+1" or "100*1.15" without needing LLM
  const mathOnly = msg.replace(/,/g, '').replace(/\s/g, '');
  if (/^[\d.+\-*/()%×÷]+$/.test(msg.replace(/\s/g, '')) || /^[\d.+\-*/()%]+$/.test(mathOnly)) {
    const expr = msg.replace(/×/g, '*').replace(/÷/g, '/');
    const r = evaluate(expr);
    if (r.ok) {
      verifiedResults.push(r);
      actions.push({ action: 'set_result', value: String(r.value), client_execute: true });
      return {
        ok: true,
        reply: `${r.expression} = ${r.value}\n✓ Verified by Calculator Engine`,
        verifiedResults,
        actions,
        verified: true,
        source: 'local',
      };
    }
  }

  // Percentage patterns Vietnamese/English without LLM
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:của|of)\s*(\d+(?:[.,]\d+)?(?:\s*triệu|\s*tr|\s*triệu)?)/i);
  if (!m) m = msg.match(/(?:của|of)\s*(\d+(?:[.,]\d+)?(?:\s*triệu)?)\s*.*?(\d+(?:[.,]\d+)?)\s*%/i);
  if (m) {
    let a = parseFloat(String(m[1]).replace(',', '.'));
    let b = parseFloat(String(m[2]).replace(',', '.'));
    // "15% của 2 triệu"
    const hasTrieu = /triệu|tr\b/i.test(msg);
    if (/^\d+(?:[.,]\d+)?\s*%/.test(msg.trim())) {
      // first number is percent
      const pct = a;
      let val = b;
      if (hasTrieu && val < 1000) val *= 1e6;
      const r = percentage(val, pct);
      if (r.ok) {
        verifiedResults.push(r);
        actions.push({ action: 'set_result', value: String(r.value), client_execute: true });
        return {
          ok: true,
          reply: `${r.expression} = ${r.value}\n✓ Verified by Calculator Engine`,
          verifiedResults,
          actions,
          verified: true,
          source: 'local',
        };
      }
    }
  }
  // "15% của 2 triệu" more reliably
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*%\s*của\s*(\d+(?:[.,]\d+)?)\s*(triệu|tr|ngàn|nghìn)?/i);
  if (m) {
    const pct = parseFloat(m[1].replace(',', '.'));
    let val = parseFloat(m[2].replace(',', '.'));
    const unit = (m[3] || '').toLowerCase();
    if (unit.startsWith('tr')) val *= 1e6;
    else if (unit.startsWith('ng')) val *= 1e3;
    const r = percentage(val, pct);
    if (r.ok) {
      verifiedResults.push(r);
      actions.push({ action: 'set_result', value: String(r.value), client_execute: true });
      return {
        ok: true,
        reply: `${pct}% của ${m[2]}${m[3] ? ' ' + m[3] : ''} = ${r.value}\n✓ Verified by Calculator Engine`,
        verifiedResults,
        actions,
        verified: true,
        source: 'local',
      };
    }
  }

  return null; // no local match
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
    store.appendLog('error', 'openai-compat', { status: res.status, detail: text.slice(0, 120) });
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
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
    body: JSON.stringify({ model: mid, max_tokens: 1024, system, messages: msgs }),
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
  const actions = [];
  const verifiedResults = [];
  let m;
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
      if (out && out.verified && out.result != null) verifiedResults.push(out);
      if (out && out.client_execute) actions.push(out);
      if (out && out.help) {
        // pack help into content already
      }
    } catch (e) {
      results.push({ tool_call_id: tc.id, name, content: JSON.stringify({ error: e.message }) });
    }
  }
  return { results, actions, verifiedResults };
}

async function chat({ message, context, history = [] }) {
  // 1) Always try local assist first for help / simple calc / app actions
  const local = localAssist(message, context);
  if (local) {
    store.appendLog('info', 'ai.local', { msg: String(message).slice(0, 80) });
    return local;
  }

  if (!isConfigured()) {
    // Still answer with app knowledge offline
    const fallback = await TOOLS.get_app_info.handler({ topic: 'overview' });
    return {
      ok: true,
      reply: (fallback.help || '') +
        '\n\n(AI cloud chưa cấu hình — mở tab Settings để thêm API key. Máy tính và trợ giúp cơ bản vẫn dùng được.)',
      actions: [],
      verified: false,
      source: 'local-fallback',
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
      const toolHint = `\n\nWhen you need a tool, reply ONLY with JSON one of:
{"tool":"calculate","expression":"..."}
{"tool":"percentage","value":N,"percent":P}
{"tool":"get_app_info","topic":"overview|calculator|settings|feedback|logs|ai_panel"}
{"tool":"app_action","action":"clear_all|set_result|open_tab","value":"..."}
Otherwise reply normally in the user language.`;
      messages[0].content += toolHint;
      data = await callGemini({ apiKey: c.apiKey, model: c.model, messages });
      const raw = data.choices?.[0]?.message?.content || '';
      const jm = raw.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (jm) {
        try {
          const j = JSON.parse(jm[0]);
          if (j.tool && TOOLS[j.tool]) {
            const out = await TOOLS[j.tool].handler(j);
            const actions = out.client_execute ? [out] : [];
            const verifiedResults = (out.verified && out.result != null) ? [out] : [];
            let reply = out.help || '';
            if (out.verified && out.result != null) {
              reply = `${out.expression || ''} = ${out.result}\n✓ Verified by Calculator Engine`;
            } else if (out.ok && out.action) {
              reply = reply || `Đã thực hiện: ${out.action}${out.value ? ' → ' + out.value : ''}`;
            } else if (out.error) {
              reply = out.error;
            }
            // strip JSON from any surrounding text
            const textAround = raw.replace(jm[0], '').trim();
            if (textAround) reply = textAround + '\n' + reply;
            return { ok: true, reply: reply.trim(), verifiedResults, actions, verified: verifiedResults.length > 0 };
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
    let actions = [];
    let verifiedResults = [];
    if (choice.tool_calls?.length) {
      const exec = await executeTools(choice.tool_calls);
      toolResults = exec.results;
      actions = exec.actions;
      verifiedResults = exec.verifiedResults;

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
      actions,
      toolResults: toolResults.map((t) => ({ name: t.name, content: t.content })),
      verified: verifiedResults.length > 0,
      source: 'llm',
    };
  } catch (e) {
    store.appendLog('error', 'ai.chat.fail', { error: e.message });
    // degrade to local if possible
    const again = localAssist(message, context);
    if (again) return again;
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
    localAssist: true,
    message: configured
      ? `AI ready (${pub.provider}${pub.model && pub.model !== 'auto' ? ' / ' + pub.model : ''})`
      : 'Local assist ON · Cloud AI: open Settings',
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
  localAssist,
};
