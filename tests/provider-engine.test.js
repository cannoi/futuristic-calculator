'use strict';
const assert=require('assert');
const {chooseAutoModel,normalizeModel}=require('../ai-module/server/provider-engine');
assert.strictEqual(normalizeModel('auto','gemini'),'auto');
assert.strictEqual(chooseAutoModel([{id:'gemini-2.5-flash'},{id:'gemini-3.7-flash'}],'gemini'),'gemini-3.7-flash');
assert.strictEqual(chooseAutoModel([{id:'deepseek-flash'},{id:'deepseek-v4-pro'}],'deepseek'),'deepseek-flash');
assert.strictEqual(chooseAutoModel([{id:'foo-model'}],'custom'),'foo-model');
assert.strictEqual(chooseAutoModel([{id:'tts-model'},{id:'chat-model'}],'custom'),'chat-model');
console.log('provider-engine tests: OK');
