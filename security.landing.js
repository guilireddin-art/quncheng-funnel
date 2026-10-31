(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields={taiwan_only:'仅台湾 IP',mobile_only:'仅手机访问'};
  const errors={revision_conflict:'设置已被其他操作修改，请刷新后重试。',domain_not_ready:'这个域名尚未接入保护服务，不能开启。',invalid_payload:'设置格式不正确。',session_ended:'登录已失效，请重新登录安全中心。',not_authorized:'没有管理落地页防护的权限。'};
  let selected='',busy=false;
  async function call(action,payload,api){
    const session=api.getSession();
    if(session?.kind!=='security'||!session.token)throw new Error('请重新登录安全中心。');
    const config=window.C_SECURITY_CONFIG,endpoint=new URL('c-security-landing-management',config.endpoint);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+config.invokeKey},body:JSON.stringify({action,payload:{...payload,token:session.token}}),signal:controller.signal,cache:'no-store',credentials:'omit'});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.ok){const error=new Error(errors[result?.code]||'落地页防护服务暂不可用，请稍后刷新。');error.code=result?.code||'network_error';throw error;}
      return result;
    }finally{clearTimeout(timer);}
  }
  function validRow(row){return row&&typeof row.domain==='string'&&/^[a-z0-9.-]+$/.test(row.domain)&&typeof row.version==='string'&&typeof row.ready==='boolean'&&typeof row.taiwan_only==='boolean'&&typeof row.mobile_only==='boolean'&&Number.isSafeInteger(row.revision)&&row.revision>=1;}
  async function load(api){
    const result=await call('landing_list',{},api);
    if(!Array.isArray(result.data?.domains)||!result.data.domains.every(validRow))throw new Error('防护设置格式与当前版本不一致，请稍后刷新。');
    return result;
  }
  function toggle(row,key){return `<button type="button" role="switch" aria-checked="${row[key]}" aria-label="${fields[key]}" data-action="landing_${key}" data-id="${esc(row.domain)}" class="landing-toggle" ${busy||!row.ready?'disabled':''}><span class="landing-toggle-track" aria-hidden="true"></span><span>${row[key]?'已开启':'已关闭'}</span></button>`;}
  function render(data){
    if(!Array.isArray(data?.domains))return '<section class="panel"><div class="empty">正在读取落地页防护设置。</div></section>';
    if(!data.domains.length)return '<section class="panel"><div class="empty">尚未登记落地页域名。</div></section>';
    if(!data.domains.some(r=>r.domain===selected))selected=(data.domains.find(r=>r.version==='L')||data.domains[0]).domain;
    const row=data.domains.find(r=>r.domain===selected),on=Object.keys(fields).filter(k=>row[k]);
    const status=!row.ready?'尚未接入，不执行拦截':on.length?'已开启：'+on.map(k=>fields[k]).join('、'):'两个开关均关闭，不限制访问';
    return `<div class="landing-management"><div class="scope-note"><strong>仅管理落地页访问，不影响后台登录保护。</strong><p>两个开关分别保存。同时开启时，必须同时符合“台湾出口 IP”和“手机浏览器”。VPN 拦截暂不做。</p></div>
      <section class="panel"><div class="panel-header"><div><h2>选择落地页</h2><p>当前先接入 L 版本，其他域名只显示清单，不会自动开启保护。</p></div></div><div class="landing-selector"><label for="landing-domain">版本 / 域名</label><select id="landing-domain">${data.domains.map(r=>`<option value="${esc(r.domain)}" ${r.domain===selected?'selected':''}>${esc(r.version)} 版本 · ${esc(r.domain)}</option>`).join('')}</select></div>
      <div class="landing-domain-summary"><div><span class="tag">${esc(row.version)} 版本</span><h2>${esc(row.domain)}</h2><p>同时覆盖 ${esc(row.domain)} 与 www.${esc(row.domain)}</p></div><span class="badge ${row.ready?'active':'offline'}">${row.ready?'保护服务已接入':'待接入保护服务'}</span></div>
      <div class="landing-current-state" role="status">${esc(status)}</div>
      <div class="landing-rule"><div><h3>仅台湾 IP</h3><p>开启后，非台湾出口 IP 或无法识别地区的请求返回 404。按网络出口判断，不代表实际所在地。</p></div>${toggle(row,'taiwan_only')}</div>
      <div class="landing-rule"><div><h3>仅手机访问</h3><p>开启后，电脑、平板及无法识别的浏览器请求返回 404。依赖浏览器请求信息，可被伪装，不是硬件身份验证。</p></div>${toggle(row,'mobile_only')}</div>
      <div class="landing-footnote">配置同步最长约 15 秒。关闭开关后恢复对应访问范围；未接入的域名不能开启。被拦截的访问不会加载页面或触发页面像素。</div></section>
      <section class="panel section-gap"><div class="panel-header"><div><h2>内容与代码保护</h2><p>保持页面、表单字段、提交成功条件及现有像素触发逻辑。</p></div><span class="badge offline">尚未上线</span></div><div class="landing-footnote">后续部署只发布必需文件，不公开备份与源码映射，并禁止第三方网页嵌入。浏览器必须接收页面代码，不能承诺完全防复制；原 GitHub Pages 入口与公开仓库还需单独收口。</div></section>
      <details class="landing-help"><summary>开启前需要知道什么？</summary><p>广告审核、分享预览和搜索抓取也可能被这些规则拦截，不会为审核人员展示另一套内容。台湾用户使用境外 VPN 时也可能被地区规则拦截。先测试，再按域名开启。</p></details></div>`;
  }
  function filterEvent(event){if(event.target.id!=='landing-domain')return false;selected=event.target.value;return true;}
  async function handle(action,id,context){
    const key=action.slice('landing_'.length);
    if(!Object.hasOwn(fields,key)||busy)return;
    const row=context.data?.domains?.find(r=>r.domain===id);
    if(!row?.ready)throw new Error('这个域名尚未接入保护服务，不能开启。');
    busy=true;
    try{
      const enabled=!row[key],impact=enabled?(key==='taiwan_only'?'非台湾出口 IP 将显示 404，包含台湾用户使用境外 VPN 的情况。':'电脑、平板及无法识别的浏览器将显示 404。'):'关闭后恢复此项原本限制的访问范围，另一项开关不会改变。';
      const confirmed=await context.confirmAction((enabled?'开启':'关闭')+fields[key],`${id}（含 www）：${impact} 只影响这个落地页域名，不改变后台、订单、表单或像素代码。配置同步最长约 15 秒。`);
      if(!confirmed)return;
      await call('landing_save',{domain:id,field:key,enabled,revision:row.revision},context.api);
      context.toast('防护设置已保存，正在同步');await context.refresh();
    }finally{busy=false;context.render();}
  }
  window.CSecurityLanding=Object.freeze({load,render,filterEvent,handle});
})();
