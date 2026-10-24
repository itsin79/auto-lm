"use strict";
const { createApi } = require("./api.js");
const { createPostgrestStore } = require("./postgrest-store.js");

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

const store = createPostgrestStore();
const api = createApi(store, sendJson, {
  mcpSyncToken: process.env.AUTOLM_MCP_SYNC_TOKEN || "",
  defaultInspector: process.env.AUTOLM_DEFAULT_INSPECTOR || "",
  publicOrigin: process.env.AUTOLM_PUBLIC_ORIGIN || ""
});
const allowedHosts = new Set(String(process.env.AUTOLM_ALLOWED_HOSTS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
for (const key of ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) if (process.env[key]) allowedHosts.add(process.env[key].toLowerCase());

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  if (!allowedHosts.has(host)) return sendJson(res, 403, { error: "میزبان درخواست معتبر نیست." });
  let url;
  try { url = new URL(req.url || "/api/", `https://${host}`); }
  catch (_) { return sendJson(res, 400, { error: "نشانی درخواست معتبر نیست." }); }
  if (url.pathname === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true });
  return api(req, res, url);
};
