(function () {
  document.documentElement.classList.add("page-config-loading");
  const loadingStyle = document.createElement("style");
  loadingStyle.textContent = ".page-config-loading body{visibility:hidden}";
  document.head.appendChild(loadingStyle);

  const SUPABASE_URL = "https://ijzywhrnhvldkjdwfdyy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_6aY1-VEvimuV1K4FzURO2Q_inVt-ZKL";
  const params = new URLSearchParams(location.search);
  const pathMatch = location.pathname.match(/\/(page[\w-]+)\/?$/i);
  const slug = params.get("page") || pathMatch?.[1] || localStorage.getItem("active_page_slug") || "main";

  window.PAGE_SLUG = slug;
  localStorage.setItem("active_page_slug", slug);

  const defaults = {
    slug,
    company_name: "富恩資產管理有限公司",
    line_id: "",
    line_url: "",
    pixel_ids: [],
    tiktok_pixel_ids: [],
    active: true
  };

  window.PAGE_CONFIG_READY = loadConfig().finally(() => {
    document.documentElement.classList.remove("page-config-loading");
    loadingStyle.remove();
  });
  window.trackPageEvent = trackPageEvent;

  async function loadConfig() {
    let config = defaults;
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/pages?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = response.ok ? await response.json() : [];
      if (rows[0]) config = { ...defaults, ...rows[0] };
    } catch (_) {}

    window.PAGE_CONFIG = config;
    applyConfig(config);
    return config;
  }

  function applyConfig(config) {
    document.querySelectorAll("[data-company-name]").forEach(el => {
      el.textContent = config.company_name;
    });
    document.title = document.title.replace("富恩資產管理有限公司", config.company_name);
    document.querySelectorAll("a[href]").forEach(link => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("javascript:")) return;
      const url = new URL(href, location.href);
      url.searchParams.set("page", slug);
      link.href = url.pathname.split("/").pop() + url.search;
    });
    if (config.active === false) {
      document.body.innerHTML = '<main style="font-family:sans-serif;text-align:center;padding:80px 20px"><h1>此頁面目前暫停服務</h1><p>請稍後再試。</p></main>';
      return;
    }
    installPixels(config.pixel_ids || []);
    installTikTokPixels(config.tiktok_pixel_ids || []);
  }

  function installPixels(ids) {
    const cleanIds = Array.isArray(ids) ? ids : String(ids || "").split(/[\s,]+/);
    cleanIds.filter(Boolean).forEach(id => {
      if (document.querySelector(`[data-pixel-id="${id}"]`)) return;
      const marker = document.createElement("meta");
      marker.dataset.pixelId = id;
      document.head.appendChild(marker);
      if (!window.fbq) {
        window.fbq = function () { window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments); };
        window.fbq.queue = [];
        window.fbq.loaded = true;
        window.fbq.version = "2.0";
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);
      }
      window.fbq("init", id);
    });
    if (cleanIds.filter(Boolean).length) window.fbq("track", "PageView");
  }

  function trackPageEvent(eventName, params) {
    if (!window.fbq) return;
    window.fbq("track", eventName, { page_slug: slug, ...(params || {}) });
  }

  function installTikTokPixels(ids) {
    const cleanIds = (Array.isArray(ids) ? ids : String(ids || "").split(/[\s,]+/)).filter(Boolean);
    if (!cleanIds.length) return;
    if (!window.ttq) {
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)}}(window,document,"ttq");
    }
    cleanIds.forEach(id => {
      if (document.querySelector(`[data-tiktok-pixel-id="${id}"]`)) return;
      const marker = document.createElement("meta");
      marker.dataset.tiktokPixelId = id;
      document.head.appendChild(marker);
      window.ttq.load(id);
    });
    window.ttq.page();
    if (/\/loan\.html$/i.test(location.pathname)) trackTikTokEvent("ViewContent", { content_type: "loan_options" });
  }

  function trackTikTokEvent(eventName, params) {
    if (!window.ttq) return;
    window.ttq.track(eventName, { page_slug: slug, ...(params || {}) });
  }

  window.trackTikTokEvent = trackTikTokEvent;
})();
