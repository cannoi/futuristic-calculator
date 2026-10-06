/**
 * Universal AI Widget.
 * One script, four mounting styles, Shadow DOM isolation, and optional Feedback
 * integration. The host app can keep its existing UI and mount only one widget.
 */
'use strict';
window.UniversalAIWidget = (() => {
  const DEFAULT_ICON = '/ai-module/assets/ai-icon.png';
  const cssUrl = '/ai-module/client/ai-widget.css';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function create(opts={}) {
    const root = document.createElement('div');
    root.className='uai-host';
    const shadow = root.attachShadow({mode:'open'});
    const icon = opts.iconUrl || DEFAULT_ICON;
    const variant = ['floating','corner','dock','inline'].includes(opts.variant) ? opts.variant : 'floating';
    shadow.innerHTML = `<link rel="stylesheet" href="${esc(opts.cssUrl||cssUrl)}"><div class="uai-root">
      <button class="uai-btn uai-${variant}" aria-label="AI assistant"><img src="${esc(icon)}" alt="AI"></button>
      <span class="uai-badge" hidden>0</span>
      <section class="uai-panel" role="dialog" aria-label="AI assistant">
        <header class="uai-head"><img src="${esc(icon)}" alt=""><div class="uai-title">${esc(opts.title||'AI Assistant')}</div><button class="uai-close" aria-label="Close">×</button></header>
        <nav class="uai-tabs"><button class="uai-tab active" data-view="chat">Chat</button><button class="uai-tab" data-view="feedback">Feedback</button><button class="uai-tab" data-view="settings">Settings</button><button class="uai-tab" data-view="logs">Logs</button></nav>
        <main class="uai-body">
          <div class="uai-view active" data-panel="chat"><div class="uai-chat"></div><div class="uai-compose"><textarea placeholder="Ask anything about this app…"></textarea><button class="uai-send">Send</button></div></div>
          <div class="uai-view" data-panel="feedback"><div class="uai-status">Loading Feedback…</div><div class="uai-list"></div><div class="uai-field"><select class="uai-fb-type"><option value="bug">Bug</option><option value="improvement">Improvement</option><option value="question">Question</option></select><textarea class="uai-fb-msg" placeholder="Describe your feedback…"></textarea></div><button class="uai-primary uai-fb-send">Send feedback</button></div>
          <div class="uai-view" data-panel="settings"><div class="uai-field"><label>Provider</label><select class="uai-provider"></select></div><div class="uai-field"><label>API key</label><input class="uai-key" type="password" placeholder="Leave unchanged to keep saved key"></div><div class="uai-field"><label>Base URL</label><input class="uai-base" placeholder="Provider default or custom URL"></div><div class="uai-field"><label>Model</label><input class="uai-model" value="auto"><div class="uai-small">Use auto for live model discovery.</div></div><div class="uai-actions"><button class="uai-primary uai-save">Save</button><button class="uai-primary uai-refresh">Refresh models</button><button class="uai-primary uai-test">Test connection</button></div><div class="uai-status uai-settings-status"></div></div>
          <div class="uai-view" data-panel="logs"><div class="uai-actions"><button class="uai-primary uai-log-refresh">Refresh</button><button class="uai-primary uai-log-clear">Clear</button></div><div class="uai-list uai-logs"></div></div>
        </main>
      </section></div>`;
    document.body.appendChild(root);

    const $ = (s) => shadow.querySelector(s);
    const api = window.UniversalAI?.create({onActions: opts.onActions});
    const fb = window.UniversalFeedback ? window.UniversalFeedback.create({onUnread:n=>setBadge(n),onSync:renderFeedback}) : null;
    const btn=$('.uai-btn'), panel=$('.uai-panel'), badge=$('.uai-badge');
    const chat=$('.uai-chat'), input=$('.uai-compose textarea');
    const provider=$('.uai-provider'), key=$('.uai-key'), base=$('.uai-base'), model=$('.uai-model'), status=$('.uai-settings-status');

    function setBadge(n){ const v=Math.max(0,Number(n)||0); badge.textContent=v>99?'99+':String(v); badge.hidden=v===0; }
    function addMsg(who,text){ const d=document.createElement('div'); d.className='uai-msg '+(who==='user'?'uai-user':'uai-ai'); d.textContent=String(text||''); chat.appendChild(d); chat.scrollTop=chat.scrollHeight; }
    function switchView(name){ shadow.querySelectorAll('.uai-tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name)); shadow.querySelectorAll('.uai-view').forEach(x=>x.classList.toggle('active',x.dataset.panel===name)); if(name==='feedback') fb?.sync().catch(e=>renderFeedback({error:e.message})); if(name==='settings') loadSettings(); if(name==='logs') loadLogs(); }
    async function loadSettings(){
      try{
        const [cat,st]=await Promise.all([api.catalog(),api.settings()]);
        provider.innerHTML=(cat.providers||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        provider.value=st.provider||'none'; key.value=''; base.value=st.baseUrl||''; model.value=st.model||'auto';
        status.textContent=st.hasKey?`Saved key: ${st.maskedKey||'****'}`:'No API key saved';
      }catch(e){status.innerHTML=`<span class="uai-error">${esc(e.message)}</span>`;}
    }
    async function save(){
      try{ const v={provider:provider.value,baseUrl:base.value,model:model.value||'auto'}; if(key.value) v.apiKey=key.value; const out=await api.saveSettings(v); status.textContent=out.settings.hasKey?`Saved key: ${out.settings.maskedKey||'****'}`:'No API key saved'; }
      catch(e){status.innerHTML=`<span class="uai-error">${esc(e.message)}</span>`;}
    }
    async function refresh(){
      try{ const out=await api.models(); const models=out.models||[]; status.textContent=`${models.length} model(s) discovered. ${models[0]?.id?'Suggested: '+models[0].id:''}`; if(model.value==='auto' && models[0]) model.value='auto'; }
      catch(e){status.innerHTML=`<span class="uai-error">${esc(e.message)}</span>`;}
    }
    async function test(){
      try{ const out=await api.testConnection(); status.innerHTML=`<span class="uai-ok">Connected · ${esc(out.model)} · ${out.latencyMs} ms · ${out.modelCount} models</span>`; }
      catch(e){status.innerHTML=`<span class="uai-error">${esc(e.message)}</span>`;}
    }
    async function sendChat(){
      const text=input.value.trim(); if(!text||!api)return; input.value=''; addMsg('user',text);
      try{ const out=await api.chat(text,opts.getContext?await opts.getContext():{}); addMsg('ai',out.reply||''); }
      catch(e){addMsg('ai','AI connection failed: '+e.message);}
    }
    async function renderFeedback(data){
      const list=shadow.querySelector('.uai-list'); const top=shadow.querySelector('.uai-view[data-panel="feedback"] .uai-status');
      if(data?.error){top.innerHTML=`<span class="uai-error">${esc(data.error)}</span>`;return;}
      top.textContent=data?.notices?.length?`${data.notices.length} new notice(s)`:'No new notices';
      list.innerHTML=''; (data?.notices||[]).forEach(n=>{const d=document.createElement('div');d.className='uai-card';d.innerHTML=`<strong>${esc(n.title||n.subject||'Notice')}</strong><div>${esc(n.message||n.body||'')}</div><button class="uai-tab uai-read" data-id="${esc(n.id)}">Mark read</button>`;list.appendChild(d);});
      list.querySelectorAll('.uai-read').forEach(b=>b.onclick=async()=>{await fb?.markRead(b.dataset.id);b.closest('.uai-card')?.remove();});
      if(data?.donate) {const d=document.createElement('div');d.className='uai-card';d.textContent='Support: '+JSON.stringify(data.donate);list.appendChild(d);}
    }
    async function sendFeedback(){ const msg=shadow.querySelector('.uai-fb-msg').value.trim(); if(!msg||!fb)return; try{await fb.send({type:shadow.querySelector('.uai-fb-type').value,message:msg}); shadow.querySelector('.uai-fb-msg').value=''; await fb.sync();}catch(e){renderFeedback({error:e.message});} }
    async function loadLogs(){ const list=$('.uai-logs'); try{const out=await fetch('/api/logs').then(r=>r.json()); list.innerHTML='';(out.logs||[]).forEach(x=>{const d=document.createElement('div');d.className='uai-card uai-log';d.textContent=JSON.stringify(x);list.appendChild(d);});}catch(e){list.innerHTML=`<div class="uai-error">${esc(e.message)}</div>`;} }
    async function clearLogs(){await fetch('/api/logs',{method:'DELETE'});loadLogs();}

    btn.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open')){loadSettings();fb?.sync().catch(()=>{});opts.onOpen?.();}};
    $('.uai-close').onclick=()=>panel.classList.remove('open');
    shadow.querySelectorAll('.uai-tab').forEach(t=>t.onclick=()=>switchView(t.dataset.view));
    $('.uai-send').onclick=sendChat; input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))sendChat();});
    $('.uai-save').onclick=save; $('.uai-refresh').onclick=refresh; $('.uai-test').onclick=test; $('.uai-fb-send').onclick=sendFeedback; $('.uai-log-refresh').onclick=loadLogs; $('.uai-log-clear').onclick=clearLogs;
    if(opts.button){ opts.button.addEventListener('click',()=>btn.click()); btn.style.display='none'; }
    if(opts.mount==='inline' && opts.target){ opts.target.appendChild(root); }
    return {root,shadow,open:()=>panel.classList.add('open'),close:()=>panel.classList.remove('open'),setUnread:setBadge,syncFeedback:()=>fb?.sync(),destroy:()=>root.remove()};
  }
  return {create};
})();
