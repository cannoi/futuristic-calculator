/* ===== Original Calculator Engine (preserved) ===== */
let current = '0';
let history = '';

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
    let h = history.replace(/×/g, '*').replace(/÷/g, '/');
    current = eval(h + current).toString();
    history = '';
  } catch {
    current = 'Error';
  }
  update();
}

/* ===== Workspace ===== */
const wsItems = [];

function renderWs() {
  const el = document.getElementById('wsBody');
  if (!el) return;
  if (!wsItems.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = wsItems.map((it, i) =>
    `<div class="ws-item" data-i="${i}">
      <div>${escapeHtml(it.expr || '')}</div>
      <div>= ${escapeHtml(String(it.result))} <span class="verified">${it.verified ? '✓' : ''}</span></div>
    </div>`
  ).join('');
}
function wsAddCurrent() {
  const expr = (history ? history + ' ' : '') + current;
  const val = current;
  if (val === 'Error' || val === '0' && !history) return;
  wsItems.push({ expr: expr.trim(), result: val, verified: true, source: 'Calculator', ts: Date.now() });
  if (wsItems.length > 30) wsItems.shift();
  renderWs();
}
function wsClear() {
  wsItems.length = 0;
  renderWs();
}
function wsCopy() {
  const text = wsItems.map(it => `${it.expr} = ${it.result}`).join('\n');
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}
function wsSendToCalc() {
  if (!wsItems.length) return;
  const last = wsItems[wsItems.length - 1];
  current = String(last.result);
  history = '';
  update();
}
function wsAddAI(expr, result, verified) {
  wsItems.push({ expr, result, verified: !!verified, source: 'AI', ts: Date.now() });
  if (wsItems.length > 30) wsItems.shift();
  renderWs();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ===== AI Panel ===== */
const aiChat = document.getElementById('aiChat');
const aiInput = document.getElementById('aiInput');
const aiHistory = [];
let aiBusy = false;

function openAI() {
  document.getElementById('aiOverlay').hidden = false;
  aiInput.focus();
  refreshAiStatus();
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
    workspace: wsItems.slice(-5).map(it => `${it.expr}=${it.result}`).join('; '),
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
        (data.detail ? `<br><small style="opacity:.6">${escapeHtml(data.detail)}</small>` : ''));
      return;
    }

    let html = escapeHtml(data.reply || '').replace(/\n/g, '<br>');
    if (data.verifiedResults && data.verifiedResults.length) {
      for (const vr of data.verifiedResults) {
        html += `<div class="verified">✓ Verified: ${escapeHtml(String(vr.result))} <small>(${escapeHtml(vr.expression || '')})</small></div>`;
        html += `<div class="actions">
          <button type="button" data-action="ws" data-expr="${escapeHtml(vr.expression || '')}" data-result="${escapeHtml(String(vr.result))}">Add to Workspace</button>
          <button type="button" data-action="calc" data-result="${escapeHtml(String(vr.result))}">Use in Calculator</button>
        </div>`;
      }
    }
    const bubble = appendMsg('ai', html);
    bubble.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'ws') {
          wsAddAI(btn.dataset.expr, btn.dataset.result, true);
        } else if (btn.dataset.action === 'calc') {
          current = btn.dataset.result;
          history = '';
          update();
          closeAI();
        }
      });
    });

    aiHistory.push({ role: 'user', content: text });
    aiHistory.push({ role: 'assistant', content: data.reply || '' });
    if (aiHistory.length > 20) aiHistory.splice(0, 4);
  } catch (e) {
    loading.remove();
    appendMsg('ai', 'AI connection failed. Calculator still works.');
  } finally {
    aiBusy = false;
  }
}

/* ===== Feedback ===== */
let shfh = null;
let fbRating = 0;

document.getElementById('fbFab').addEventListener('click', openFB);
document.getElementById('fbClose').addEventListener('click', closeFB);
document.getElementById('fbOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'fbOverlay') closeFB();
});

document.querySelectorAll('#fbStars button').forEach((b) => {
  b.addEventListener('click', () => {
    fbRating = Number(b.dataset.r);
    document.querySelectorAll('#fbStars button').forEach((x) => {
      x.classList.toggle('on', Number(x.dataset.r) <= fbRating);
    });
  });
});

document.getElementById('fbSubmit').addEventListener('click', submitFeedback);

function openFB() {
  document.getElementById('fbOverlay').hidden = false;
  document.getElementById('fbStatus').textContent = '';
}
function closeFB() {
  document.getElementById('fbOverlay').hidden = true;
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

    // Prefer same-origin proxy if needed (SDK still posts to hub; we override when mixed content)
    const sync = await shfh.sync();
    if (sync && sync.donate) {
      const d = sync.donate;
      const box = document.getElementById('fbDonate');
      if (box) {
        box.hidden = false;
        let html = '<strong>Donate / Ủng hộ</strong><br>';
        if (d.url) html += `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a><br>`;
        if (d.address) html += `<small>${escapeHtml(d.label || 'Address')}: ${escapeHtml(d.address)}</small>`;
        if (d.note) html += `<br><small>${escapeHtml(d.note)}</small>`;
        if (d.author) html += `<br><small>Author: ${escapeHtml(d.author)}</small>`;
        box.innerHTML = html;
      }
    }
  } catch (e) {
    console.warn('SHFH init failed', e);
  }
}

async function submitFeedback() {
  const msg = (document.getElementById('fbMessage').value || '').trim();
  const status = document.getElementById('fbStatus');
  if (!msg) {
    status.textContent = 'Please enter a message.';
    return;
  }
  if (!shfh) {
    status.textContent = 'Feedback hub unavailable.';
    return;
  }
  status.textContent = 'Sending…';
  try {
    const type = document.getElementById('fbType').value;
    const out = await shfh.sendFeedback({ type, message: msg, rating: fbRating });
    if (out.ok || out.queued) {
      status.textContent = out.queued ? 'Queued (offline). Will send later.' : 'Thank you!';
      document.getElementById('fbMessage').value = '';
      fbRating = 0;
      document.querySelectorAll('#fbStars button').forEach((x) => x.classList.remove('on'));
    } else {
      status.textContent = 'Failed: ' + (out.error || 'unknown');
    }
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
}

/* ===== Init ===== */
update();
renderWs();
refreshAiStatus();
initFeedback();
