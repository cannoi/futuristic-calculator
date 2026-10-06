/* ===== Original Calculator (preserved) ===== */
let current = '0';
let history = '';
const calcHistory = []; // local history for AI context

function update() {
  document.getElementById('result').innerText = current;
  document.getElementById('history').innerText = history;
}
function appendNum(n) {
  if (current === '0') current = n;
  else current += n;
  update();
}
function appendOp(op) {
  history = current + ' ' + op;
  current = '0';
  update();
}
function clearAll() {
  current = '0';
  history = '';
  update();
}
function deleteLast() {
  current = current.slice(0, -1) || '0';
  update();
}
function calculate() {
  try {
    const expr = (history ? history + ' ' : '') + current;
    let h = history.replace(/×/g, '*').replace(/÷/g, '/');
    const result = eval(h + current).toString();
    calcHistory.push({ expr: expr.trim(), result, ts: Date.now() });
    if (calcHistory.length > 40) calcHistory.shift();
    current = result;
    history = '';
  } catch {
    current = 'Error';
  }
  update();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Execute safe actions returned by AI (local or cloud) */
function executeAppActions(actions) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || !a.action) continue;
    switch (a.action) {
      case 'clear_all':
        clearAll();
        break;
      case 'set_result':
      case 'use_result_in_calc':
        if (a.value != null) {
          current = String(a.value);
          history = '';
          update();
        }
        break;
      case 'set_expression':
        if (a.value != null) {
          history = String(a.value);
          current = '0';
          update();
        }
        break;
      case 'open_tab': {
        const tab = a.value || 'chat';
        const btn = document.querySelector('.tab[data-tab="' + tab + '"]');
        if (btn) btn.click();
        break;
      }
      default:
        break;
    }
  }
}

/* ===== Tabs ===== */
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const pane = document.getElementById('tab-' + t.dataset.tab);
    if (pane) pane.classList.add('active');
    if (t.dataset.tab === 'settings') loadSettingsForm();
    if (t.dataset.tab === 'logs') loadLogs();
    if (t.dataset.tab === 'feedback') refreshFeedbackUI();
  });
});

/* ===== AI Panel open/close ===== */
const aiChat = document.getElementById('aiChat');
const aiInput = document.getElementById('aiInput');
const aiHistory = [];
let aiBusy = false;

function openAI() {
  document.getElementById('aiOverlay').hidden = false;
  refreshAiStatus();
  // default to chat
  document.querySelector('.tab[data-tab="chat"]')?.click();
  setTimeout(() => aiInput.focus(), 100);
}
function closeAI() {
  document.getElementById('aiOverlay').hidden = true;
}
document.getElementById('aiFab').addEventListener('click', openAI);
document.getElementById('aiClose').addEventListener('click', closeAI);
document.getElementById('aiOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'aiOverlay') closeAI();
});
document.getElementById('aiSend').addEventListener('click', sendAI);
aiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
});

function appendMsg(role, html) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = html;
  aiChat.appendChild(div);
  aiChat.scrollTop = aiChat.scrollHeight;
  return div;
}

async function refreshAiStatus() {
  const bar = document.getElementById('aiStatusBar');
  const dot = document.getElementById('aiStatusDot');
  try {
    const r = await fetch('/api/ai/status');
    const j = await r.json();
    bar.textContent = j.message || (j.configured ? 'AI ready' : 'AI unavailable');
    if (dot) {
      dot.classList.toggle('on', !!j.configured);
      dot.classList.toggle('off', !j.configured);
    }
  } catch {
    bar.textContent = 'AI unavailable';
    if (dot) { dot.classList.remove('on'); dot.classList.add('off'); }
  }
}

function getCalcContext() {
  return {
    expression: (history ? history + ' ' : '') + current,
    result: current === 'Error' ? null : current,
    calcHistory: calcHistory.slice(-10),
  };
}

