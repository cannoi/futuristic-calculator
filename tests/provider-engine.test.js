'use strict';
const assert=require('assert');
const {chooseAutoModel,normalizeModel}=require('../lib/ai-module/provider-engine');
assert.strictEqual(normalizeModel('auto','gemini'),'gemini-3.8-flash');
assert.strictEqual(chooseAutoModel([{id:'gemini-3.8-flash'},{id:'gemini-2.5-flash'}],'gemini'),'gemini-3.8-flash');
assert.strictEqual(chooseAutoModel([{id:'deepseek-flash'},{id:'deepseek-v4-pro'}],'deepseek'),'deepseek-flash');
assert.strictEqual(chooseAutoModel([{id:'foo-model'}],'custom'),'foo-model');
console.log('provider-engine tests: OK');
