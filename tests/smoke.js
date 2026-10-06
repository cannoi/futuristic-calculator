'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const base = path.join(__dirname, '..');
for (const f of [
  'lib/ai-module/ai-service.js',
  'lib/ai-module/routes.js',
  'lib/ai-module/provider-engine.js',
  'public/ai-module/ai-module.js',
  'lib/feedback-module/feedback-service.js',
  'public/feedback-module/feedback-module.js',
  'lib/app-adapter.js',
  'public/ai-panel.js',
  'public/ai-panel.css',
  'public/ai-icon.png',
]) assert(fs.existsSync(path.join(base, f)), `missing ${f}`);

const fb = require(path.join(base, 'lib/feedback-module/feedback-service.js'));
const c = fb.createFeedbackService({ appId: 'test-app' });
assert.strictEqual(c.publicConfig().hubId, 'SHFH-CANNOI-0905428801');
assert.ok(!('ingestToken' in c.publicConfig()));

const ai = require(path.join(base, 'lib/ai-module/ai-service.js'));
const a = ai.createAIService({ dataDir: path.join(__dirname, 'tmp'), appName: 'Test' });
assert.ok(a.catalog().some((x) => x.id === 'custom'));
assert.ok(a.catalog().some((x) => x.id === 'local'));
assert.ok(a.catalog().some((x) => x.id === 'openai'));
assert.ok(a.catalog().some((x) => x.id === 'xai'));

const adapter = require(path.join(base, 'lib/app-adapter.js'));
assert.ok(typeof adapter.localReply === 'function');
assert.ok(Array.isArray(adapter.actions));

console.log('smoke: OK');