async function sendAI() {
  const text = (aiInput.value || '').trim();
  if (!text || aiBusy) return;
  aiInput.value = '';
  appendMsg('user', escapeHtml(text));
  aiBusy = true;
  const loading = appendMsg('ai', '…');

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        context: getCalcContext(),
        history: aiHistory.slice(-6),
      }),
    });
    const data = await res.json();
    loading.remove();

    if (!data.ok) {
      appendMsg('ai', escapeHtml(data.error || 'AI unavailable') +
        (data.detail ? `<br><small style="opacity:.6">${escapeHtml(data.detail)}</small>` : '') +
        '<br><small>Mở tab Settings để cấu hình API key. Trợ giúp cơ bản & máy tính vẫn dùng được.</small>');
      return;
    }

    // Execute app actions (clear, set result, open tab, …)
    if (data.actions && data.actions.length) {
      executeAppActions(data.actions);
    }

    let html = escapeHtml(data.reply || '').replace(/\n/g, '<br>');
    if (data.source === 'local' || data.source === 'local-fallback') {
      html += '<div style="margin-top:6px;font-size:0.7rem;opacity:.5">Local assist</div>';
    }
    if (data.verifiedResults && data.verifiedResults.length) {
      for (const vr of data.verifiedResults) {
        html += `<div class="verified">✓ Verified: ${escapeHtml(String(vr.result))} <small>(${escapeHtml(vr.expression || '')})</small></div>`;
        html += `<div class="actions">
          <button type="button" data-action="calc" data-result="${escapeHtml(String(vr.result))}">Use in Calculator</button>
          <button type="button" data-action="explain" data-expr="${escapeHtml(vr.expression || '')}" data-result="${escapeHtml(String(vr.result))}">Explain</button>
        </div>`;
        calcHistory.push({ expr: vr.expression || '', result: String(vr.result), ts: Date.now(), source: 'AI' });
      }
    }
    const bubble = appendMsg('ai', html);
    bubble.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'calc') {
          current = btn.dataset.result;
          history = '';
          update();
          closeAI();
        } else if (btn.dataset.action === 'explain') {
          aiInput.value = `Giải thích phép tính: ${btn.dataset.expr} = ${btn.dataset.result}`;
          sendAI();
        }
      });
    });

    aiHistory.push({ role: 'user', content: text });
    aiHistory.push({ role: 'assistant', content: data.reply || '' });
    if (aiHistory.length > 20) aiHistory.splice(0, 4);
  } catch (e) {
    loading.remove();
    appendMsg('ai', 'AI connection failed. Máy tính vẫn hoạt động bình thường.');
  } finally {
    aiBusy = false;
  }
}

/* ===== Settings ===== */
async function loadSettingsForm() {
  try {
    const [st, cat] = await Promise.all([
      fetch('/api/ai/settings').then((r) => r.json()),
      fetch('/api/ai/catalog').then((r) => r.json()).catch(() => ({ providers: [] })),
    ]);
    const sel = document.getElementById('setProvider');
    const providers = (cat.providers && cat.providers.length)
      ? cat.providers
      : [
        { id: 'openai', name: 'OpenAI' }, { id: 'gemini', name: 'Google Gemini' },
        { id: 'deepseek', name: 'DeepSeek' }, { id: 'anthropic', name: 'Anthropic' },
        { id: 'openrouter', name: 'OpenRouter' }, { id: 'groq', name: 'Groq' },
        { id: 'mistral', name: 'Mistral' }, { id: 'xai', name: 'xAI' },
        { id: 'custom', name: 'Custom OpenAI-compatible' },
      ];
    sel.innerHTML = '<option value="none">— None —</option>' +
      providers.map((p) => `<option value="${p.id}">${escapeHtml(p.name || p.id)}</option>`).join('');
    sel.value = st.provider || 'none';
    document.getElementById('setApiKey').value = '';
    document.getElementById('setKeyHint').textContent = st.hasKey
      ? `Key hiện tại: ${st.maskedKey || '****'}`
      : 'Key hiện tại: (chưa có)';
    document.getElementById('setBaseUrl').value = st.baseUrl || '';
    document.getElementById('setModel').value = st.model || 'auto';
    document.getElementById('setMode').value = st.mode || 'cloud_enabled';
  } catch (e) {
    document.getElementById('setStatus').textContent = 'Không tải được settings';
  }
}

