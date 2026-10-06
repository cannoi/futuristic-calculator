/**
 * Universal Feedback client.
 * Use inside the AI panel; do not call Feedback Hub directly from browser code.
 */
window.UniversalFeedback=(()=>{
  const key='ufb_anon'; const queueKey='ufb_queue_v1';
  function anon(){
    let v=localStorage.getItem(key);
    if(!v){v=crypto?.randomUUID?.()||Date.now()+'-'+Math.random();localStorage.setItem(key,v);}
    return v;
  }
  async function json(url,opts={}){
    const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||`HTTP ${r.status}`); return j;
  }
  function readQueue(){try{return JSON.parse(localStorage.getItem(queueKey)||'[]')}catch{return[]}}
  function writeQueue(q){localStorage.setItem(queueKey,JSON.stringify(q.slice(-20)))}
  function create(opts={}){
    const state={sync:null,unread:0,online:navigator.onLine};
    const notify=()=>opts.onUnread?.(state.unread);
    function unreadCount(items){return items.filter(n=>!(n.read===true||n.is_read===true||n.read_at||n.readAt)).length}
    async function flush(){
      const q=readQueue(); if(!q.length)return;
      const remain=[]; for(const item of q){try{await json('/api/feedback',{method:'POST',body:JSON.stringify(item)})}catch{remain.push(item)}} writeQueue(remain);
    }
    async function sync(){
      await flush();
      state.sync=await json('/api/feedback/sync?anonymous_id='+encodeURIComponent(anon()));
      const items=state.sync.notices||[]; state.unread=Number(state.sync.unread_count ?? state.sync.unreadCount ?? unreadCount(items));
      notify(); opts.onSync?.(state.sync); return state.sync;
    }
    async function send(fields){
      const payload={event:'feedback',type:fields.type||'improvement',rating:Number(fields.rating)||0,message:String(fields.message||'').slice(0,2000),anonymous_id:anon(),locale:navigator.language||'en'};
      try{return await json('/api/feedback',{method:'POST',body:JSON.stringify(payload)})}
      catch(e){writeQueue([...readQueue(),payload]);opts.onQueued?.(payload);throw e}
    }
    async function markRead(id){
      const out=await json('/api/feedback/read/'+encodeURIComponent(id),{method:'POST'});
      state.unread=Math.max(0,state.unread-1); notify(); return out;
    }
    const online=()=>{state.online=true;flush().catch(()=>{})}; const offline=()=>{state.online=false};
    window.addEventListener('online',online); window.addEventListener('offline',offline);
    return {sync,send,markRead,flush,state,destroy:()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline)}};
  }
  return {create};
})();
