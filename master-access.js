(function(){
  'use strict';
  const nativeFetch=window.fetch.bind(window);
  const backend=new URL(window.C_SECURITY_CONFIG.endpoint).origin;
  let client=null;
  const messages={device_pending:'此设备正在等待安全中心批准，请联系管理员后刷新页面。',device_revoked:'此设备已撤销，请联系安全管理员。',device_mismatch:'此登录未绑定到当前设备，请重新登录。',ip_disabled:'当前网络出口已停用。',session_ended:'登录已结束，请重新登录。'};
  function errorFor(code){const error=new Error(messages[code]||'设备验证暂时无法连接，请稍后重试。');error.code=code;return error;}
  async function identity(){
    const session=window.CSecurity?.getSession();
    const auth=await client?.auth.getSession();
    if(session?.kind!=='master'||!session.token||!auth?.data?.session?.access_token)throw errorFor('session_ended');
    return {token:session.token,access_token:auth.data.session.access_token};
  }
  async function post(action){
    if(location.hostname!=='strettosw.top')throw new Error('请从正式总后台域名登录。');
    const body={action,...await identity()};
    const response=await nativeFetch('/_c-master/session',{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw errorFor(data?.code||'service_unavailable');
    if(data.enforced&&!data.allowed)throw errorFor(data.code);
    return data;
  }
  async function attach(value){client=value;return post('enroll');}
  async function pulse(){if(client)await post('check');}
  async function secureFetch(input,init){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==backend||!url.pathname.startsWith('/rest/v1/'))return nativeFetch(input,init);
    const request=new Request(input,init);
    const security=window.CSecurity?.getSession();
    if(security?.kind!=='master'||!security.token)throw errorFor('session_ended');
    if(location.hostname!=='strettosw.top')throw new Error('请从正式总后台域名登录。');
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)throw errorFor('session_ended');
    const headers={};for(const name of ['content-type','prefer','range','range-unit','accept']){
      const value=request.headers.get(name);if(value)headers[name]=value;
    }
    return nativeFetch('/_c-master/data',{method:'POST',credentials:'same-origin',cache:'no-store',signal:request.signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({token:security.token,access_token:token,
        path:url.pathname+url.search,method:request.method,headers,
        body:['GET','HEAD'].includes(request.method)?'':await request.text()})});
  }
  window.CMasterAccess=Object.freeze({attach,pulse,fetch:secureFetch});
})();
