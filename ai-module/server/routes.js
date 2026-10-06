/** Mount into the host app's existing HTTP server. */
function mountAIRoutes(router, ai, options={}) {
  const authorize = typeof options.authorize === 'function' ? options.authorize : () => true;
  const limits = new Map();
  const windowMs = Number(options.rateWindowMs || 60_000);
  const maxChat = Number(options.maxChatPerWindow || 30);
  const clientId = options.clientId || (req => String(req.ip || req.headers?.['x-forwarded-for'] || 'local'));
  function guard(req,res,kind='read') {
    try { if(!authorize(req)) { res.status(401).json({ok:false,error:'Unauthorized'}); return false; } } catch { res.status(401).json({ok:false,error:'Unauthorized'}); return false; }
    if(kind!=='chat' || options.rateLimit===false) return true;
    const id=clientId(req), now=Date.now();
    const old=limits.get(id); const entry=old && now-old.started<windowMs ? old : {started:now,count:0};
    entry.count++; limits.set(id,entry);
    if(entry.count>maxChat){ res.status(429).json({ok:false,error:'Too many AI requests. Please try again shortly.',code:'RATE_LIMIT'}); return false; }
    return true;
  }
  router.get('/api/ai/status', (req,res)=>{if(!guard(req,res))return;res.json({ok:true,configured:ai.configured(),settings:ai.publicSettings()});});
  router.get('/api/ai/catalog', (req,res)=>{if(!guard(req,res))return;res.json({providers:ai.catalog()});});
  router.get('/api/ai/settings', (req,res)=>{if(!guard(req,res))return;res.json(ai.publicSettings());});
  router.post('/api/ai/settings', (req,res)=>{
    if(!guard(req,res))return;
    try { res.json({ok:true,settings:ai.saveSettings(req.body||{})}); }
    catch(e){ ai.log('error','ai.settings',{error:e.message}); res.status(400).json({ok:false,error:e.message}); }
  });
  router.get('/api/ai/models', async (req,res)=>{
    if(!guard(req,res))return;
    try { res.json(await ai.refreshModels()); }
    catch(e){ ai.log('error','ai.models.refresh.fail',{error:e.message}); res.status(502).json({ok:false,error:safePublicError(e)}); }
  });
  router.post('/api/ai/test', async (req,res)=>{
    if(!guard(req,res))return;
    try { res.json(await ai.testConnection()); }
    catch(e){ ai.log('error','ai.provider.test.fail',{error:e.message}); res.status(502).json({ok:false,error:safePublicError(e),code:errorCode(e)}); }
  });
  router.post('/api/ai/chat', async(req,res)=>{
    if(!guard(req,res,'chat'))return;
    try {
      const b=req.body||{};
      if(!b.message) return res.status(400).json({ok:false,error:'message required'});
      const out=await ai.chat({message:b.message,history:Array.isArray(b.history)?b.history.slice(-8):[],context:b.context||{},knowledge:b.knowledge});
      ai.log('info','ai.chat',{provider:out.provider,model:out.model});
      res.json(out);
    } catch(e){
      ai.log('error','ai.chat.fail',{error:e.message});
      res.status(502).json({ok:false,error:safePublicError(e),code:errorCode(e)});
    }
  });
  router.get('/api/logs',(req,res)=>{if(!guard(req,res))return;res.json({logs:ai.readLogs()});});
  router.delete('/api/logs',(req,res)=>{if(!guard(req,res))return;ai.clearLogs();res.json({ok:true});});
}
function safePublicError(e){
  const s=String(e?.message||e||'AI provider unavailable');
  return s
    .replace(/([?&](?:key|api_key|token|access_token)=[^&\s]+)/ig,'$1=[REDACTED]')
    .replace(/Bearer\s+[^\s]+/ig,'Bearer [REDACTED]')
    .replace(/(?:x-goog-api-key|x-api-key|authorization)\s*[:=]\s*[^,\s]+/ig,'credential=[REDACTED]')
    .slice(0,700);
}
function errorCode(e){
  if(e?.code==='TIMEOUT') return 'TIMEOUT';
  if(e?.code==='NETWORK_ERROR') return 'NETWORK_ERROR';
  if(e?.status===401) return 'AUTH_ERROR';
  if(e?.status===403) return 'FORBIDDEN';
  if(e?.status===404) return 'MODEL_OR_ENDPOINT_NOT_FOUND';
  if(e?.status===429) return 'RATE_LIMIT';
  if(e?.status>=500) return 'PROVIDER_SERVER_ERROR';
  return 'AI_PROVIDER_ERROR';
}
module.exports={mountAIRoutes,safePublicError,errorCode};
