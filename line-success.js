(function(){
  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    if(response.ok&&String(input).includes("/rest/v1/leads")&&init?.method==="POST"){
      window.setTimeout(showLineModal,120);
    }
    return response;
  };
  function showLineModal(){
    if(document.getElementById("line-success-modal"))return;
    const modal=document.createElement("div");
    modal.id="line-success-modal";
    modal.className="line-modal-backdrop";
    const config=window.PAGE_CONFIG||{};
    const lineUrl=config.line_url||"";
    const lineId=config.line_id||"";
    modal.innerHTML=`<section class="line-modal" role="dialog" aria-modal="true" aria-labelledby="line-modal-title">
      <button class="line-modal-close" type="button" aria-label="關閉">×</button>
      <div class="line-modal-check">✓</div>
      <h2 id="line-modal-title">申請資料已成功送出</h2>
      <p>最後一步，請加入 ${config.company_name||"富恩資產管理有限公司"} LINE，並傳送「我要申請」，方便專員核對您的資料與說明後續。</p>
      ${lineUrl?`<a class="line-modal-btn" id="line-modal-link" href="${lineUrl}" target="_blank" rel="noopener">加入 LINE 完成後續申請</a>`:`<span class="line-modal-btn disabled" aria-disabled="true">LINE 連結設定中</span>`}
      <div class="line-modal-hint">${lineId?`LINE ID：${lineId}`:"表單已成功收到，LINE 連結設定完成後即可加入。"}</div>
      <button class="line-modal-later" type="button">關閉</button>
    </section>`;
    document.body.appendChild(modal);
    modal.querySelector(".line-modal-close").addEventListener("click",closeLineModal);
    modal.querySelector(".line-modal-later").addEventListener("click",closeLineModal);
    modal.querySelector("#line-modal-link")?.addEventListener("click",markLineClicked);
  }
  async function markLineClicked(){
    window.trackPageEvent?.("Contact",{channel:"LINE"});
    window.trackTikTokEvent?.("Contact",{channel:"LINE"});
    if(!window.LAST_LEAD_ID)return;
    try{
      await originalFetch("https://ijzywhrnhvldkjdwfdyy.supabase.co/rest/v1/rpc/mark_line_clicked",{
        method:"POST",
        headers:{
          apikey:"sb_publishable_6aY1-VEvimuV1K4FzURO2Q_inVt-ZKL",
          Authorization:"Bearer sb_publishable_6aY1-VEvimuV1K4FzURO2Q_inVt-ZKL",
          "Content-Type":"application/json"
        },
        body:JSON.stringify({target_lead_id:window.LAST_LEAD_ID,target_slug:window.PAGE_SLUG||"main"}),
        keepalive:true
      });
    }catch(_){}
  }
  function closeLineModal(){document.getElementById("line-success-modal")?.remove()}
  window.showLineSuccessModal=showLineModal;
})();
