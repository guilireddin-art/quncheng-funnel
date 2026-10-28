(function(){
  'use strict';
  const config=window.C_SECURITY_CONFIG;
  let current=null,timer=null,lastInput=Date.now(),lastSentInput=0,ending=false;
  const messages={invalid_login:'账号或密码错误。',rate_limited:'尝试过于频繁，请稍后再试。',account_disabled:'此后台账号已停用。',login_required:'请重新登录。',session_ended:'登录已结束或超时，请重新登录。',not_authorized:'没有执行此操作的权限。'};
  function deviceId(){try{let id=localStorage.getItem('c-security-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('c-security-device-id',id);}return id;}catch{return crypto.randomUUID();}}
  const browserId=deviceId();
  function key(kind,slug=''){return 'c-security-session:'+kind+':'+slug;}
  function storage(kind){return kind==='master'?localStorage:sessionStorage;}
  async function call(action,payload={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+config.invokeKey},body:JSON.stringify({action,payload:{...payload,device_id:browserId}}),signal:controller.signal,credentials:'omit',cache:'no-store'});
      const data=await res.json().catch(()=>null);
      if(!data?.ok){const error=new Error(messages[data?.code]||'安全服务暂时无法连接，请稍后重试。');error.code=data?.code||'network_error';throw error;}
      return data;
    }finally{clearTimeout(timeout);}
  }
  function remember(kind,slug,data){current={kind,slug,token:data.token,sessionId:data.session_id};try{storage(kind).setItem(key(kind,slug),JSON.stringify(current));}catch{}startHeartbeat();}
  function clear(){if(current){try{storage(current.kind).removeItem(key(current.kind,current.slug));}catch{}}current=null;clearInterval(timer);timer=null;}
  async function ended(){if(ending)return;ending=true;clear();location.reload();}
  function startHeartbeat(){clearInterval(timer);timer=setInterval(async()=>{if(!current)return;const activity=lastInput>lastSentInput;try{await call('heartbeat',{token:current.token,active:activity});if(activity)lastSentInput=lastInput;}catch(error){if(error.code==='session_ended'||error.code==='account_disabled')ended();}},25000);}
  async function restore(kind,slug=''){
    let saved;try{saved=JSON.parse(storage(kind).getItem(key(kind,slug)));}catch{}
    if(!saved?.token||saved.kind!==kind)return null;
    try{await call('heartbeat',{token:saved.token,active:true});current=saved;startHeartbeat();return saved.token;}
    catch(error){if(['session_ended','account_disabled','login_required'].includes(error.code)){try{storage(kind).removeItem(key(kind,slug));}catch{}return null;}throw error;}
  }
  async function logout(){const token=current?.token;clear();if(token){try{await call('logout',{token});}catch{}}}
  async function masterLogin(client,password){
    try{const result=await call('master_login',{password});const previous=current?.token;
      const auth=await client.auth.setSession(result.auth_session);
      if(auth.error){try{await call('logout',{token:result.token});}catch{}return auth;}
      remember('master','',result);if(previous&&previous!==result.token){try{await call('logout',{token:previous});}catch{}}
      return auth;
    }catch(error){return {data:{user:null,session:null},error};}
  }
  async function masterRestore(client){try{const token=await restore('master');if(token)return true;await client.auth.signOut({scope:'local'});return false;}catch{return false;}}
  async function pageLogin(slug,password){try{const result=await call('login',{kind:'page',slug,password});remember('page',slug,result);return {data:result.token,error:null};}catch(error){return {data:null,error};}}
  async function securityLogin(username,password){const result=await call('login',{kind:'security',username,password});remember('security','',result);return result;}
  async function authorized(action,payload={}){if(!current?.token)throw new Error('请先登录。');try{return await call(action,{...payload,token:current.token});}catch(error){if(error.code==='session_ended')ended();throw error;}}
  async function recordExport(count,page){try{await authorized('export',{count,page});return true;}catch(error){alert('无法记录导出操作，本次未导出：'+error.message);return false;}}
  for(const type of ['pointerdown','keydown','touchstart'])document.addEventListener(type,()=>{lastInput=Date.now();},{passive:true});
  window.addEventListener('storage',event=>{if(current?.kind==='master'&&event.key===key('master'))location.reload();});
  window.CSecurity=Object.freeze({masterLogin,masterRestore,pageLogin,restore,securityLogin,logout,authorized,recordExport,getSession:()=>current});
})();
