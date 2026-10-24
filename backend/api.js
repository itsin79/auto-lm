"use strict";
const { ApiError } = require("./errors.js");
const { timingSafeEqual } = require("node:crypto");
const COOKIE = { admin: "autolm_admin_session", expert: "autolm_expert_session" };
function createApi(store, sendJson, options = {}) {
  const attempts = new Map();
  const mcpSyncToken = typeof options.mcpSyncToken === "string" ? options.mcpSyncToken : "";
  const defaultInspector = typeof options.defaultInspector === "string" ? options.defaultInspector : "";
  const publicOrigin = typeof options.publicOrigin === "string" ? options.publicOrigin.replace(/\/$/, "") : "";
  function validMcpToken(req) {
    const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const expected = Buffer.from(mcpSyncToken), actual = Buffer.from(provided);
    return Boolean(mcpSyncToken) && actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  function token(req, role) {
    const cookie = String(req.headers.cookie || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE[role]}=`));
    return cookie ? cookie.slice(COOKIE[role].length + 1) : "";
  }
  async function requireSession(req, role) {
    const user = await store.session(token(req, role), role);
    if (!user) throw new ApiError(401, "برای ادامه وارد حساب خود شوید.");
    return user;
  }
  function setCookie(res, role, value, expired = false) {
    res.setHeader("Set-Cookie", `${COOKIE[role]}=${value}; Path=/; HttpOnly; SameSite=Strict; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Max-Age=${expired ? 0 : 43200}`);
  }
  async function body(req) {
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw new ApiError(415, "نوع درخواست باید JSON باشد.");
    let size = 0, raw = "";
    for await (const chunk of req) { size += chunk.length; if (size > 5 * 1024 * 1024) throw new ApiError(413, "حجم درخواست بیش از حد مجاز است."); raw += chunk; }
    try { const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
    catch (_) { throw new ApiError(400, "بدنهٔ درخواست معتبر نیست."); }
  }
  return async function api(req, res, url) {
    const role = url.searchParams.get("role") === "expert" ? "expert" : "admin";
    try {
      if (!["GET", "POST", "PUT"].includes(req.method)) throw new ApiError(405, "متد درخواست پشتیبانی نمی‌شود.");
      const mcpImport = url.pathname === "/api/mcp/inspections" && req.method === "POST";
      if (mcpImport) {
        if (!validMcpToken(req)) throw new ApiError(401, "توکن همگام‌سازی MCP معتبر نیست.");
        const input = await body(req);
        return sendJson(res, 200, { inspection: await store.importMcp(input.inspection, defaultInspector) });
      }
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        const sameOrigin = [`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin);
        if (!sameOrigin && (!publicOrigin || origin !== publicOrigin)) throw new ApiError(403, "مبدأ درخواست معتبر نیست.");
      }
      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        const input = await body(req), key = `${req.socket?.remoteAddress || "vercel"}:${String(input.username || input.mobile || "").slice(0, 20)}`;
        const attempt = attempts.get(key) || { count: 0, until: Date.now() + 900000 };
        if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 900000; }
        if (attempt.count >= 8) throw new ApiError(429, "تعداد تلاش‌های ورود زیاد است. ۱۵ دقیقهٔ دیگر دوباره تلاش کنید.");
        attempt.count++; attempts.set(key, attempt);
        if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
        const result = await store.login(input); attempts.delete(key); setCookie(res, result.user.role, result.token);
        return sendJson(res, 200, { user: result.user });
      }
      if (url.pathname === "/api/auth/session" && req.method === "GET") return sendJson(res, 200, { user: await requireSession(req, role) });
      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        await store.logout(token(req, role)); setCookie(res, role, "", true); return sendJson(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/api/admin/")) {
        const user = await requireSession(req, "admin");
        if (url.pathname === "/api/admin/overview" && req.method === "GET") return sendJson(res, 200, await store.overview());
        if (url.pathname === "/api/admin/experts" && req.method === "POST") return sendJson(res, 201, { expert: await store.saveExpert(await body(req)) });
        const match = url.pathname.match(/^\/api\/admin\/experts\/(09\d{9})$/);
        if (match && req.method === "PUT") return sendJson(res, 200, { expert: await store.saveExpert(await body(req), match[1]) });
        if (url.pathname === "/api/admin/import" && req.method === "POST") return sendJson(res, 200, await store.importLegacy(await body(req), user.mobile));
      }
      if (url.pathname.startsWith("/api/expert/")) {
        const user = await requireSession(req, "expert");
        if (url.pathname === "/api/expert/inspections" && req.method === "GET") return sendJson(res, 200, { inspections: await store.listInspections(user.mobile, true), expert: user.expert });
        const match = url.pathname.match(/^\/api\/expert\/inspections\/([A-Za-z0-9_-]{1,80})$/);
        if (match && req.method === "PUT") {
          const input = await body(req);
          if (input.id !== match[1]) throw new ApiError(400, "شناسهٔ پرونده مطابقت ندارد.");
          return sendJson(res, 200, { inspection: await store.saveInspection(input, user.mobile) });
        }
        if (url.pathname === "/api/expert/import" && req.method === "POST") return sendJson(res, 200, await store.importLegacy(await body(req), user.mobile, user.mobile));
      }
      throw new ApiError(404, "یافت نشد.");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) process.stderr.write(`API error: ${error.code || error.name || "unknown"}\n`);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "خطای داخلی سرور؛ اطلاعات ذخیره نشد." : error.message });
    }
  };
}
module.exports = { createApi };
