"use strict";
const { randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const D = require("../admin/domain.js");
const { ApiError } = require("./errors.js");
const scrypt = promisify(scryptCallback);
const now = () => new Date().toISOString();
const mobileOf = value => D.latin(value).trim();
const fail = (status, message) => { throw new ApiError(status, message); };
function passwordCheck(value) { if (typeof value !== "string" || value.length < 10 || value.length > 128) fail(400, "رمز عبور باید بین ۱۰ و ۱۲۸ نویسه باشد."); }
async function hashPassword(value) {
  passwordCheck(value);
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(value, salt, 64)).toString("hex")}`;
}
async function verifyPassword(value, encoded) {
  const [salt, hash] = (encoded || "00000000000000000000000000000000:" + "0".repeat(128)).split(":");
  const result = await scrypt(typeof value === "string" && value.length <= 128 ? value : "", salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === result.length && timingSafeEqual(result, expected);
}
function createPostgrestStore({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, token = process.env.AUTOLM_DB_API_TOKEN } = {}) {
  if (!url || !key || !token) throw new Error("Supabase server configuration is incomplete.");
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/autolm_rpc`;
  async function rpc(action, payload = {}) {
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "x-autolm-db-token": token }, body: JSON.stringify({ p_action: action, p_payload: payload }), signal: AbortSignal.timeout(12000) });
    } catch (_) { throw new ApiError(503, "ارتباط پایگاه داده برقرار نشد؛ دوباره تلاش کنید."); }
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    if (!response.ok) {
      const message = String(data?.message || data?.error || "");
      const match = message.match(/^(\d{3})\|(.*)$/s);
      if (match) throw new ApiError(Number(match[1]), match[2]);
      process.stderr.write(`Supabase RPC error: ${data?.code || response.status}\n`);
      throw new ApiError(response.status >= 500 ? 503 : 500, "خطای پایگاه داده؛ اطلاعات ذخیره نشد.");
    }
    return data;
  }
  function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
  function cleanInput(value) {
    if (!value || typeof value !== "object" || value.demo === true || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.id) || value.id.startsWith("demo-")) fail(400, "شناسهٔ پرونده معتبر نیست.");
    if (!value.vehicle || !value.items || typeof value.vehicle !== "object" || typeof value.items !== "object") fail(400, "اطلاعات پرونده معتبر نیست.");
    const clean = D.cleanRecord(value);
    for (const key of D.itemKeys) {
      const item = value.items[key];
      if (item?.condition != null && !Object.hasOwn(D.conditions, item.condition)) fail(400, "وضعیت مورد کارشناسی معتبر نیست.");
      if (item?.note && (typeof item.note !== "string" || item.note.length > 250)) fail(400, "یادداشت باید حداکثر ۲۵۰ نویسه باشد.");
      if (typeof item?.noteDraft === "string") clean.items[key].noteDraft = item.noteDraft.slice(0, 250);
    }
    const parts = value.vehicle.plateParts;
    clean.vehicle.plateParts = parts && typeof parts === "object" ? { first: D.latin(parts.first || "").replace(/\D/g, "").slice(0, 2), serial: D.latin(parts.serial || "").replace(/\D/g, "").slice(0, 3), region: D.latin(parts.region || "").replace(/\D/g, "").slice(0, 2), letter: String(parts.letter || "").slice(0, 3) } : { first: "", letter: "", serial: "", region: "" };
    clean.step = ["setup", "report", ...D.categories.map(c => c.id)].includes(value.step) ? value.step : "setup";
    return clean;
  }
  async function getExpert(mobile) { return rpc("get_expert", { mobile }); }
  async function login(input) {
    const role = input.role === "expert" ? "expert" : input.role === "admin" ? "admin" : null;
    const mobile = role === "admin" ? "admin" : mobileOf(input.mobile);
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const user = role === "admin" ? (username === "admin" ? await rpc("get_user", { mobile: "admin", role: "admin" }) : null)
      : role === "expert" && /^09\d{9}$/.test(mobile) ? await rpc("get_user", { mobile, role: "expert" }) : null;
    const valid = await verifyPassword(input.password, user?.password_hash);
    const expert = role === "expert" && user ? await getExpert(mobile) : null;
    if (!user || !valid || (role === "expert" && expert?.status !== "active")) fail(401, role === "admin" ? "نام کاربری یا رمز عبور صحیح نیست." : "شماره موبایل یا رمز عبور صحیح نیست، یا حساب غیرفعال است.");
    const token = randomBytes(32).toString("base64url");
    await rpc("issue_session", { tokenHash: tokenHash(token), mobile, role, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return { token, user: { mobile, role, name: user.name, ...(expert ? { expert } : {}) } };
  }
  async function session(token, role) {
    if (!token || token.length > 100) return null;
    return rpc("session", { tokenHash: tokenHash(token), role, now: Date.now() });
  }
  async function logout(token) { if (token) await rpc("logout", { tokenHash: tokenHash(token) }); }
  async function saveExpert(input, existingMobile = "") {
    const mobile = mobileOf(input.mobile), name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^09\d{9}$/.test(mobile) || name.length < 3 || name.length > 80) fail(400, "نام کامل و شماره موبایل معتبر وارد کنید.");
    if (existingMobile && mobile !== existingMobile) fail(400, "شمارهٔ شناسهٔ کارشناس قابل تغییر نیست.");
    const previous = await getExpert(mobile);
    if (existingMobile && !previous) fail(404, "کارشناس پیدا نشد.");
    if (!existingMobile && previous) fail(409, "کارشناسی با این شماره وجود دارد.");
    const nationalCode = D.latin(input.nationalCode || "").trim();
    if (nationalCode && !/^\d{10}$/.test(nationalCode)) fail(400, "کد ملی باید ۱۰ رقم باشد.");
    const fields = {};
    for (const key of ["city", "specialty", "email", "address"]) {
      if (typeof input[key] !== "string" || input[key].length > (key === "address" ? 250 : 80)) fail(400, "اطلاعات کارشناس معتبر نیست.");
      fields[key] = input[key].trim();
    }
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) fail(400, "ایمیل معتبر وارد کنید.");
    if (!["active", "inactive"].includes(input.status)) fail(400, "وضعیت کارشناس معتبر نیست.");
    if (!previous?.hasLogin && !input.password) fail(400, "برای ایجاد دسترسی کارشناس، رمز عبور تعیین کنید.");
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    return rpc("save_expert", { mobile, name, ...fields, nationalCode, status: input.status, passwordHash });
  }
  async function saveInspection(input, owner) {
    const clean = cleanInput(input), expert = await getExpert(owner);
    if (!expert || expert.status !== "active") fail(403, "حساب کارشناس فعال نیست.");
    if (input.ownerMobile && input.ownerMobile !== owner) fail(403, "مالک پرونده قابل تغییر نیست.");
    const created = typeof input.createdAt === "string" && Number.isFinite(Date.parse(input.createdAt)) ? new Date(input.createdAt).toISOString() : now();
    clean.vehicle.inspector = expert.name;
    clean.vehicle.date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(created));
    return rpc("save_inspection", { record: clean, ownerMobile: owner, version: Number.isInteger(input.version) ? input.version : 0, createdAt: created, metadata: clean.provenance === "user_description" ? { provenance: clean.provenance, additionalNotes: clean.additionalNotes, sourceHistory: clean.sourceHistory } : {} });
  }
  async function listInspections(owner = "", includeDrafts = false) { return rpc("inspections", { owner, includeDrafts }); }
  async function overview() { return rpc("overview"); }
  async function importMcp(value, defaultInspector = "") {
    if (!value || typeof value !== "object" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.id || "") || !Number.isSafeInteger(value.revision) || value.revision < 1) fail(400, "گزارش MCP معتبر نیست.");
    const inspectorName = String(value.vehicle?.inspector || defaultInspector || "").slice(0, 80).trim();
    if (!inspectorName) fail(409, "کارشناس پیش‌فرض برای گزارش MCP مشخص نشده است.");
    const experts = await rpc("experts");
    const matches = experts.filter(expert => expert.status === "active" && D.normal(expert.name) === D.normal(inspectorName));
    if (!matches.length) fail(409, `کارشناس فعال «${inspectorName}» در پنل مدیریت پیدا نشد؛ ابتدا او را در پنل ثبت کنید.`);
    if (matches.length > 1) fail(409, `چند کارشناس فعال با نام «${inspectorName}» وجود دارد؛ نام یکتا لازم است.`);
    const clean = cleanInput({ ...value, ownerMobile: matches[0].mobile, version: 0, step: value.step || "body", provenance: "user_description" });
    return rpc("mcp_import", { ownerMobile: matches[0].mobile, inspectorName, incomingRevision: value.revision, record: clean, createdAt: value.createdAt, updatedAt: value.updatedAt,
      source: { provenance: "user_description", additionalNotes: Array.isArray(value.additionalNotes) ? value.additionalNotes.filter(x => typeof x === "string").slice(0, 20).map(x => x.slice(0, 500)) : [], sourceHistory: Array.isArray(value.sourceHistory) ? value.sourceHistory.slice(0, 100).filter(x => typeof x?.text === "string").map(x => ({ text: x.text.slice(0, 6000), recordedAt: typeof x.recordedAt === "string" ? x.recordedAt.slice(0, 40) : "" })) : [] } });
  }
  async function importLegacy(input, actor, onlyOwner = "") {
    if (!Array.isArray(input.inspections) || input.inspections.length > 5000) fail(400, "دادهٔ انتقال معتبر نیست.");
    const profiles = Array.isArray(input.profiles) ? input.profiles.filter(p => p && p.demo !== true).map(D.cleanProfile).filter(Boolean) : [];
    let skipped = 0;
    const inspections = [];
    for (const value of input.inspections) {
      if (!value || value.demo === true || String(value.id).startsWith("demo-") || !/^09\d{9}$/.test(value.ownerMobile) || (onlyOwner && value.ownerMobile !== onlyOwner)) { skipped++; continue; }
      try { inspections.push({ record: cleanInput(value), ownerMobile: value.ownerMobile, createdAt: value.createdAt, updatedAt: value.updatedAt }); } catch (_) { skipped++; }
    }
    const result = await rpc("import_legacy", { profiles, inspections, actor, onlyOwner });
    return { imported: result.imported, skipped: result.skipped + skipped };
  }
  return { login, session, logout, saveExpert, getExpert, saveInspection, listInspections, importLegacy, importMcp, overview };
}
module.exports = { createPostgrestStore };
