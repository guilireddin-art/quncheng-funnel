(function () {
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
    active: true
  };

  window.PAGE_CONFIG_READY = loadConfig();

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
      window.fbq("track", "PageView");
    });
  }
})();