document.getElementById('setSave').addEventListener('click', async () => {
  const status = document.getElementById('setStatus');
  status.textContent = 'Saving…';
  try {
    const body = {
      provider: document.getElementById('setProvider').value,
      baseUrl: document.getElementById('setBaseUrl').value.trim(),
      model: document.getElementById('setModel').value.trim() || 'auto',
      mode: document.getElementById('setMode').value,
    };
    const key = document.getElementById('setApiKey').value.trim();
    if (key) body.apiKey = key;
    const r = await fetch('/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) {
      status.textContent = 'Saved ✓';
      document.getElementById('setApiKey').value = '';
      await loadSettingsForm();
      refreshAiStatus();
    } else {
      status.textContent = j.error || 'Failed';
    }
  } catch (e) {
    status.textContent = e.message;
  }
});

/* ===== Logs ===== */
async function loadLogs() {
  const view = document.getElementById('logsView');
  try {
    const r = await fetch('/api/logs?limit=100');
    const j = await r.json();
    if (!j.logs || !j.logs.length) {
      view.textContent = '(no logs)';
      return;
    }
    view.textContent = j.logs.map((l) =>
      `${l.ts || ''} [${l.level}] ${l.msg}${l.error ? ' · ' + l.error : ''}${l.provider ? ' · ' + l.provider : ''}`
    ).join('\n');
  } catch {
    view.textContent = 'Failed to load logs';
  }
}
document.getElementById('logsRefresh').addEventListener('click', loadLogs);
document.getElementById('logsClear').addEventListener('click', async () => {
  await fetch('/api/logs', { method: 'DELETE' });
  loadLogs();
});

/* ===== Feedback (inside AI panel) ===== */
let shfh = null;
let fbRating = 0;
let unreadCount = 0;
let lastSync = null;

document.querySelectorAll('#fbStars button').forEach((b) => {
  b.addEventListener('click', () => {
    fbRating = Number(b.dataset.r);
    document.querySelectorAll('#fbStars button').forEach((x) => {
      x.classList.toggle('on', Number(x.dataset.r) <= fbRating);
    });
  });
});
document.getElementById('fbSubmit').addEventListener('click', submitFeedback);

function setUnreadBadge(n) {
  unreadCount = n || 0;
  const badge = document.getElementById('aiBadge');
  const tabBadge = document.getElementById('fbTabBadge');
  if (unreadCount > 0) {
    badge.hidden = false;
    badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    if (tabBadge) {
      tabBadge.hidden = false;
      tabBadge.textContent = String(unreadCount);
    }
  } else {
    badge.hidden = true;
    if (tabBadge) tabBadge.hidden = true;
  }
}

function renderDonate(donate) {
  const box = document.getElementById('fbDonate');
  if (!box || !donate) { if (box) box.hidden = true; return; }
  box.hidden = false;
  let html = '<strong>Ủng hộ / Donate</strong><br>';
  // Show all useful fields from hub
  const fields = [
    ['author', 'Tác giả'],
    ['name', 'Tên'],
    ['label', 'Nhãn'],
    ['url', 'Link'],
    ['address', 'Địa chỉ'],
    ['wallet', 'Ví'],
    ['pi', 'Pi'],
    ['note', 'Ghi chú'],
    ['message', 'Thông báo'],
  ];
  let any = false;
  for (const [k, label] of fields) {
    if (donate[k]) {
      any = true;
      if (k === 'url') {
        html += `${label}: <a href="${escapeHtml(donate[k])}" target="_blank" rel="noopener">${escapeHtml(donate[k])}</a><br>`;
      } else {
        html += `${label}: ${escapeHtml(String(donate[k]))}<br>`;
      }
    }
  }
  // Also dump any other string fields
  for (const [k, v] of Object.entries(donate)) {
    if (fields.some((f) => f[0] === k)) continue;
    if (typeof v === 'string' && v.trim()) {
      any = true;
      html += `${escapeHtml(k)}: ${escapeHtml(v)}<br>`;
    }
  }
  if (!any) html += '<small>Hub chưa cung cấp thông tin donate.</small>';
  box.innerHTML = html;
}

