'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'ai-module/server/ai-service.js',
  'ai-module/server/provider-engine.js',
  'feedback-module/server/feedback-service.js',
  'public/ai-module/client/ai-module.js',
  'public/ai-module/client/ai-widget.js',
  'public/ai-module/client/ai-widget.css',
  'public/ai-module/assets/ai-icon.png',
  'public/feedback-module/client/feedback-module.js',
  'public/index.html',
  'public/script.js',
  'public/style.css',
  'lib/calc-engine.js',
  'docker-compose.yml',
  'solohost/docker-compose.yml',
];

for (const rel of required) assert.ok(fs.existsSync(path.join(root, rel)), `Missing ${rel}`);

const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public/script.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.ok(index.includes('/ai-module/client/ai-widget.js'));
assert.ok(index.includes('/feedback-module/client/feedback-module.js'));
assert.ok(script.includes('/ai-module/assets/ai-icon.png'));
assert.ok(!index.includes('shfh-client.js'));
assert.ok(!index.includes('id="aiFab"'));
assert.ok(!script.includes('/api/ai/chat'));
assert.ok(!script.includes('Feedback Hub'));
assert.ok(!server.includes('lib/ai-gateway'));
assert.ok(!server.includes('lib/settings-store'));
assert.ok(!server.includes('/api/shfh-config'));
assert.ok(!server.includes('/api/shfh-proxy'));

const icon = fs.readFileSync(path.join(root, 'public/ai-module/assets/ai-icon.png'));
assert.ok(icon.length > 1000, 'AI icon missing/empty');

console.log('integration tests: OK');
