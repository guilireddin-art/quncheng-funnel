(function(){
  // Add the new LINE URL here later.
  const LINE_URL="";
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
    modal.innerHTML=`<section class="line-modal" role="dialog" aria-modal="true" aria-labelledby="line-modal-title">
      <button class="line-modal-close" type="button" aria-label="關閉">×</button>
      <div class="line-modal-check">✓</div>
      <h2 id="line-modal-title">申請資料已成功送出</h2>
      <p>最後一步，請加入富恩資產管理有限公司 LINE，並傳送「我要申請」，方便專員核對您的資料與說明後續。</p>
      ${LINE_URL?`<a class="line-modal-btn" href="${LINE_URL}" target="_blank" rel="noopener">加入 LINE 完成後續申請</a>`:`<span class="line-modal-btn disabled" aria-disabled="true">LINE 連結設定中</span>`}
      <div class="line-modal-hint">表單已成功收到，LINE 連結設定完成後即可加入。</div>
      <button class="line-modal-later" type="button">關閉</button>
    </section>`;
    document.body.appendChild(modal);
    modal.querySelector(".line-modal-close").addEventListener("click",closeLineModal);
    modal.querySelector(".line-modal-later").addEventListener("click",closeLineModal);
  }
  function closeLineModal(){document.getElementById("line-success-modal")?.remove()}
  window.showLineSuccessModal=showLineModal;
})();
