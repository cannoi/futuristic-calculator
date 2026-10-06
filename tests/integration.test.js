'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'lib/ai-module/ai-service.js',
  'lib/ai-module/provider-engine.js',
  'lib/ai-module/routes.js',
  'lib/feedback-module/feedback-service.js',
  'lib/app-adapter.js',
  'lib/calc-engine.js',
  'public/ai-module/ai-module.js',
  'public/feedback-module/feedback-module.js',
  'public/ai-panel.js',
  'public/ai-panel.css',
  'public/ai-icon.png',
  'public/index.html',
  'public/script.js',
  'public/style.css',
  'docker-compose.yml',
  'solohost/docker-compose.yml',
];

for (const rel of required) assert.ok(fs.existsSync(path.join(root, rel)), `Missing ${rel}`);

const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public/script.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.ok(index.includes('id="aiFab"'), 'index must have aiFab');
assert.ok(index.includes('id="aiBadge"'), 'index must have aiBadge');
assert.ok(index.includes('/ai-panel.js'), 'index must load ai-panel.js');
assert.ok(index.includes('/ai-module/ai-module.js'), 'index must load ai-module.js');
assert.ok(index.includes('/feedback-module/feedback-module.js'), 'index must load feedback-module.js');
assert.ok(!index.includes('ai-widget'), 'index must not load old ai-widget');
assert.ok(script.includes('calculatorAiContext'), 'script must expose calculatorAiContext');
assert.ok(script.includes('applyUniversalAiActions'), 'script must expose applyUniversalAiActions');
assert.ok(server.includes("require('./lib/app-adapter')"), 'server uses lib/app-adapter');
assert.ok(server.includes("require('./lib/ai-module/ai-service')"), 'server uses lib/ai-module');
assert.ok(server.includes("require('./lib/feedback-module/feedback-service')"), 'server uses lib/feedback-module');
assert.ok(!server.includes('/api/shfh-config'), 'no shfh-config token endpoint');

const panel = fs.readFileSync(path.join(root, 'public/ai-panel.js'), 'utf8');
assert.ok(panel.includes('calculatorAiContext') || panel.includes('gameContext'), 'ai-panel has context hook');
assert.ok(panel.includes('UniversalFeedback'), 'ai-panel uses UniversalFeedback');
assert.ok(panel.includes('setUnread'), 'ai-panel has badge unread');

console.log('integration tests: OK');
