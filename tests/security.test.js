'use strict';
const assert=require('assert');
const path=require('path');
const fs=require('fs');
const {createAIService}=require('../ai-module/server/ai-service');
const {createFeedbackService}=require('../feedback-module/server/feedback-service');
const tmp=path.join(__dirname,'tmp-security'); fs.rmSync(tmp,{recursive:true,force:true});
const ai=createAIService({dataDir:tmp,appName:'Security Test'});
assert.throws(()=>ai.saveSettings({provider:'not-a-provider'}),/Unknown AI provider/);
assert.throws(()=>ai.saveSettings({provider:'custom',baseUrl:'http://example.com/v1'}),/HTTPS/);
assert.throws(()=>ai.saveSettings({provider:'custom',baseUrl:'https://user:pass@example.com/v1'}),/credentials/);
const saved=ai.saveSettings({provider:'gemini',model:'auto'});
assert.strictEqual(saved.model,'auto');
const fb=createFeedbackService({appId:'security-test'});
assert.ok(!Object.keys(fb.publicConfig()).some(k=>/token|secret|key/i.test(k)));
const clientFiles=['ai-module/client/ai-module.js','ai-module/client/ai-widget.js','feedback-module/client/feedback-module.js'];
for(const f of clientFiles){const s=fs.readFileSync(path.join(__dirname,'..',f),'utf8');assert.ok(!/cannoi_[A-Za-z0-9]+/.test(s),`credential in ${f}`);}
fs.rmSync(tmp,{recursive:true,force:true});
console.log('security tests: OK');
