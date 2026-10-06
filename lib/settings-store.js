'use strict';
/**
 * Simple file-based settings store for AI credentials.
 * Keys are never returned in full to the frontend after save.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'ai-settings.json');
const LOG_FILE = path.join(DATA_DIR, 'app.log');

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}

function maskKey(k) {
  if (!k || typeof k !== 'string') return '';
  if (k.length <= 8) return '****';
  return k.slice(0, 4) + '…' + k.slice(-4);
}

function readSettings() {
  ensureDir();
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      provider: process.env.AI_PROVIDER || 'none',
      apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || '',
      model: process.env.AI_MODEL || 'auto',
      mode: process.env.AI_MODE || 'cloud_enabled',
    };
  }
}

function writeSettings(partial) {
  ensureDir();
  const cur = readSettings();
  const next = { ...cur };
  if (partial.provider != null) next.provider = String(partial.provider).toLowerCase();
  if (partial.apiKey != null && partial.apiKey !== '' && !partial.apiKey.includes('…')) {
    next.apiKey = String(partial.apiKey);
  }
  if (partial.baseUrl != null) next.baseUrl = String(partial.baseUrl).replace(/\/$/, '');
  if (partial.model != null) next.model = String(partial.model);
  if (partial.mode != null) next.mode = String(partial.mode);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return publicSettings(next);
}

function publicSettings(s) {
  const st = s || readSettings();
  return {
    provider: st.provider || 'none',
    model: st.model || 'auto',
    mode: st.mode || 'cloud_enabled',
    baseUrl: st.baseUrl || '',
    hasKey: !!(st.apiKey && st.apiKey.length > 0),
    maskedKey: maskKey(st.apiKey),
  };
}

function getSecrets() {
  return readSettings();
}

function appendLog(level, msg, extra) {
  ensureDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: level || 'info',
    msg: String(msg || ''),
    ...(extra && typeof extra === 'object' ? extra : {}),
  }) + '\n';
  try {
    fs.appendFileSync(LOG_FILE, line);
    // keep last ~200KB
    const st = fs.statSync(LOG_FILE);
    if (st.size > 200000) {
      const data = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-800).join('\n');
      fs.writeFileSync(LOG_FILE, data);
    }
  } catch { /* ignore */ }
}

function readLogs(limit = 100) {
  ensureDir();
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return { ts: '', level: 'raw', msg: l }; }
    });
  } catch {
    return [];
  }
}

function clearLogs() {
  ensureDir();
  try { fs.writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }
}

module.exports = {
  readSettings,
  writeSettings,
  publicSettings,
  getSecrets,
  appendLog,
  readLogs,
  clearLogs,
  maskKey,
};
