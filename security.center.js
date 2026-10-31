(function(){
  'use strict';
  const $=id=>document.getElementById(id), api=window.CSecurity;
  const titles={overview:'安全概览',devices:'登录记录',sessions:'会话管理',accounts:'账号权限','ip-allowlist':'IP 白名单','blocked-ips':'拦截记录','device-approval':'设备批准',logs:'安全日志',settings:'安全设置'};
  const descriptions={overview:'查看真实登录活动、新设备提醒和近期敏感操作。',devices:'这里按每次登录显示记录，同一浏览器多次登录可能有多条记录；不是一台电脑一行。',sessions:'结束指定设备、其他设备或某个账号的全部会话。',accounts:'停用后台登录权限，不改变落地页收单状态。','ip-allowlist':'管理总后台 IP 名单与访问控制，是否拦截以服务器保护状态为准。','device-approval':'管理总后台浏览器审批、凭证接入及访问控制。',logs:'服务器记录的登录、安全操作和导出记录。',settings:'管理登录限速、会话时限和新设备提醒。'};
  const statuses={active:'近期有连接',idle:'暂未操作',offline:'暂未反馈',unknown:'状态待核实',revoked:'已退出',expired:'登录已超时',disabled:'账号已停用'};
  const statusHints={active:'最近 90 秒内收到页面心跳，不代表本人正在操作。',idle:'近期仍有页面心跳，但最近没有操作记录。',offline:'超过 90 秒未收到心跳，不等于已退出，也不能据此确定电脑已关机。',unknown:'旧登录缺少实时验证信息，不能确定当前是否仍在使用。',revoked:'这次登录已结束，不等于永久禁止设备再次登录。',expired:'这次登录已超过原有时限，需要重新登录。',disabled:'账号已停用；设备批准和账号权限是不同设置。'};
  // Group server-reported outcomes only; this does not decide session validity.
  const historySession=s=>['revoked','expired','disabled'].includes(s.status)||(s.status==='unknown'&&s.source==='legacy');
  const roleName=a=>a?.kind==='master'?'总后台':a?.kind==='security'?'安全中心':a?.kind==='page'?'投手后台':'后台账号';
  const events={login_success:'登录成功',login_failed:'登录失败',logout:'退出登录',new_device:'新设备提醒',revoke:'结束会话',account:'账号权限',export:'导出记录',settings:'安全设置',ip_management:'IP 名单管理',device_review:'设备审批登记',device_note_sync:'设备备注同步',ip_label:'固定 IP 备注'};
  descriptions['blocked-ips']='查看总后台被拒绝的访问，核对后将指定出口 IP 加入白名单；不会自动批准设备。';
  titles['landing-protection']='落地页防护';
  descriptions['landing-protection']='按域名独立管理访问限制；不改变总后台、投手后台及订单权限。';
  const landingView=()=>view==='landing-protection';
  const accessView=()=>['ip-allowlist','device-approval','blocked-ips'].includes(view);
  let data=null,view=titles[location.hash.slice(1)]?location.hash.slice(1):'overview',search='',status='',account='',timer=null,epoch=0,fetching=false,toastTimer,devicePage=1,devicePageSize=20,deviceScope='current';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'尚无记录';
  const now=()=>data?new Date(data.server_time).getTime():Date.now();
  const recent=v=>v&&now()-new Date(v).getTime()<86400000;
  const person=id=>data.accounts.find(a=>a.id===id);
  const tag=v=>'<span class="tag">'+esc(v)+'</span>';
  const button=(action,id,label,cls='')=>`<button data-action="${action}" data-id="${esc(id)}" class="${cls}">${label}</button>`;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  function showError(error){$('service-error').textContent=error.message||'暂时无法连接安全服务。';$('service-error').hidden=false;}
  function device(ua){
    const s=ua||'';let os=/Windows NT 10/.test(s)?'Windows':/Android/.test(s)?'Android':/iPhone|iPad/.test(s)?'iOS / iPadOS':/Macintosh/.test(s)?'macOS':/Linux/.test(s)?'Linux':'未知系统';
    const browser=/Edg\//.test(s)?'Edge':/Firefox\//.test(s)?'Firefox':/Chrome|CriOS/.test(s)?'Chrome':/Safari/.test(s)?'Safari':'未知浏览器';
    return os+' · '+browser;
  }
  function badge(s){return `<span class="badge ${esc(s)}" title="${esc(statusHints[s]||'请结合最近记录核对服务器状态。')}">${esc(statuses[s]||s)}</span>`;}
  function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):`<tr><td class="empty" colspan="${headers.length}">没有符合条件的记录</td></tr>` )+'</tbody></table></div>';}
  function filters(mode){
    return `<div class="filters"><input id="search" aria-label="搜索记录" placeholder="搜索人员、账号、设备或 IP" value="${esc(search)}"><select id="account-filter" aria-label="账号筛选"><option value="">全部账号</option>${data.accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===account?'selected':''}>${esc(a.name)} (${esc(a.username)})</option>`).join('')}</select>${mode==='devices'?`<select id="status-filter" aria-label="会话状态"><option value="">全部状态</option>${Object.entries(statuses).filter(([k])=>deviceScope==='history'?['revoked','expired','disabled','unknown'].includes(k):!['revoked','expired','disabled'].includes(k)).map(([k,v])=>`<option value="${k}" ${status===k?'selected':''}>${v}</option>`).join('')}</select>`:''}</div>`;
  }
  const ipNote=ip=>window.CSecurityAccess?.ipLabel(ip)?.label||'';
  function ipDisplay(ip,accountId){const key=v=>String(v||'').replace(/\/(32|128)$/,'').toLowerCase();const matches=data.sessions.filter(s=>ip&&key(s.ip)===key(ip)&&s.remark);const labels=[...matches.filter(s=>s.accountId===accountId),...matches.filter(s=>s.accountId!==accountId)].map(s=>s.remark);return window.CSecurityAccess?window.CSecurityAccess.formatIp(ip,labels):esc(ip||'未取得');}
  function sessionIp(ip){return window.CSecurityAccess?window.CSecurityAccess.formatIp(ip,[]):esc(ip||'未取得');}
  function showSessionDetails(s){
    const a=person(s.accountId),field=(label,value,wide=false)=>`<div${wide?' class="wide"':''}><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    $('session-detail-content').innerHTML=`<p class="session-detail-intro">以下为打开详情时的记录，仅供查看。状态以列表最新刷新为准。</p><dl class="session-detail-grid">${field('人员',s.name)}${field('账号 / 类型',(a?.username||s.accountId)+' / '+roleName(a))}${field('设备名称',s.remark||'未命名设备')}${field('系统 / 浏览器',device(s.userAgent))}${field('网络出口 IP',s.ip||'未取得')}${field('固定 IP 备注',ipNote(s.ip)||'未设置')}${field('本次登录时间',date(s.createdAt))}${field('最近连接反馈',date(s.lastSeenAt))}${field('最近操作记录',date(s.lastActivityAt))}${field('原登录到期时间',date(s.expiresAt))}${field('会话状态',statuses[s.status]||s.status)}${field('记录来源',s.source==='legacy'?'接入前的旧登录记录':'已记录登录')}${field('可访问 Page',(a?.pages||[]).join('、')||'未取得 Page 信息',true)}${field('浏览器请求信息',s.userAgent||'未取得',true)}${field('登录记录编号',s.id,true)}</dl><p class="session-detail-footnote">${esc(statusHints[s.status]||'请结合最近记录核对服务器状态。')} VPN IP 是网络出口，不代表实际所在地。设备名称只是备注，不是硬件身份凭证。</p>`;
    $('session-detail').showModal();$('session-detail-title').focus();$('session-detail').scrollTop=0;
  }
  function sessionRows(sessions){return sessions.map(s=>{
    const a=person(s.accountId),open=!['revoked','expired','disabled'].includes(s.status);
    return `<tr><td data-label="人员 / 账号"><div class="cell-main"><strong>${esc(s.name)}</strong><small>${esc(roleName(a)+' · '+(a?.username||s.accountId))}</small></div></td><td data-label="设备名称"><div class="cell-main"><strong>${esc(s.remark||'未命名设备')}</strong>${s.current?tag('本次安全中心登录'):''}<small>${esc(device(s.userAgent))}</small></div></td><td data-label="出口 IP / IP 备注">${sessionIp(s.ip)}</td><td data-label="最近活动"><div class="cell-main">${s.lastActivityAt?esc(date(s.lastActivityAt)):'暂无操作记录'}<small>登录：${esc(date(s.createdAt))}</small></div></td><td data-label="会话状态">${badge(s.status)}</td><td data-label="操作"><div class="row-actions session-row-actions">${button('detail',s.id,'详情')}${button('session_remark',s.id,'改设备名')}${open?button('revoke',s.id,'退出本次登录','red'):''}</div></td></tr>`;
  });}
  function logsTable(logs){return table(['时间','操作账号','事件','内容','网络出口 IP'],logs.map(l=>`<tr><td>${esc(date(l.created_at))}</td><td>${esc(l.actor||l.account_key)}</td><td>${esc(events[l.event_type]||l.event_type)}</td><td class="log-detail">${esc(l.detail)}</td><td>${ipDisplay(l.ip,l.account_key)}</td></tr>`));}
  function overview(){
    const active=data.sessions.filter(s=>['active','idle'].includes(s.status)).length, alerts=data.logs.filter(l=>l.event_type==='new_device'&&!l.acknowledged_at),failures=data.logs.filter(l=>l.event_type==='login_failed'&&recent(l.created_at)),sensitive=data.logs.filter(l=>['revoke','account','export','settings'].includes(l.event_type)&&recent(l.created_at));
    const cards=[['在线会话',active,'最近 90 秒内有心跳'],['新设备提醒',alerts.length,'尚未确认的浏览器环境'],['近期登录失败',failures.length,'最近 24 小时，已载入记录'],['近期敏感操作',sensitive.length,'最近 24 小时，已载入记录']];
    return '<div class="metrics">'+cards.map(([name,n,foot])=>`<div class="metric"><div class="metric-top">${name}</div><div class="metric-value">${n}</div><div class="metric-foot">${foot}</div></div>`).join('')+`</div><div class="scope-note">${data.enforced?'会话保护已启用。':'会话保护正在部署，尚未切换强制校验。'} 历史会话没有实时心跳，不计入在线数；旧 Page 登录在接入前不会产生设备历史。</div><section class="panel"><div class="panel-header"><h2>新设备提醒</h2></div>${alerts.length?alerts.slice(0,12).map(l=>`<div class="notice-item"><div><h3>${esc(l.actor)} · 新浏览器环境</h3><p>${esc(date(l.created_at))} · ${esc([ipNote(l.ip),l.ip].filter(Boolean).join(' · ')||'未取得 IP')}</p>${button('acknowledge',l.id,'已核对','text-button')}</div></div>`).join(''):'<div class="notice-clear">暂无待确认提醒</div>'}</section><section class="panel section-gap"><div class="panel-header"><h2>近期敏感操作</h2></div>${logsTable(sensitive.slice(0,10))}</section>`;
  }
  function devices(){
    const historicalCount=data.sessions.filter(historySession).length,currentCount=data.sessions.length-historicalCount;
    const scopeTabs=`<div class="session-scope-switch" role="group" aria-label="登录记录范围"><button data-action="devices_scope" data-id="current" aria-pressed="${deviceScope==='current'}">当前登录 <span>${currentCount}</span></button><button data-action="devices_scope" data-id="history" aria-pressed="${deviceScope==='history'}">历史登录 <span>${historicalCount}</span></button><small>最近 90 天已载入记录</small></div>`;
    const scopeDescription=deviceScope==='history'?'包含已退出、已超时、账号停用及接入前的旧记录。状态待核实不代表已退出。':'显示服务器尚未标为结束的登录，包含暂未收到连接反馈的会话；不代表本人正在操作。';
    const help=`<details class="session-status-help"><summary>状态怎么看？</summary><dl>${Object.entries(statusHints).map(([key,hint])=>`<div><dt>${esc(statuses[key])}</dt><dd>${esc(hint)}</dd></div>`).join('')}</dl></details>`;
    const rows=data.sessions.filter(s=>(deviceScope==='history'?historySession(s):!historySession(s))&&(!status||s.status===status)&&(!account||s.accountId===account)&&(!search||[s.name,person(s.accountId)?.username,s.ip,ipNote(s.ip),s.remark,device(s.userAgent)].join(' ').toLowerCase().includes(search.toLowerCase())));
    const pages=Math.max(1,Math.ceil(rows.length/devicePageSize));devicePage=Math.max(1,Math.min(devicePage,pages));
    const offset=(devicePage-1)*devicePageSize,pageRows=rows.slice(offset,offset+devicePageSize);
    const pagination=`<nav class="device-pagination" aria-label="登录记录分页"><div class="device-page-summary" aria-live="polite">第 ${rows.length?offset+1:0}–${offset+pageRows.length} 条，共 ${rows.length} 条<small>${deviceScope==='history'?'历史登录':'当前登录'} · 最近 90 天已载入的会话记录</small></div><div class="device-page-controls"><label for="device-page-size">每页</label><select id="device-page-size" aria-label="每页记录数">${[20,50,100].map(size=>`<option value="${size}" ${size===devicePageSize?'selected':''}>${size} 条</option>`).join('')}</select><button data-action="devices_previous" ${devicePage===1?'disabled':''}>上一页</button><span>第 ${devicePage} / ${pages} 页</span><button data-action="devices_next" ${devicePage===pages?'disabled':''}>下一页</button></div></nav>`;
    return '<div class="scope-note session-scope-note"><strong>'+scopeDescription+'</strong><p>退出本次登录不会封禁设备；总后台设备准入请在“设备批准”管理。IP 备注跟 IP 走，不代表设备身份或真实所在地。</p>'+help+'</div><section class="panel session-record-list">'+scopeTabs+filters('devices')+table(['人员 / 账号','设备名称','出口 IP / IP 备注','最近活动','会话状态','操作'],sessionRows(pageRows))+pagination+'</section>';
  }
  function sessions(){return `<div class="scope-note">退出后，服务器会拒绝该会话后续读取和修改订单。界面会在下一次检查时要求重新登录，已显示在屏幕上的内容无法远程收回。</div><section class="panel"><div class="panel-header"><h2>批量结束会话</h2>${button('revoke_others','','退出其他全部会话','danger')}</div></section><section class="panel section-gap"><div class="panel-header"><h2>按账号结束会话</h2></div>${table(['投手 / 账号','角色','在线会话','操作'],data.accounts.map(a=>`<tr><td>${esc(a.name)}<small class="account-sub">${esc(a.username)}</small></td><td>${a.kind==='master'?'总后台':a.kind==='security'?'安全中心':'Page 后台'}</td><td>${data.sessions.filter(s=>s.accountId===a.id&&['active','idle'].includes(s.status)).length}</td><td class="row-actions">${a.kind==='security'?'请在登录记录中选择会话':button('revoke_account',a.id,'退出此账号全部会话','red')}</td></tr>`))}</section>`;}
  function accounts(){return '<div class="scope-note">停用只影响后台访问并结束该账号会话，不修改 Page 公司名、落地页、订单或收单开关。重新启用后需要再次登录。</div><section class="panel">'+table(['投手 / 账号','可访问 Page','后台权限','操作'],data.accounts.map(a=>`<tr><td>${esc(a.name)}<small class="account-sub">${esc(a.username)}</small></td><td>${a.pages.map(tag).join('')}</td><td><span class="badge ${a.enabled?'active':'disabled'}">${a.enabled?'已启用':'已停用'}</span></td><td class="row-actions">${a.kind==='security'?'独立管理账号':button('account_toggle',a.id,a.enabled?'停用后台账号':'重新启用',a.enabled?'red':'')}</td></tr>`))+'</section>';}
  function logs(){const logs=data.logs.filter(l=>(!account||l.account_key===account)&&(!search||[l.actor,l.detail,l.ip,ipNote(l.ip),events[l.event_type]].join(' ').toLowerCase().includes(search.toLowerCase())));return `<section class="panel"><div class="panel-header"><h2>安全日志</h2>${button('export','','导出当前日志','secondary small')}</div>${filters('logs')}${logsTable(logs)}<div class="table-footer">最近 ${data.logs.length} 条服务器记录；不含接入前未记录的 Page 活动。</div></section>`;}
  function settings(){const s=data.settings,option=(name,values,current,unit)=>`<select name="${name}" aria-label="${name}">${values.map(v=>`<option value="${v}" ${v===current?'selected':''}>${v}${unit}</option>`).join('')}</select>`;return `<form id="settings-form" class="panel"><div class="panel-header"><h2>安全设置</h2></div><div class="settings-body"><div class="setting-row"><div><h3>连续失败次数</h3><p>同账号达到阈值后暂时禁止登录。</p></div>${option('attempts',Array.from({length:18},(_,i)=>i+3),s.attempts,' 次')}</div><div class="setting-row"><div><h3>失败统计时间</h3><p>统计这段时间内的连续登录失败。</p></div>${option('window',[5,10,30],s.window,' 分钟')}</div><div class="setting-row"><div><h3>暂时锁定时间</h3><p>达到失败次数后的等待时间。</p></div>${option('lock',[5,15,30,60],s.lock,' 分钟')}</div><div class="setting-row"><div><h3>闲置超时</h3><p>超过时限没有页面操作，需要重新登录。</p></div>${option('idle',[15,30,60,120],s.idle,' 分钟')}</div><div class="setting-row"><div><h3>最长登录时间</h3><p>修改后适用于新登录的会话。</p></div>${option('lifetime',[4,8,12,24],s.lifetime,' 小时')}</div><div class="setting-row"><div><h3>新设备提醒</h3><p>识别新浏览器环境，不获取真实硬件身份。</p></div><label class="switch"><input name="newDeviceAlerts" type="checkbox" aria-label="新设备提醒" ${s.newDeviceAlerts?'checked':''}></label></div></div><div class="settings-footer"><span>设置由服务器保存并执行</span><button class="primary" type="submit">保存设置</button></div></form>`;}
  function render(){if(!data)return;$('title').textContent=titles[view];$('subtitle').textContent=descriptions[view];document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});$('content').innerHTML=landingView()?window.CSecurityLanding.render(data.landing):accessView()?window.CSecurityAccess.render(view,data.access):({overview,devices,sessions,accounts,logs,settings}[view])();}
  async function refresh(quiet=false){
    if(fetching)return;const version=epoch,requestedView=view,wantsAccess=accessView(),wantsLanding=landingView();fetching=true;$('refresh').disabled=true;
    try{
      if(wantsLanding){
        const result=await window.CSecurityLanding.load(api);
        if(version!==epoch)return;
        data={...(data||{}),landing:result.data,server_time:result.data.server_time};
        $('connection').textContent='已连接服务器';$('updated').textContent='更新于 '+date(data.server_time);$('service-error').hidden=true;if(requestedView===view)render();return;
      }
      // Independent reads share one refresh; all writes still use their existing checks.
      const labels=window.CSecurityAccess.loadLabels(api).then(()=>null,error=>error);
      const load=async()=>{
        if(wantsAccess&&data){const result=await window.CSecurityAccess.load(api,requestedView);return {...data,access:result.data,server_time:result.data.server_time};}
        const result=await api.authorized('dashboard'),next=result.data;
        if(wantsAccess){const access=await window.CSecurityAccess.load(api,requestedView);next.access=access.data;next.server_time=access.data.server_time;}
        return next;
      };
      const [next,labelError]=await Promise.all([load(),labels]);
      if(version!==epoch)return;data=next;
      $('connection').textContent=labelError?'设备数据已连接 · IP 备注暂不可用':'已连接服务器';$('updated').textContent='更新于 '+date(data.server_time);$('service-error').hidden=!labelError;if(labelError)showError(labelError);if(!quiet||view!=='settings')render();
    }
    catch(error){if(version===epoch){showError(error);$('connection').textContent='连接暂不可用';}}
    finally{fetching=false;$('refresh').disabled=false;if(version===epoch&&requestedView!==view)refresh(true);}
  }
  function enter(){epoch++;$('login').hidden=true;$('app').hidden=false;refresh();clearInterval(timer);timer=setInterval(()=>refresh(true),30000);}
  async function leave(){epoch++;clearInterval(timer);await api.logout();data=null;location.reload();}
  function confirmAction(title,description,remark,caption='设备备注'){return new Promise(resolve=>{const dialog=$('confirm');dialog.returnValue='cancel';$('confirm-title').textContent=title;$('confirm-description').textContent=description;$('remark-label').hidden=remark===undefined;$('remark-caption').textContent=caption;$('remark-input').maxLength=caption==='IP 备注'?80:50;$('remark-input').value=remark||'';dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'?{remark:$('remark-input').value}:null),{once:true});dialog.showModal();});}
  function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  async function exportLogs(){const rows=data.logs.filter(l=>(!account||l.account_key===account)&&(!search||[l.actor,l.detail,l.ip,ipNote(l.ip),events[l.event_type]].join(' ').toLowerCase().includes(search.toLowerCase())));await api.authorized('export',{count:rows.length});const csv=[['时间','账号','事件','内容','网络出口 IP','固定 IP 备注'],...rows.map(l=>[date(l.created_at),l.actor,events[l.event_type]||l.event_type,l.detail,l.ip,ipNote(l.ip)])].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='security-logs-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('安全日志已导出');}
  $('login-form').addEventListener('submit',async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;$('login-error').hidden=true;const password=$('password').value;$('password').value='';try{await api.securityLogin($('username').value.trim(),password);enter();}catch(error){$('login-error').textContent=error.message;$('login-error').hidden=false;}finally{submit.disabled=false;}});
  function navigate(target){if(!titles[target])return;view=target;search='';status='';account='';devicePage=1;deviceScope='current';window.CSecurityAccess?.reset();history.replaceState(null,'','#'+view);if(landingView()||data?.accounts)render();if(accessView()||landingView()||!data?.accounts)refresh();}
  document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)navigate(b.dataset.view);});
  $('refresh').addEventListener('click',()=>refresh());$('logout').addEventListener('click',leave);$('mobile-logout').addEventListener('click',leave);
  $('content').addEventListener('change',e=>{if(landingView()&&window.CSecurityLanding.filterEvent(e)){render();return;}if(window.CSecurityAccess?.filterEvent(e)){render();return;}if(e.target.id==='device-page-size'){const size=Number(e.target.value);if(![20,50,100].includes(size))return;devicePageSize=size;devicePage=1;render();return;}if(e.target.id==='account-filter'){account=e.target.value;devicePage=1;render();}if(e.target.id==='status-filter'){status=e.target.value;devicePage=1;render();}});
  $('content').addEventListener('input',e=>{if(e.target.id==='access-search'){const start=e.target.selectionStart;window.CSecurityAccess.filterEvent(e);render();$('access-search').focus();$('access-search').setSelectionRange(start,start);return;}if(e.target.id==='search'){search=e.target.value;devicePage=1;const start=e.target.selectionStart;render();$('search').focus();$('search').setSelectionRange(start,start);}});
  $('content').addEventListener('submit',async e=>{if(e.target.id!=='settings-form')return;e.preventDefault();const f=new FormData(e.target),settings={attempts:Number(f.get('attempts')),window:Number(f.get('window')),lock:Number(f.get('lock')),idle:Number(f.get('idle')),lifetime:Number(f.get('lifetime')),newDeviceAlerts:f.has('newDeviceAlerts')};e.submitter.disabled=true;try{await api.authorized('settings',{settings});toast('安全设置已保存');await refresh();}catch(error){showError(error);e.submitter.disabled=false;}});
  $('content').addEventListener('click',async e=>{
    const b=e.target.closest('[data-action]');if(!b)return;const {action,id}=b.dataset;let payload={},confirmed;
    if(view==='devices'&&action==='devices_scope'){if(!['current','history'].includes(id))return;deviceScope=id;devicePage=1;status='';render();return;}
    if(view==='devices'&&(action==='devices_previous'||action==='devices_next')){if(b.disabled)return;devicePage+=action==='devices_next'?1:-1;render();return;}
    try{
      if(action.startsWith('landing_')){b.disabled=true;await window.CSecurityLanding.handle(action,id,{api,data:data.landing,confirmAction,toast,refresh,render});return;}
      if(action==='ip_label'){const record=window.CSecurityAccess.ipLabel(id);if(!record)return;confirmed=await confirmAction('固定 IP 备注',`为 ${record.address} 设置固定显示名称。同一 IP 在各个安全管理界面显示相同备注，设备换 IP 或改名不会带走此备注。共用 VPN 出口不代表同一台电脑。此操作不改变任何访问权限；留空可清除固定备注。`,record.label,'IP 备注');if(!confirmed)return;b.disabled=true;await window.CSecurityAccess.saveIpLabel(api,record.address,confirmed.remark.trim(),record.revision);toast('固定 IP 备注已保存，访问权限未改变');await refresh();return;}
      if(action.startsWith('access_')||action.startsWith('gate_')){b.disabled=true;await window.CSecurityAccess.handle(action,id,{data:data.access,api,confirmAction,toast,refresh,render,navigate});return;}
      if(action==='export'){b.disabled=true;await exportLogs();return;}
      if(action==='detail'){const s=data.sessions.find(s=>s.id===id);if(s)showSessionDetails(s);return;}
      if(action==='session_remark'){const s=data.sessions.find(s=>s.id===id);if(!s)return;confirmed=await confirmAction('修改设备名称',`${s.name}；${device(s.userAgent)}；登录：${date(s.createdAt)}；出口 IP：${s.ip||'未取得'}。这里只修改设备备注，不修改固定 IP 备注、批准状态或访问权限。`,s.remark);if(!confirmed)return;payload={session_id:id,remark:confirmed.remark};await api.authorized('remark',payload);let synced=true;try{if(window.CSecurityAccess)await window.CSecurityAccess.syncRemark(api,id);}catch{synced=false;}toast(synced?'设备备注和关联 IP 显示已更新':'设备备注已保存，关联显示同步暂不可用，请稍后刷新');await refresh();return;}
      if(action==='acknowledge'){payload={event_id:id};}
      else if(action==='revoke'){const s=data.sessions.find(s=>s.id===id);if(!s)return;confirmed=await confirmAction('退出本次登录',`人员：${s.name}；设备：${s.remark||device(s.userAgent)}；出口 IP：${s.ip||'未取得'}；登录时间：${date(s.createdAt)}。只结束这一条登录，不封禁设备；再次登录仍按现有安全规则校验。${s.current?'这会退出你当前的安全中心登录。':'同账号其他登录不受影响。'}`);payload={session_id:id};}
      else if(action==='revoke_others'){confirmed=await confirmAction('退出其他全部会话','保留当前安全中心登录，结束所有已记录的其他后台会话。客户提交资料不受影响。');}
      else if(action==='revoke_account'){confirmed=await confirmAction('退出账号全部会话',`结束 ${person(id)?.name||id} 的所有后台会话，需要重新登录。`);payload={account_key:id};}
      else if(action==='account_toggle'){const a=person(id);confirmed=await confirmAction(a.enabled?'停用后台账号':'启用后台账号',`${a.name}：${a.enabled?'停止后台访问并结束现有会话；落地页仍可收单。':'恢复后台登录权限，需要重新登录。'}`);payload={account_key:id};}
      else return;
      if(action!=='acknowledge'&&!confirmed)return;b.disabled=true;await api.authorized(action,payload);toast('操作已完成');if(action==='revoke'&&id===data.current_session_id){await leave();return;}await refresh();
    }catch(error){showError(error);}finally{b.disabled=false;}
  });
  (async()=>{try{if(await api.restore('security'))enter();}catch(error){$('login-error').textContent=error.message;$('login-error').hidden=false;}})();
})();
