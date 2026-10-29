(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'尚无记录';
  const states={pending:'待批准',approved:'已批准登记',rejected:'已拒绝',disabled:'已停用登记',revoked:'已撤销登记'};
  const errors={invalid_ip:'IP 或网段格式不正确，不允许全网范围。',duplicate_ip:'此 IP 已有记录，请编辑原记录或在已删除名单中恢复。',invalid_note:'备注最多填写 80 个字符。',invalid_payload:'提交内容格式不正确。',record_not_found:'记录不存在，请刷新后重试。',revision_conflict:'记录已被其他操作修改，请刷新后重试。',record_state_changed:'状态已改变，请刷新后重试。',rule_limit:'名单最多保存 128 条记录（含已删除记录）。'};
  const labels={access_device_approve:'批准设备登记',access_device_reject:'拒绝设备登记',access_device_disable:'停用设备登记',access_device_enable:'启用设备登记',access_device_revoke:'撤销设备登记',access_device_reopen:'重新列为待批准'};
  let filter='all',search='',editor=null,ipLabels=new Map();
  function canonicalIp(value){const parts=String(value||'').trim().split('/'),host=parts[0];if(parts.length>2)return null;if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){const octets=host.split('.').map(Number);return octets.every(n=>n>=0&&n<=255)&&(parts.length===1||parts[1]==='32')?octets.join('.'):null;}if(host.includes(':')&&/^[0-9a-fA-F:.]+$/.test(host)&&(parts.length===1||parts[1]==='128')){try{return new URL('http://['+host+']/').hostname.slice(1,-1).toLowerCase();}catch{}}return null;}
  function ipLabel(address){const key=canonicalIp(address);return key?(ipLabels.get(key)||{address:key,label:'',revision:0}):null;}
  function labelButton(address){return canonicalIp(address)?button('ip_label',address,'IP 备注'):'';}
  async function loadLabels(api){const result=await call('access_ip_labels',{},api);if(result.data?.mode!=='management_only'||result.data?.enforced!==false||!Array.isArray(result.data?.labels))throw new Error('IP 备注服务暂不可用，请刷新后重试。');ipLabels=new Map(result.data.labels.filter(r=>canonicalIp(r.address)).map(r=>[canonicalIp(r.address),r]));return result;}
  async function call(action,payload,api){
    const session=api.getSession();if(session?.kind!=='security'||!session.token)throw new Error('请重新登录安全中心。');
    const config=window.C_SECURITY_CONFIG,endpoint=new URL('c-security-access-management',config.endpoint);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+config.invokeKey},body:JSON.stringify({action,payload:{...payload,token:session.token}}),signal:controller.signal,credentials:'omit',cache:'no-store'});const result=await response.json().catch(()=>null);if(!response.ok||!result?.ok){const error=new Error(errors[result?.code]||'管理服务暂时不可用，请刷新或重新登录安全中心。');error.code=result?.code||'network_error';throw error;}return result;}finally{clearTimeout(timeout);}
  }
  const button=(action,id,label,red=false)=>`<button data-action="${action}" data-id="${esc(id)}" class="${red?'red':''}">${label}</button>`;
  const banner=()=>'<div class="scope-note access-mode"><strong>仅管理登记 · 尚未启用访问拦截</strong><p>当前保存的 IP 和审批状态不会改变任何后台访问，也不会退出已有会话。总后台、投手后台、落地页收单保持原样。真正开启保护需另行接入服务器拦截。</p></div>';
  function os(ua){return /iPhone|iPad/.test(ua)?'iOS / iPadOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'未知系统';}
  function browser(ua){return /Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'未知浏览器';}
  function formatIp(address,labels=[]){const saved=ipLabel(address)?.label,edit=labelButton(address);if(saved)return `<div class="cell-main"><strong>${esc(saved)}</strong><small class="mono">${esc(address)}</small><small>固定 IP 备注</small></div>${edit}`;const names=[...new Set((Array.isArray(labels)?labels:[]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))];return (names.length?`<div class="cell-main"><strong>${esc(names.join(' / '))}</strong><small class="mono">${esc(address||'未取得')}</small><small>${names.length>1?'同 IP 关联多个设备备注':'关联设备备注'}</small></div>`:`<span class="mono">${esc(address||'未取得')}</span>`)+edit;}
  function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):`<tr><td colspan="${headers.length}" class="empty">当前筛选下没有记录</td></tr>` )+'</tbody></table></div>';}
  function filters(type){const options=type==='ip'?{all:'当前名单',enabled:'已启用登记',disabled:'已停用登记',deleted:'已删除'}:{all:'全部浏览器',...states};return `<div class="filters"><input id="access-search" aria-label="搜索登记记录" placeholder="搜索 IP、设备备注或编号" value="${esc(search)}"><select id="access-filter" aria-label="登记状态">${Object.entries(options).map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${v}</option>`).join('')}</select></div>`;}
  function renderIp(data){
    const rows=data.ip_rules.filter(r=>(filter==='deleted'?!!r.deleted_at:!r.deleted_at)&&(filter!=='enabled'||r.enabled)&&(filter!=='disabled'||!r.enabled)&&(!search||[r.address,r.note,ipLabel(r.address)?.label,...(r.device_labels||[])].join(' ').toLowerCase().includes(search.toLowerCase())));
    return banner()+`<section class="panel"><div class="panel-header"><div><h2>总后台 IP 白名单</h2><p>设备备注自动显示在对应 IP 旁；共用出口会显示多个备注。当前不执行拦截。</p></div>${button('access_ip_create','','新增 IP')}</div>${filters('ip')}${table(['关联设备 / IP','名单备注','名单状态','更新时间','操作'],rows.map(r=>`<tr><td>${formatIp(r.address,r.device_labels)}</td><td class="access-note">${esc(r.note)||'未备注'}</td><td><span class="badge ${r.deleted_at?'revoked':r.enabled?'active':'disabled'}">${r.deleted_at?'已删除':r.enabled?'已启用登记':'已停用登记'}</span></td><td>${esc(date(r.updated_at))}</td><td><div class="row-actions">${r.deleted_at?button('access_ip_restore',r.id,'恢复'):button('access_ip_update',r.id,'编辑')+button('access_ip_enabled',r.id,r.enabled?'停用':'启用',r.enabled)+button('access_ip_delete',r.id,'删除',true)}</div></td></tr>`))}<div class="table-footer">${rows.length} 条登记 · 初始保留 9 个 IP。设备关联依据登录记录，不代表 IP 的永久归属。删除可恢复，恢复后默认停用。</div></section>`;
  }
  function renderDevices(data){
    const rows=data.device_reviews.filter(r=>(filter==='all'||r.status===filter)&&(!search||[r.id,r.note,r.login_ip,ipLabel(r.login_ip)?.label,r.user_agent].join(' ').toLowerCase().includes(search.toLowerCase())));
    return banner()+'<div class="scope-note"><strong>登记依据：</strong>只同步已有总后台管理员的真实登录浏览器记录，不自动批准。它不是不可复制的硬件身份，也尚未绑定强制设备验证。需要立即退出某会话，请使用“登录设备”中的退出操作。</div>'+`<section class="panel"><div class="panel-header"><div><h2>总后台设备批准登记</h2><p>只显示总后台管理员。修改备注会同步显示在关联 IP 旁，不改变登录权限。</p></div><span class="access-mode-label">不改变现有访问</span></div>${filters('devices')}${table(['设备 / 编号','关联备注 / 登录 IP','最近记录','审批登记','操作'],rows.map(r=>`<tr><td><div class="cell-main"><strong>${esc(r.note||os(r.user_agent)+' · '+browser(r.user_agent))}</strong><small>${esc(os(r.user_agent)+' · '+browser(r.user_agent))}</small><small class="mono">${esc(r.id.slice(0,8).toUpperCase())}</small></div></td><td>${formatIp(r.login_ip,[r.note])}</td><td><div class="cell-main">${esc(date(r.last_seen_at))}<small>首次：${esc(date(r.first_seen_at))}</small></div></td><td><span class="badge ${r.status==='approved'?'active':r.status==='pending'?'idle':'revoked'}">${states[r.status]}</span></td><td><div class="row-actions">${r.status==='pending'?button('access_device_approve',r.id,'批准')+button('access_device_reject',r.id,'拒绝',true):r.status==='approved'?button('access_device_disable',r.id,'停用',true)+button('access_device_revoke',r.id,'撤销',true):r.status==='disabled'?button('access_device_enable',r.id,'启用')+button('access_device_revoke',r.id,'撤销',true):button('access_device_reopen',r.id,'重新待批')}${button('access_device_remark',r.id,'详情 / 备注')}</div></td></tr>`))}<div class="table-footer">${rows.length} 条浏览器登记 · 批准、拒绝、停用、撤销均由服务器保存并记录日志；当前不执行设备拦截。</div></section>`;
  }
  function render(view,data){if(!data)return banner()+'<section class="panel access-loading">正在读取服务器登记，请稍候。</section>';if(data.mode!=='management_only'||data.enforced!==false)return '<div class="scope-note">服务器模式与当前管理版本不一致，请刷新核对。</div>';return '<div class="access-management '+(view==='ip-allowlist'?'access-ip':'access-device')+'">'+(view==='ip-allowlist'?renderIp(data):renderDevices(data))+'</div>';}
  function translate(error){if(errors[error.code])error.message=errors[error.code];return error;}
  function openEditor(type,row,context){
    editor={type,row,context};$('access-editor-title').textContent=type==='device'?'设备详情 / 备注':row?'编辑 IP 登记':'新增 IP 登记';
    $('access-editor-description').textContent=type==='device'?`编号 ${row.id.slice(0,8).toUpperCase()}；${row.user_agent||'未取得浏览器信息'}。这里只修改备注，不改变登录权限。`:'保存名单不会启用访问拦截。支持 IPv4、IPv6 或 CIDR 网段，不允许全网范围。';
    $('access-address').hidden=$('access-address-label').hidden=type==='device';$('access-address').required=type!=='device';$('access-enabled-label').hidden=type==='device';
    $('access-address').value=row?.address||'';$('access-note').value=row?.note||'';$('access-enabled').checked=row?row.enabled:true;$('access-edit-error').hidden=true;$('access-editor').showModal();(type==='device'?$('access-note'):$('access-address')).focus();
  }
  async function handle(action,id,context){
    const data=context.data;if(!data)throw new Error('请先刷新服务器登记。');
    const isIp=action.startsWith('access_ip_'),row=(isIp?data.ip_rules:data.device_reviews).find(r=>r.id===id);
    if(action==='access_ip_create'){openEditor('ip',null,context);return;}
    if(!row)throw new Error('记录已改变，请刷新后重试。');
    if(action==='access_ip_update'||action==='access_device_remark'){openEditor(isIp?'ip':'device',row,context);return;}
    let title,description,payload={id:row.id,revision:row.revision};
    if(isIp){title=action==='access_ip_enabled'?(row.enabled?'停用 IP 登记':'启用 IP 登记'):action==='access_ip_delete'?'删除 IP 登记':'恢复 IP 登记';description=`${row.address}。只修改保存的名单，不改变现有访问。${action==='access_ip_restore'?'恢复后默认停用。':action==='access_ip_delete'?'删除后可在已删除名单恢复。':''}`;if(action==='access_ip_enabled')payload.enabled=!row.enabled;}
    else{title=labels[action];description=`设备 ${row.note||os(row.user_agent)+' · '+browser(row.user_agent)}，编号 ${row.id.slice(0,8).toUpperCase()}，登录 IP ${row.login_ip||'未取得'}。此次只保存审批登记，尚未启用设备拦截，不会退出任何会话。`;}
    if(!await context.confirmAction(title,description))return;
    try{await call(action,payload,context.api);}catch(error){throw translate(error);}
    context.toast('登记已保存；访问限制尚未启用');await context.refresh();
  }
  $('access-edit-cancel').addEventListener('click',()=>$('access-editor').close());
  $('access-editor').addEventListener('close',()=>{editor=null;});
  $('access-editor-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!editor)return;const current=editor,submit=$('access-edit-save');submit.disabled=true;$('access-edit-error').hidden=true;
    const payload={note:$('access-note').value.trim()};let action;
    if(current.row){payload.id=current.row.id;payload.revision=current.row.revision;}
    if(current.type==='device')action='access_device_remark';else{action=current.row?'access_ip_update':'access_ip_create';payload.address=$('access-address').value.trim();payload.enabled=$('access-enabled').checked;}
    try{await call(action,payload,current.context.api);$('access-editor').close();current.context.toast('登记已保存；访问限制尚未启用');await current.context.refresh();}
    catch(error){$('access-edit-error').textContent=translate(error).message;$('access-edit-error').hidden=false;}finally{submit.disabled=false;}
  });
  window.CSecurityAccess=Object.freeze({render,handle,formatIp,ipLabel,loadLabels,load(api){return call('access_dashboard',{},api);},async saveIpLabel(api,address,label,revision){await call('access_ip_label_save',{address,label,revision},api);await loadLabels(api);},syncRemark(api,sessionId){return call('access_session_note',{session_id:sessionId},api);},reset(){filter='all';search='';},filterEvent(event){if(event.target.id==='access-filter'){filter=event.target.value;return true;}if(event.target.id==='access-search'){search=event.target.value;return true;}return false;}});
})();
