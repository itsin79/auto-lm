"use strict";
const { DatabaseSync } = require("node:sqlite");
const { randomBytes, createHash, scrypt: scryptCallback, scryptSync, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../admin/domain.js");
const { ApiError } = require("./errors.js");
const scrypt = promisify(scryptCallback);
const fail = (status, message) => { throw new ApiError(status, message); };
const now = () => new Date().toISOString();
const tehranDate = value => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const mobileOf = value => D.latin(value).trim();
function passwordCheck(value, minimumLength = 10) {
  if (typeof value !== "string" || value.length < minimumLength || value.length > 128) fail(400, `رمز عبور باید بین ${minimumLength} و ۱۲۸ نویسه باشد.`);
}
async function hashPassword(value, minimumLength = 10) {
  passwordCheck(value, minimumLength);
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(value, salt, 64)).toString("hex")}`;
}
async function verifyPassword(value, encoded) {
  const [salt, hash] = (encoded || "00000000000000000000000000000000:" + "0".repeat(128)).split(":");
  const result = await scrypt(typeof value === "string" && value.length <= 128 ? value : "", salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === result.length && timingSafeEqual(result, expected);
}
function createStore(filename, options = {}) {
  const minimumPasswordLength = options.minimumPasswordLength === 9 ? 9 : 10;
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      mobile TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','expert')), name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(mobile,role)
    );
    CREATE TABLE IF NOT EXISTS experts (
      mobile TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
      specialty TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('active','inactive')),
      national_code TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', joined_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY, owner_mobile TEXT NOT NULL REFERENCES experts(mobile),
      vehicle_json TEXT NOT NULL, items_json TEXT NOT NULL, step TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      imported INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS inspections_owner ON inspections(owner_mobile,created_at);
    CREATE TABLE IF NOT EXISTS inspection_report_sources (
      inspection_id TEXT PRIMARY KEY REFERENCES inspections(id) ON DELETE CASCADE,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, mobile TEXT NOT NULL, role TEXT NOT NULL, expires_at INTEGER NOT NULL,
      FOREIGN KEY(mobile,role) REFERENCES users(mobile,role) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, inspection_id TEXT REFERENCES inspections(id), actor TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL, occurred_at TEXT NOT NULL
    );`);
  if (!db.prepare("PRAGMA table_info(inspections)").all().some(column => column.name === "metadata_json")) db.exec("ALTER TABLE inspections ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  db.exec("PRAGMA user_version=2");
  const transaction = callback => { db.exec("BEGIN IMMEDIATE"); try { const result = callback(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } };
  transaction(() => {
    // Replace any first-run admin account with the requested fixed local admin login.
    db.prepare("DELETE FROM sessions WHERE role='admin' AND mobile<>'admin'").run();
    db.prepare("DELETE FROM users WHERE role='admin' AND mobile<>'admin'").run();
    const salt = randomBytes(16).toString("hex");
    const hash = `${salt}:${scryptSync("admin", salt, 64).toString("hex")}`;
    db.prepare(`INSERT INTO users(mobile,role,name,password_hash,created_at) VALUES('admin','admin','مدیر سامانه',?,?)
      ON CONFLICT(mobile,role) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash`).run(hash, now());
  });
  function profile(row) {
    if (!row) return null;
    return { id: row.mobile, mobile: row.mobile, code: row.code, name: row.name, city: row.city, specialty: row.specialty,
      status: row.status, nationalCode: row.national_code, email: row.email, address: row.address, joinedAt: row.joined_at,
      hasLogin: Boolean(db.prepare("SELECT 1 FROM users WHERE mobile=? AND role='expert'").get(row.mobile)) };
  }
  const getExpert = mobile => profile(db.prepare("SELECT * FROM experts WHERE mobile=?").get(mobile));
  function audit(id, actor, action, detail) { db.prepare("INSERT INTO audit(inspection_id,actor,action,detail,occurred_at) VALUES(?,?,?,?,?)").run(id, actor, action, JSON.stringify(detail), now()); }
  function inspection(row, includeDrafts = false) {
    const expert = getExpert(row.owner_mobile);
    const items = JSON.parse(row.items_json);
    if (!includeDrafts) Object.values(items).forEach(item => { delete item.noteDraft; });
    const source = db.prepare("SELECT metadata_json FROM inspection_report_sources WHERE inspection_id=?").get(row.id);
    return { ...(source ? JSON.parse(source.metadata_json) : {}), schemaVersion: 2, id: row.id, ownerMobile: row.owner_mobile,
      vehicle: { ...JSON.parse(row.vehicle_json), inspector: expert?.name || "" }, items, step: row.step,
      createdAt: row.created_at, updatedAt: row.updated_at, version: row.version, imported: Boolean(row.imported),
      complete: D.status({ items }) === "complete",
      ...JSON.parse(row.metadata_json),
      history: db.prepare("SELECT action,detail,occurred_at FROM audit WHERE inspection_id=? ORDER BY id").all(row.id).map(event => ({ action: event.action, detail: JSON.parse(event.detail), at: event.occurred_at })) };
  }
  function issueSession(mobile, role) {
    const token = randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    db.prepare("INSERT INTO sessions(token_hash,mobile,role,expires_at) VALUES(?,?,?,?)").run(createHash("sha256").update(token).digest("hex"), mobile, role, Date.now() + 12 * 60 * 60 * 1000);
    return token;
  }
  function session(token, role) {
    if (!token || token.length > 100) return null;
    const row = db.prepare("SELECT s.mobile,s.role,u.name FROM sessions s JOIN users u ON u.mobile=s.mobile AND u.role=s.role WHERE s.token_hash=? AND s.role=? AND s.expires_at>?").get(createHash("sha256").update(token).digest("hex"), role, Date.now());
    if (!row) return null;
    const expert = role === "expert" ? getExpert(row.mobile) : null;
    if (role === "expert" && expert?.status !== "active") return null;
    return { mobile: row.mobile, role: row.role, name: row.name, ...(expert ? { expert } : {}) };
  }
  async function login(input) {
    const role = input.role === "expert" ? "expert" : input.role === "admin" ? "admin" : null;
    const mobile = role === "admin" ? "admin" : mobileOf(input.mobile);
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const user = role === "admin"
      ? username === "admin" ? db.prepare("SELECT * FROM users WHERE mobile='admin' AND role='admin'").get() : null
      : role === "expert" && /^09\d{9}$/.test(mobile) ? db.prepare("SELECT * FROM users WHERE mobile=? AND role='expert'").get(mobile) : null;
    const valid = await verifyPassword(input.password, user?.password_hash);
    if (!user || !valid || (role === "expert" && getExpert(mobile)?.status !== "active")) fail(401, role === "admin" ? "نام کاربری یا رمز عبور صحیح نیست." : "شماره موبایل یا رمز عبور صحیح نیست، یا حساب غیرفعال است.");
    return { token: issueSession(mobile, role), user: { mobile, role, name: user.name, ...(role === "expert" ? { expert: getExpert(mobile) } : {}) } };
  }
  function logout(token) { if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(createHash("sha256").update(token).digest("hex")); }
  async function saveExpert(input, existingMobile = "") {
    const mobile = mobileOf(input.mobile), name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^09\d{9}$/.test(mobile) || name.length < 3 || name.length > 80) fail(400, "نام کامل و شماره موبایل معتبر وارد کنید.");
    if (existingMobile && mobile !== existingMobile) fail(400, "شمارهٔ شناسهٔ کارشناس قابل تغییر نیست.");
    const previous = getExpert(mobile);
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
    const hash = input.password ? await hashPassword(input.password, minimumPasswordLength) : null;
    transaction(() => {
      if (!existingMobile && getExpert(mobile)) fail(409, "کارشناسی با این شماره وجود دارد.");
      db.prepare(`INSERT INTO experts(mobile,code,name,city,specialty,status,national_code,email,address,joined_at) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(mobile) DO UPDATE SET name=excluded.name,city=excluded.city,specialty=excluded.specialty,status=excluded.status,national_code=excluded.national_code,email=excluded.email,address=excluded.address`).run(mobile, previous?.code || `EX-${mobile}`, name, fields.city, fields.specialty, input.status, nationalCode, fields.email, fields.address, previous?.joinedAt || now());
      if (hash) db.prepare(`INSERT INTO users(mobile,role,name,password_hash,created_at) VALUES(?,'expert',?,?,?) ON CONFLICT(mobile,role) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash`).run(mobile, name, hash, now());
      else db.prepare("UPDATE users SET name=? WHERE mobile=? AND role='expert'").run(name, mobile);
      if (hash || input.status === "inactive") db.prepare("DELETE FROM sessions WHERE mobile=? AND role='expert'").run(mobile);
    });
    return getExpert(mobile);
  }
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
  function metadata(record) {
    return JSON.stringify(record.provenance === "user_description" ? { provenance: record.provenance, additionalNotes: record.additionalNotes, sourceHistory: record.sourceHistory } : {});
  }
  function saveInspection(input, owner) {
    const clean = cleanInput(input), expert = getExpert(owner);
    if (!expert || expert.status !== "active") fail(403, "حساب کارشناس فعال نیست.");
    return transaction(() => {
      const previous = db.prepare("SELECT * FROM inspections WHERE id=?").get(clean.id);
      if (previous && previous.owner_mobile !== owner) fail(403, "این پرونده متعلق به شما نیست.");
      if ((previous?.version || 0) !== (input.version || 0)) fail(409, "این پرونده در صفحهٔ دیگری تغییر کرده است. پیش از ادامه، نسخهٔ جدید را دریافت کنید.");
      if (input.ownerMobile && input.ownerMobile !== owner) fail(403, "مالک پرونده قابل تغییر نیست.");
      const created = previous?.created_at || now(), updated = now();
      clean.vehicle.inspector = expert.name;
      clean.vehicle.date = tehranDate(created);
      const version = (previous?.version || 0) + 1;
      db.prepare(`INSERT INTO inspections(id,owner_mobile,vehicle_json,items_json,step,created_at,updated_at,version,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET vehicle_json=excluded.vehicle_json,items_json=excluded.items_json,step=excluded.step,updated_at=excluded.updated_at,version=excluded.version,metadata_json=excluded.metadata_json`).run(clean.id, owner, JSON.stringify(clean.vehicle), JSON.stringify(clean.items), clean.step, created, updated, version, metadata(clean));
      if (clean.provenance === "user_description") {
        db.prepare("INSERT INTO inspection_report_sources(inspection_id,metadata_json) VALUES(?,?) ON CONFLICT(inspection_id) DO UPDATE SET metadata_json=excluded.metadata_json")
          .run(clean.id, JSON.stringify({ provenance: clean.provenance, additionalNotes: clean.additionalNotes, sourceHistory: clean.sourceHistory }));
      }
      const currentStatus = D.status(clean), oldStatus = previous ? D.status({ items: JSON.parse(previous.items_json) }) : null;
      if (!previous) audit(clean.id, owner, "created", { status: currentStatus });
      else if (oldStatus !== currentStatus) audit(clean.id, owner, "status_changed", { from: oldStatus, to: currentStatus });
      return inspection(db.prepare("SELECT * FROM inspections WHERE id=?").get(clean.id), true);
    });
  }
  function listInspections(owner = "", includeDrafts = false) {
    const rows = owner ? db.prepare("SELECT * FROM inspections WHERE owner_mobile=? ORDER BY created_at DESC").all(owner) : db.prepare("SELECT * FROM inspections ORDER BY created_at DESC").all();
    return rows.map(row => inspection(row, includeDrafts));
  }
  function importMcp(value, defaultInspector = "") {
    if (!value || typeof value !== "object" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.id || "") || !Number.isSafeInteger(value.revision) || value.revision < 1) fail(400, "گزارش MCP معتبر نیست.");
    const inspectorName = String(value.vehicle?.inspector || defaultInspector || "").slice(0, 80).trim();
    if (!inspectorName) fail(409, "کارشناس پیش‌فرض برای گزارش MCP مشخص نشده است.");
    const matches = db.prepare("SELECT mobile,name FROM experts WHERE status='active'").all().filter(expert => D.normal(expert.name) === D.normal(inspectorName));
    if (!matches.length) fail(409, `کارشناس فعال «${inspectorName}» در پنل مدیریت پیدا نشد؛ ابتدا او را در پنل ثبت کنید.`);
    if (matches.length > 1) fail(409, `چند کارشناس فعال با نام «${inspectorName}» وجود دارد؛ نام یکتا لازم است.`);
    const owner = matches[0].mobile;
    const input = { ...value, ownerMobile: owner, version: 0, step: value.step || "body", provenance: "user_description" };
    const clean = cleanInput(input);
    clean.vehicle.inspector = inspectorName;
    const incomingRevision = value.revision;
    const additionalNotes = Array.isArray(value.additionalNotes) ? value.additionalNotes.filter(note => typeof note === "string").slice(0, 20).map(note => note.slice(0, 500)) : [];
    const sourceHistory = Array.isArray(value.sourceHistory) ? value.sourceHistory.slice(0, 100).filter(event => typeof event?.text === "string").map(event => ({ text: event.text.slice(0, 6000), recordedAt: typeof event.recordedAt === "string" ? event.recordedAt.slice(0, 40) : "" })) : [];
    const source = JSON.stringify({ provenance: "user_description", additionalNotes, sourceHistory });
    const created = typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) ? new Date(value.createdAt).toISOString() : now();
    const updated = typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : created;
    return transaction(() => {
      const previous = db.prepare("SELECT * FROM inspections WHERE id=?").get(clean.id);
      if (previous) {
        const previousMeta = JSON.parse(previous.metadata_json || "{}");
        if (!previousMeta.mcpSource) fail(409, "شناسهٔ پرونده در پنل برای پرونده‌ای دیگر استفاده شده است.");
        if (previousMeta.mcpRevision >= incomingRevision) return inspection(previous);
        const version = previous.version + 1;
        db.prepare("UPDATE inspections SET owner_mobile=?,vehicle_json=?,items_json=?,step=?,updated_at=?,version=?,metadata_json=? WHERE id=?")
          .run(owner, JSON.stringify(clean.vehicle), JSON.stringify(clean.items), clean.step, updated, version, JSON.stringify({ mcpSource: true, mcpRevision: incomingRevision }), clean.id);
        db.prepare("INSERT INTO inspection_report_sources(inspection_id,metadata_json) VALUES(?,?) ON CONFLICT(inspection_id) DO UPDATE SET metadata_json=excluded.metadata_json").run(clean.id, source);
        audit(clean.id, "auto-lm-mcp", "mcp_updated", { revision: incomingRevision, inspector: inspectorName });
        return inspection(db.prepare("SELECT * FROM inspections WHERE id=?").get(clean.id));
      }
      db.prepare("INSERT INTO inspections(id,owner_mobile,vehicle_json,items_json,step,created_at,updated_at,version,imported,metadata_json) VALUES(?,?,?,?,?,?,?,1,1,?)")
        .run(clean.id, owner, JSON.stringify(clean.vehicle), JSON.stringify(clean.items), clean.step, created, updated, JSON.stringify({ mcpSource: true, mcpRevision: incomingRevision }));
      db.prepare("INSERT INTO inspection_report_sources(inspection_id,metadata_json) VALUES(?,?)").run(clean.id, source);
      audit(clean.id, "auto-lm-mcp", "mcp_imported", { revision: incomingRevision, inspector: inspectorName });
      return inspection(db.prepare("SELECT * FROM inspections WHERE id=?").get(clean.id));
    });
  }
  function importLegacy(input, actor, onlyOwner = "") {
    if (!Array.isArray(input.inspections) || input.inspections.length > 5000) fail(400, "دادهٔ انتقال معتبر نیست.");
    const profiles = Array.isArray(input.profiles) ? input.profiles.filter(p => p && p.demo !== true) : [];
    let imported = 0, skipped = 0;
    transaction(() => {
      if (!onlyOwner) for (const p of profiles) {
        if (!/^09\d{9}$/.test(p.mobile) || getExpert(p.mobile)) continue;
        const clean = D.cleanProfile(p);
        if (!clean) continue;
        db.prepare("INSERT INTO experts(mobile,code,name,city,specialty,status,national_code,email,address,joined_at) VALUES(?,?,?,?,?,'inactive',?,?,?,?)").run(clean.mobile, `EX-${clean.mobile}`, clean.name, clean.city, clean.specialty, clean.nationalCode, clean.email, clean.address, now());
      }
      for (const value of input.inspections) {
        if (!value || value.demo === true || String(value.id).startsWith("demo-") || !/^09\d{9}$/.test(value.ownerMobile) || (onlyOwner && value.ownerMobile !== onlyOwner)) { skipped++; continue; }
        let clean;
        try { clean = cleanInput(value); } catch (_) { skipped++; continue; }
        if (db.prepare("SELECT 1 FROM inspections WHERE id=?").get(clean.id)) { skipped++; continue; }
        const mobile = value.ownerMobile;
        if (!getExpert(mobile)) {
          const p = profiles.find(person => person.mobile === mobile);
          // Legacy app names were hard-coded. Only explicit non-demo admin profiles are trusted for names.
          const name = typeof p?.name === "string" ? p.name.slice(0, 80).trim() : "";
          db.prepare("INSERT INTO experts(mobile,code,name,status,joined_at) VALUES(?,?,?,'inactive',?)").run(mobile, `EX-${mobile}`, name, now());
        }
        const created = typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) ? new Date(value.createdAt).toISOString() : now();
        const updated = typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : created;
        db.prepare("INSERT INTO inspections(id,owner_mobile,vehicle_json,items_json,step,created_at,updated_at,imported,metadata_json) VALUES(?,?,?,?,?,?,?,1,?)").run(clean.id, mobile, JSON.stringify(clean.vehicle), JSON.stringify(clean.items), clean.step, created, updated, metadata(clean));
        audit(clean.id, actor, "imported", { source: "legacy_browser", status: D.status(clean) }); imported++;
      }
    });
    return { imported, skipped };
  }
  function overview() { return { experts: db.prepare("SELECT * FROM experts ORDER BY joined_at,mobile").all().map(profile), cases: listInspections() }; }
  return { db, close: () => db.close(), login, session, logout, saveExpert, getExpert, saveInspection, listInspections, importLegacy, importMcp, overview };
}
module.exports = { createStore, ApiError };
