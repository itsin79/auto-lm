"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createStore } = require("./backend/store.js");
const { createApi } = require("./backend/api.js");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error("PORT must be an integer between 1024 and 65535.");
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, ...String(process.env.AUTOLM_ALLOWED_HOSTS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)]);
process.umask(0o077);
const DATA_DIR = path.join(ROOT, ".data");
const LOCAL_LOGIN_HINTS = readLocalLoginHints(path.join(DATA_DIR, "local-login-hints.json"));
const store = createStore(process.env.AUTOLM_DB_PATH || path.join(DATA_DIR, "autolm.sqlite"), { minimumPasswordLength: 9 });
const api = createApi(store, sendJson, {
  mcpSyncToken: process.env.AUTOLM_MCP_SYNC_TOKEN || "",
  defaultInspector: process.env.AUTOLM_DEFAULT_INSPECTOR || "",
  publicOrigin: process.env.AUTOLM_PUBLIC_ORIGIN || ""
});

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readLocalLoginHints(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    const expert = value?.expert, admin = value?.admin;
    if (!/^09\d{9}$/.test(expert?.username || "") || typeof expert.password !== "string" || expert.password.length < 9 || expert.password.length > 128) return null;
    if (admin?.username !== "admin" || typeof admin.password !== "string" || !admin.password || admin.password.length > 128) return null;
    return { expert, admin };
  } catch (_) { return null; }
}

const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/api-client.js", ["api-client.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/admin", ["admin/index.html", "text/html; charset=utf-8"]],
  ["/admin/", ["admin/index.html", "text/html; charset=utf-8"]],
  ["/admin/index.html", ["admin/index.html", "text/html; charset=utf-8"]],
  ["/admin/admin.js", ["admin/admin.js", "text/javascript; charset=utf-8"]],
  ["/admin/domain.js", ["admin/domain.js", "text/javascript; charset=utf-8"]],
  ["/admin/report.js", ["admin/report.js", "text/javascript; charset=utf-8"]],
  ["/admin/table-export.js", ["admin/table-export.js", "text/javascript; charset=utf-8"]],
  ["/admin/admin.css", ["admin/admin.css", "text/css; charset=utf-8"]],
  ["/assets/auto-ml-logo.png", ["assets/auto-ml-logo.png", "image/png"]],
  ["/assets/car-inspection-map.png", ["assets/car-inspection-map.png", "image/png"]],
  ["/assets/empty-state.png", ["assets/empty-state.png", "image/png"]],
  ["/assets/iran-plate-band.png", ["assets/iran-plate-band.png", "image/png"]]
]);

function serveStatic(url, req, res) {
  const entry = STATIC_FILES.get(url);
  if (!entry) return sendJson(res, 404, { error: "یافت نشد." });
  const [relativePath, contentType] = entry;
  const file = path.join(ROOT, relativePath);
  let content;
  try { content = fs.readFileSync(file); }
  catch (_) { return sendJson(res, 404, { error: "یافت نشد." }); }
  res.writeHead(200, { "Content-Type": contentType, "Content-Length": content.length, "Cache-Control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : content);
}

const server = http.createServer((req, res) => {
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || HOST}`); }
  catch (_) { return sendJson(res, 400, { error: "نشانی درخواست معتبر نیست." }); }
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) return sendJson(res, 403, { error: "میزبان درخواست معتبر نیست." });
  if (url.pathname === "/api/local-login-hints") {
    const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, { error: "متد درخواست پشتیبانی نمی‌شود." }); }
    if (!LOCAL_LOGIN_HINTS || !loopback.has(req.socket.remoteAddress)) return sendJson(res, 404, { error: "یافت نشد." });
    const role = url.searchParams.get("role");
    if (role === "expert") return sendJson(res, 200, { ...LOCAL_LOGIN_HINTS.expert, minimumPasswordLength: 9 });
    if (role === "admin") return sendJson(res, 200, { ...LOCAL_LOGIN_HINTS.admin, expertPasswordMinLength: 9 });
    return sendJson(res, 400, { error: "نقش معتبر نیست." });
  }
  if (url.pathname.startsWith("/api/")) { api(req, res, url); return; }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendJson(res, 405, { error: "متد درخواست پشتیبانی نمی‌شود." });
  }
  return serveStatic(url.pathname, req, res);
});

server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.listen(PORT, HOST, () => {
  process.stdout.write(`اتو ال‌ام محلی روی http://${HOST}:${PORT} اجرا شد.\n`);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") process.stderr.write(`درگاه ${PORT} در حال استفاده است. متغیر PORT را تغییر دهید.\n`);
  else process.stderr.write("سرور محلی اجرا نشد.\n");
  process.exitCode = 1;
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { server.close(() => { store.close(); process.exit(0); }); });