function renderNotices(actions, notices) {
  const el = document.getElementById('fbNotices');
  if (!el) return;
  const items = [];
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (a.kind === 'update' || a.kind === 'unpaid_nudge' || a.kind === 'payment_ok' || a.id) {
        items.push(a);
      }
    }
  }
  if (Array.isArray(notices)) {
    for (const n of notices) items.push(n);
  }
  if (!items.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = items.map((n) => {
    const id = n.id || n.update?.id || '';
    return `<div class="fb-notice" data-id="${escapeHtml(id)}">
      <strong>${escapeHtml(n.title || n.kind || 'Notice')}</strong>
      ${n.body ? `<div>${escapeHtml(n.body)}</div>` : ''}
      ${id ? `<button type="button" data-mark="${escapeHtml(id)}">Đã đọc</button>` : ''}
    </div>`;
  }).join('');
  el.querySelectorAll('[data-mark]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (shfh) {
        try { await shfh.markRead(btn.dataset.mark); } catch { /* ignore */ }
      }
      btn.closest('.fb-notice')?.remove();
      setUnreadBadge(Math.max(0, unreadCount - 1));
    });
  });
}

function refreshFeedbackUI() {
  if (!lastSync) return;
  renderDonate(lastSync.donate);
  renderNotices(lastSync.actions, lastSync.notices);
}

async function initFeedback() {
  try {
    const cfgRes = await fetch('/api/shfh-config');
    const cfg = await cfgRes.json();
    if (!cfg.enabled || !window.SHFH) return;

    shfh = window.SHFH.create({
      hubUrl: cfg.hubUrl,
      ingestToken: cfg.ingestToken,
      appId: cfg.appId,
      appName: cfg.appName,
      version: cfg.version,
      platform: cfg.platform || 'solohost',
      locale: 'vi',
    });

    const sync = await shfh.sync();
    lastSync = sync;
    const count = (sync.notices?.length || 0) +
      (sync.actions || []).filter((a) => a.kind === 'update' || a.kind === 'unpaid_nudge').length;
    setUnreadBadge(count);
    renderDonate(sync.donate);
    renderNotices(sync.actions, sync.notices);
  } catch (e) {
    console.warn('SHFH init', e);
  }
}

async function submitFeedback() {
  const msg = (document.getElementById('fbMessage').value || '').trim();
  const status = document.getElementById('fbStatus');
  if (!msg) {
    status.textContent = 'Vui lòng nhập nội dung.';
    return;
  }
  if (!shfh) {
    status.textContent = 'Feedback hub không khả dụng.';
    return;
  }
  status.textContent = 'Sending…';
  try {
    const type = document.getElementById('fbType').value;
    const out = await shfh.sendFeedback({ type, message: msg, rating: fbRating });
    if (out.ok || out.queued) {
      status.textContent = out.queued ? 'Đã xếp hàng (offline).' : 'Cảm ơn bạn!';
      document.getElementById('fbMessage').value = '';
      fbRating = 0;
      document.querySelectorAll('#fbStars button').forEach((x) => x.classList.remove('on'));
    } else {
      status.textContent = 'Lỗi: ' + (out.error || 'unknown');
    }
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
}

/* ===== Init ===== */
update();
refreshAiStatus();
initFeedback();
