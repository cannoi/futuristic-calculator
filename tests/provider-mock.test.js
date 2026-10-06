'use strict';
const assert=require('assert');
const {listModels,runProvider,testProvider}=require('../ai-module/server/provider-engine');
const original=global.fetch;
function response(status, body, headers={}) { return {ok:status>=200&&status<300,status,headers:{get:k=>headers[k]||null},text:async()=>JSON.stringify(body)}; }
(async()=>{
  // Gemini discovery + generation. Verify v1beta-style path and key header.
  global.fetch=async(url,opts)=>{
    if(url.includes('/models?pageSize=100')) {
      assert.strictEqual(opts.headers['x-goog-api-key'],'KEY');
      assert.ok(!url.includes('key='));
      return response(200,{models:[
        {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},
        {name:'models/gemini-3.7-flash-tts',supportedGenerationMethods:['generateContent']},
        {name:'models/embedding-x',supportedGenerationMethods:['embedContent']}
      ]});
    }
    if(url.includes('/models/gemini-3.7-flash:generateContent')) {
      assert.strictEqual(opts.headers['x-goog-api-key'],'KEY');
      return response(200,{candidates:[{content:{parts:[{text:'{"reply":"ok","actions":[]}'}]}}]});
    }
    throw new Error('unexpected Gemini URL '+url);
  };
  const gm=await listModels({provider:'gemini',baseUrl:'https://example.test/v1beta',apiKey:'KEY'});
  assert.deepStrictEqual(gm.map(x=>x.id),['gemini-3.7-flash','gemini-3.7-flash-tts']);
  const gr=await runProvider({provider:'gemini',baseUrl:'https://example.test/v1beta',apiKey:'KEY',model:'auto',messages:[{role:'user',content:'hi'}]});
  assert.ok(gr.includes('reply'));

  // OpenAI-compatible discovery + generation.
  global.fetch=async(url,opts)=>{
    if(url.endsWith('/models')) return response(200,{data:[{id:'gpt-test'},{id:'other'}]});
    if(url.endsWith('/chat/completions')) return response(200,{choices:[{message:{content:'{"reply":"ok","actions":[]}'}}]});
    throw new Error('unexpected OpenAI URL '+url);
  };
  const om=await listModels({provider:'openai',baseUrl:'https://example.test/v1',apiKey:'KEY'});
  assert.strictEqual(om[0].id,'gpt-test');
  const ot=await testProvider({provider:'openai',baseUrl:'https://example.test/v1',apiKey:'KEY',model:'auto'});
  assert.strictEqual(ot.model,'gpt-test');

  // Anthropic model discovery.
  global.fetch=async(url,opts)=>{
    if(url.endsWith('/models')) return response(200,{data:[{id:'claude-sonnet-5-5'},{id:'claude-haiku-4-5'}]});
    throw new Error('unexpected Anthropic URL '+url);
  };
  const am=await listModels({provider:'anthropic',baseUrl:'https://example.test/v1',apiKey:'KEY'});
  assert.strictEqual(am[0].id,'claude-sonnet-5-5');

  global.fetch=original;
  console.log('provider mock integration tests: OK');
})().catch(e=>{global.fetch=original; console.error(e);process.exit(1);});
