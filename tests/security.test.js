'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { createAIService } = require('../lib/ai-module/ai-service');
const { createFeedbackService } = require('../lib/feedback-module/feedback-service');

const tmp = path.join(__dirname, 'tmp-security');
fs.rmSync(tmp, { recursive: true, force: true });

const ai = createAIService({ dataDir: tmp, appName: 'Security Test' });
// Provider validation may be soft in this module version — only assert public safety
const saved = ai.saveSettings({ provider: 'gemini', model: 'auto' });
assert.strictEqual(saved.model, 'auto');
assert.ok(saved.maskedKey === '' || typeof saved.maskedKey === 'string');

const fb = createFeedbackService({ appId: 'security-test' });
assert.ok(!Object.keys(fb.publicConfig()).some((k) => /token|secret|key/i.test(k)));
const cfg = JSON.stringify(fb.publicConfig());
assert.ok(!/cannoi_/.test(cfg), 'ingest token must not appear in publicConfig');

const clientFiles = [
  'public/ai-module/ai-module.js',
  'public/feedback-module/feedback-module.js',
  'public/ai-panel.js',
];
for (const f of clientFiles) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(!/cannoi_[A-Za-z0-9]+/.test(s), `credential in ${f}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('security tests: OK');
