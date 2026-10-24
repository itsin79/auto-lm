"use strict";
window.AutoLMApi = {
  async request(url, options = {}) {
    let response;
    try { response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options.headers } }); }
    catch (_) { throw Object.assign(new Error("ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید."), { status: 0 }); }
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (_) {
      const contentType = response.headers.get("content-type") || "";
      const html = /text\/html/i.test(contentType) || /^\s*<(?:!doctype|html|head|body)\b/i.test(raw);
      const missingPage = /the page (?:could not be found|can't be found|cannot be found)/i.test(raw);
      const path = new URL(url, location.href).pathname;
      const message = missingPage
        ? `Vercel مسیر API را پیدا نکرد (HTTP ${response.status}): ${path}.`
        : html
        ? `به‌جای پاسخ API، صفحهٔ HTML دریافت شد (HTTP ${response.status}): ${path}. ورود Vercel یا مسیر API را بررسی کنید.`
        : `پاسخ سرور JSON معتبر نیست (HTTP ${response.status}).`;
      throw Object.assign(new Error(message), { status: response.status, responseType: html ? "html" : "invalid-json" });
    }
    if (!response.ok) throw Object.assign(new Error(payload?.error || "درخواست انجام نشد."), { status: response.status });
    return payload;
  },
  legacyRecords() {
    try {
      const db = JSON.parse(localStorage.getItem("carcheck_inspections_v2") || "null");
      if (db?.schemaVersion !== 2 || !Array.isArray(db.inspections)) return [];
      let pending = [];
      try { pending = JSON.parse(localStorage.getItem("carcheck_server_pending_v1") || "[]"); } catch (_) { /* Preserve readable legacy records. */ }
      const pendingIds = new Set((Array.isArray(pending) ? pending : []).map(record => record?.id));
      const seen = new Set();
      return [...db.inspections, ...Object.values(db.drafts || {})].filter(record => {
        if (!record?.id || record.version > 0 || pendingIds.has(record.id) || record.demo === true || record.id.startsWith("demo-") || seen.has(record.id)) return false;
        seen.add(record.id); return true;
      });
    } catch (_) { return []; }
  }
};
