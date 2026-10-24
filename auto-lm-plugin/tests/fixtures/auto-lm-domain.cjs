/* Shared inspection contract used by the API, administration panel and reports. */
(function (root) {
  "use strict";
  const DATABASE_KEY = "carcheck_inspections_v2";
  const PROFILES_KEY = "carcheck_admin_profiles_v1";
  const categories = [
    { id: "body", name: "بدنه", weight: .30, items: [["paint", "وضعیت رنگ بدنه"], ["scratches", "خط و خش بدنه"], ["dents", "فرورفتگی و آسیب ظاهری"], ["chassis", "وضعیت شاسی و ستون‌ها"]] },
    { id: "engine", name: "موتور", weight: .35, items: [["performance", "عملکرد موتور"], ["noise", "صدای غیرعادی موتور"], ["leaks", "نشتی روغن و مایعات"], ["exhaust", "دود و وضعیت اگزوز"]] },
    { id: "interior", name: "داخل کابین", weight: .20, items: [["dashboard", "وضعیت داشبورد و کنسول"], ["seats", "سلامت صندلی‌ها و روکش"], ["climate", "عملکرد کولر و سیستم تهویه"], ["electronics", "تجهیزات برقی و نمایشگرها"]] },
    { id: "tires", name: "لاستیک‌ها", weight: .15, items: [["front", "وضعیت لاستیک‌های جلو"], ["rear", "وضعیت لاستیک‌های عقب"], ["rims", "سلامت رینگ‌ها"], ["spare", "وضعیت لاستیک زاپاس"]] }
  ];
  const conditions = { healthy: { label: "سالم", points: 100 }, review: { label: "نیاز به بررسی", points: 50 }, faulty: { label: "معیوب", points: 0 } };
  const itemKeys = categories.flatMap(c => c.items.map(([key]) => `${c.id}.${key}`));
  const digits = value => String(value ?? "").replace(/[0-9]/g, n => "۰۱۲۳۴۵۶۷۸۹"[n]);
  const latin = value => String(value ?? "").replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632));
  const normal = value => latin(value).normalize("NFKC").toLocaleLowerCase("fa").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\p{M}\p{P}\p{Z}\p{Cf}\sـ]/gu, "");
  const text = (value, length = 250) => typeof value === "string" ? value.slice(0, length) : "";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const number = value => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value);
  function date(value, withTime = false) {
    const parsed = new Date(value);
    if (!value || !Number.isFinite(parsed.getTime())) return "—";
    return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(parsed);
  }
  function cleanRecord(value, demo = false) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) return null;
    const vehicle = {};
    for (const key of ["model", "year", "mileage", "plate", "inspector", "date", "color", "vin"]) vehicle[key] = text(value.vehicle?.[key]);
    const items = {};
    itemKeys.forEach(key => {
      const item = value.items?.[key];
      items[key] = { condition: Object.hasOwn(conditions, item?.condition) ? item.condition : null, note: text(item?.note) };
    });
    const provenance = value.provenance === "user_description" ? "user_description" : null;
    const additionalNotes = provenance && Array.isArray(value.additionalNotes) ? value.additionalNotes.filter(n => typeof n === "string").slice(0, 20).map(n => text(n, 500)) : [];
    const sourceHistory = provenance && Array.isArray(value.sourceHistory) ? value.sourceHistory.slice(0, 100).filter(h => typeof h?.text === "string").map(h => ({ text: text(h.text, 6000), recordedAt: text(h.recordedAt, 40) })) : [];
    return { id: text(value.id, 80), ownerMobile: /^09\d{9}$/.test(value.ownerMobile) ? value.ownerMobile : "", createdAt: text(value.createdAt, 40), updatedAt: text(value.updatedAt, 40), vehicle, items, demo, provenance, additionalNotes, sourceHistory };
  }
  function progress(record) { return itemKeys.filter(key => record.items[key]?.condition).length; }
  function status(record) { const count = progress(record); return count === 16 ? "complete" : count ? "progress" : "draft"; }
  function categoryScore(category, record) {
    const values = category.items.map(([key]) => conditions[record.items[`${category.id}.${key}`]?.condition]?.points);
    return values.some(value => value === undefined) ? null : values.reduce((a, b) => a + b, 0) / values.length;
  }
  function score(record) {
    if (status(record) !== "complete") return null;
    return Math.round(categories.reduce((sum, category) => sum + categoryScore(category, record) * category.weight, 0) * 10) / 10;
  }
  function structural(record) {
    const condition = record.items["body.chassis"]?.condition;
    return condition === "faulty" ? { tone: "faulty", title: "یافتهٔ ساختاری با اولویت بالا", description: "شاسی و ستون‌ها معیوب ثبت شده‌اند. این یافته مستقل از امتیاز کل است و به بازبینی حضوری متخصص بدنه و ساختار خودرو نیاز دارد." }
      : condition === "review" ? { tone: "review", title: "ساختار بدنه نیازمند بررسی است", description: "برای شاسی و ستون‌ها بررسی بیشتر ثبت شده است. امتیاز کل به‌تنهایی نتیجهٔ این بررسی را نشان نمی‌دهد." } : null;
  }
  function tone(record) {
    const risk = structural(record), value = score(record);
    if (risk?.tone === "faulty" || (value !== null && value < 50)) return "faulty";
    return risk?.tone || (value === null ? "neutral" : value >= 75 ? "healthy" : "review");
  }
  function interpretation(record) {
    const risk = structural(record), value = score(record);
    if (risk?.tone === "faulty") return risk.title;
    if (value !== null && value < 50) return risk ? "وضعیت ضعیف؛ بررسی ساختار هم لازم است" : "وضعیت ضعیف";
    if (risk) return risk.title;
    return value === null ? "کارشناسی تکمیل نشده" : value >= 90 ? "وضعیت عالی" : value >= 75 ? "وضعیت خوب" : value >= 50 ? "نیازمند بررسی" : "وضعیت ضعیف";
  }
  function caseCode(record) { return `LM-${record.id.startsWith("demo-") ? record.id.slice(5) : record.id.slice(-8).toUpperCase()}`; }
  function cleanProfile(value) {
    if (!value || !/^09\d{9}$/.test(value.mobile) || !text(value.name, 80).trim()) return null;
    const result = { id: value.mobile, mobile: value.mobile, demo: value.demo === true, status: value.status === "inactive" ? "inactive" : "active" };
    for (const key of ["name", "code", "city", "specialty", "nationalCode", "email", "address", "joinedAt"]) result[key] = text(value[key], key === "address" ? 250 : 80);
    return result;
  }
  function matches(values, query) { const words = String(query).trim().split(/\s+/).map(normal).filter(Boolean); const target = values.map(normal).join(" "); return words.every(word => target.includes(word)); }
  const api = { DATABASE_KEY, PROFILES_KEY, categories, conditions, itemKeys, digits, latin, normal, escape, number, date, cleanRecord, progress, status, categoryScore, score, structural, tone, interpretation, caseCode, cleanProfile, matches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AdminDomain = api;
})(typeof window !== "undefined" ? window : globalThis);
