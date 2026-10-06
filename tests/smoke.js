const fs=require('fs');
const path=require('path');
const assert=require('assert');
const base=path.join(__dirname,'..');
for(const f of [
  'ai-module/server/ai-service.js',
  'ai-module/server/routes.js',
  'ai-module/client/ai-module.js',
  'feedback-module/server/feedback-service.js',
  'feedback-module/client/feedback-module.js',
  'INTEGRATION_GUIDE.md'
]) assert(fs.existsSync(path.join(base,f)),`missing ${f}`);
const fb=require(path.join(base,'feedback-module/server/feedback-service.js'));
const c=fb.createFeedbackService({appId:'test-app'});
assert.strictEqual(c.publicConfig().hubId,'SHFH-CANNOI-0905428801');
assert.ok(!('ingestToken' in c.publicConfig()));
const ai=require(path.join(base,'ai-module/server/ai-service.js'));
const a=ai.createAIService({dataDir:path.join(__dirname,'tmp'),appName:'Test'});
assert.ok(a.catalog().some(x=>x.id==='custom'));
assert.ok(a.catalog().some(x=>x.id==='local'));
console.log('Universal modules structure/security tests: OK');
