"use strict";
const D = window.AdminDomain;
const app = document.getElementById("admin-app");
const dialog = document.getElementById("expert-dialog");
const API = window.AutoLMApi;
const e = D.escape;
const icons = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  folder: '<path d="M3 7V5.5A2.5 2.5 0 0 1 5.5 3H10l2.4 3H18.5A2.5 2.5 0 0 1 21 8.5V9"/><path d="M3 9h18l-1.7 9.3a2 2 0 0 1-2 1.7H5.1a2 2 0 0 1-2-1.7L2 12a2.5 2.5 0 0 1 1-3Z"/>',
  file: '<path d="M13.5 2.5H6A2 2 0 0 0 4 4.5v15A2 2 0 0 0 6 21.5h12a2 2 0 0 0 2-2V9Z"/><path d="M13 3v6h6M8 13h8m-8 4h6"/>',
  car: '<path d="m5 7 2-4h10l2 4 2 3v8H3v-8l2-3Zm-2 4h18M7 18v3m10-3v3M5 7h14"/><path d="M6 14h2m8 0h2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7.8 12.2 2.8 2.8 5.8-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/><path d="M12 3v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="m16 3 5 5M4 15 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-6 1 1-6Z"/>',
  logout: '<path d="M9 4H4v16h5m6-4 4-4-4-4m-8 4h12"/>',
  link: '<path d="M14 3h7v7m0-7L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  phone: '<path d="M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z"/>',
  print: '<path d="M6 8V2h12v6M6 18H3V9h18v9h-3M6 14h12v8H6z"/>',
  engine: '<path d="M7 4h7m-3 0v3M4 10H2m0-3v10m2-3v-4h3l2-3h7l3 4h3v7h-3l-2 3H8l-4-4Z"/>',
  body: '<path d="m3 13 3-7h11l4 7v5H3v-5Zm0 0h18M7 6l1 7m8-7-1 7M6 18v3m12-3v3"/>',
  interior: '<path d="M6 3H4v9a5 5 0 0 0 5 5h10v-4h-8a2 2 0 0 1-2-2V5a3 3 0 0 0-3-2ZM7 17l-1 4m10-4 1 4"/>',
  tires: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 7v10M7 12h10"/>'
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.file}</svg>`; }
const statusLabels = { complete: "تکمیل‌شده", progress: "در حال کارشناسی", draft: "پیش‌نویس", active: "فعال", inactive: "غیرفعال" };
function pill(kind, label = statusLabels[kind]) { return `<span class="pill pill-${kind}"><i class="pill-dot" aria-hidden="true"></i>${e(label)}</span>`; }
let session = null;
let localLoginHints = null;
let data = { experts: [], cases: [] };
let loading = true, backendError = "", toastTimer;
let lastPayload = "", refreshRunning = false;
let focusAfterRender = false;
let focusTabAfterRender = false;
const filters = {
  experts: { query: "", status: "all", city: "all", page: 1, pageSize: 10 },
  cases: { query: "", status: "all", expert: "all", sort: "newest", page: 1, pageSize: 10 },
  assigned: { query: "", status: "all", sort: "newest", page: 1, pageSize: 10 }
};
const selectedRows = { experts: new Set(), cases: new Set(), assigned: new Set() };
const SIDEBAR_KEY = "autolm_admin_sidebar_collapsed_v1";
let sidebarCollapsed = false;
try { sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "true"; } catch (_) { /* The control still works without storage. */ }
function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  const toggle = app.querySelector('[data-action="sidebar-toggle"]');
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
    toggle.setAttribute("aria-label", sidebarCollapsed ? "باز کردن سایدبار" : "جمع کردن سایدبار");
    toggle.title = sidebarCollapsed ? "باز کردن سایدبار" : "جمع کردن سایدبار";
  }
}
function hasFilters(scope) {
  return Object.entries(filters[scope]).some(([key, value]) => key === "query" ? Boolean(value) : ["page", "pageSize"].includes(key) ? false : key === "sort" ? value !== "newest" : value !== "all");
}
function notify(message) {
  const toast = document.getElementById("admin-toast");
  clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}
function findExpert(mobile) { return data.experts.find(expert => expert.mobile === mobile); }
function expertCases(mobile) { return data.cases.filter(record => record.ownerMobile === mobile); }
function expertName(record) { return findExpert(record.ownerMobile)?.name || "نام کارشناس ثبت نشده"; }
function path(type, id = "", tab = "", from = "") {
  return `#${type}${id ? `/${encodeURIComponent(id)}` : ""}${tab ? `/${tab}` : ""}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
}
function route() {
  try {
    const [raw = "", query = ""] = location.hash.slice(1).split("?");
    const [type = "experts", encodedId = "", tab = ""] = raw.split("/");
    return { type: type || "experts", id: decodeURIComponent(encodedId), tab, from: new URLSearchParams(query).get("from") || "" };
  } catch (_) { return { type: "invalid", id: "", tab: "", from: "" }; }
}
function navTo(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}
function loginView() {
  const hint = localLoginHints ? `<div class="demo-note" role="note"><strong>ورود محلی مدیر</strong><br>نام کاربری: <bdi dir="ltr">${e(localLoginHints.username)}</bdi><br>رمز عبور: <bdi dir="ltr">${e(localLoginHints.password)}</bdi></div>` : "";
  return `<div class="login-page"><aside class="login-aside"><a href="/" class="login-brand"><img src="/assets/auto-ml-logo.png" width="64" height="64" alt="اتو ال‌ام"><div><strong>اتو ال‌ام</strong><small>سامانه کارشناسی خودرو</small></div></a><div class="login-message"><span class="kicker">${icon("shield")} پنل مدیریت</span><h2>هر کارشناس، هر پرونده،<br>همه‌چیز در یک نگاه.</h2><p>اطلاعات کارشناسان و پرونده‌های ثبت‌شده در اپ را مدیریت کنید و گزارش هر خودرو را دریافت کنید.</p><div class="login-features"><div class="login-feature"><span class="feature-icon">${icon("users")}</span>مدیریت کارشناسان و اطلاعات فردی</div><div class="login-feature"><span class="feature-icon">${icon("folder")}</span>پیگیری پرونده‌های ثبت‌شده در اپ</div><div class="login-feature"><span class="feature-icon">${icon("download")}</span>دریافت گزارش کامل خودرو</div></div></div><div class="login-aside-footer">اتو ال‌ام</div></aside><main class="login-main" id="main-content" tabindex="-1"><div class="login-form-wrap"><img src="/assets/auto-ml-logo.png" width="60" height="60" alt="اتو ال‌ام"><h1>${loading ? "در حال اتصال به سامانه…" : "ورود به پنل مدیریت"}</h1><p class="login-description">نام کاربری و رمز عبور مدیر را وارد کنید.</p>${hint}${loading ? "" : `<form id="admin-login-form" novalidate><label class="field"><span>نام کاربری</span><input class="input" name="username" id="login-username" type="text" autocomplete="username" maxlength="80" required></label><label class="field"><span>رمز عبور</span><input class="input" name="password" id="login-password" type="password" autocomplete="current-password" maxlength="128" required></label><span class="field-error" id="login-error" role="alert">${e(backendError)}</span><button class="btn btn-primary" type="submit">ورود به پنل${icon("left")}</button></form>`}<a class="login-link" href="/">اپ کارشناس ${icon("link")}</a></div></main></div>`;
}
function shell(content, r) {
  const active = r.type.startsWith("expert") ? "experts" : "cases";
  const today = new Date();
  const dateParts = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(today);
  const dateLabel = ["weekday", "day", "month", "year"].map(type => dateParts.find(part => part.type === type)?.value || "").join(" ");
  return `<aside class="sidebar" id="sidebar" aria-label="منوی اصلی"><div class="sidebar-top"><button class="sidebar-toggle" type="button" data-action="sidebar-toggle" aria-controls="sidebar-navigation" aria-expanded="${!sidebarCollapsed}" aria-label="جمع کردن سایدبار">${icon("right")}</button><button class="sidebar-mobile-close btn-square" type="button" data-action="close-menu" aria-label="بستن منو">${icon("close")}</button></div><a class="sidebar-brand" href="#experts" aria-label="اتو ال‌ام، پنل مدیریت"><img src="/assets/auto-ml-logo.png" width="48" height="48" alt=""><div><strong>اتو ال‌ام</strong><span>سامانه کارشناسی خودرو</span></div></a>
    <nav id="sidebar-navigation"><a class="nav-link" href="#experts" aria-label="کارشناسان" title="کارشناسان" ${active === "experts" ? 'aria-current="page"' : ""}>${icon("users")}<span class="nav-label">کارشناسان</span><span class="nav-count">${D.number(data.experts.length)}</span></a><a class="nav-link" href="#cases" aria-label="پرونده‌ها" title="پرونده‌ها" ${active === "cases" ? 'aria-current="page"' : ""}>${icon("folder")}<span class="nav-label">پرونده‌ها</span><span class="nav-count">${D.number(data.cases.length)}</span></a></nav>
    </aside>
    <button class="mobile-overlay" type="button" data-action="close-menu" aria-label="بستن منو"></button>
    <div class="workspace"><header class="topbar"><div class="topbar-context"><button class="btn-square menu-toggle" type="button" data-action="menu" aria-label="بازکردن منوی اصلی" aria-controls="sidebar" aria-expanded="false">${icon("menu")}</button><time class="topbar-date" datetime="${today.toISOString().slice(0, 10)}">امروز: ${dateLabel}</time></div>
    <div class="topbar-actions"><div class="user-mini"><span class="account-icon" aria-hidden="true">${icon("user")}</span><div><strong>${e(session.name || "مدیر سامانه")}</strong><small>مدیر سامانه</small></div></div><button class="btn-square logout-button" type="button" data-action="logout" aria-label="خروج از حساب" title="خروج از حساب">${icon("logout")}</button></div></header>
    <main class="main" id="main-content" tabindex="-1">${backendError ? `<div class="notice" role="alert">${icon("info")}<div><strong>دریافت اطلاعات انجام نشد</strong><p>${e(backendError)}</p></div></div>` : ""}${content}<footer class="view-footer"><span>اتو ال‌ام · مدیریت کارشناسان و پرونده‌ها</span></footer></main></div><div class="print-root" id="print-root"></div>`;
}
function breadcrumbs(items) { return `<nav class="breadcrumbs" aria-label="مسیر صفحه"><a href="#experts">پنل مدیریت</a>${items.map(([label, href]) => `${icon("left")}${href ? `<a href="${e(href)}">${e(label)}</a>` : `<span aria-current="page">${e(label)}</span>`}`).join("")}</nav>`; }
function stat(label, value, glyph, color = "") { return `<div class="surface stat"><span class="stat-icon ${color}">${icon(glyph)}</span><div><span class="stat-label">${label}</span><strong class="stat-value">${D.number(value)}</strong></div></div>`; }
function option(value, label, current) { return `<option value="${e(value)}" ${current === value ? "selected" : ""}>${e(label)}</option>`; }
function filterSelect(scope, key, label, values) { return `<label class="filter-field"><span>${e(label)}</span><select class="input" data-filter="${key}" data-scope="${scope}">${values.map(([value, title]) => option(value, title, filters[scope][key])).join("")}</select>${icon("down")}</label>`; }
function searchFilter(scope, placeholder) { return `<label class="search">${icon("search")}<input class="input" type="search" data-search="${scope}" value="${e(filters[scope].query)}" placeholder="${e(placeholder)}" aria-label="${e(placeholder)}" autocomplete="off"><button class="btn-square search-clear" type="button" data-action="clear-search" data-scope="${scope}" aria-label="پاک‌کردن جست‌وجو" ${filters[scope].query ? "" : "hidden"}>${icon("close")}</button></label>`; }

function filtersView(scope) {
  const isExperts = scope === "experts";
  const statuses = isExperts ? [["all", "همه"], ["active", "فعال"], ["inactive", "غیرفعال"]] : [["all", "همه"], ["complete", "تکمیل‌شده"], ["progress", "در حال کارشناسی"], ["draft", "پیش‌نویس"]];
  return `<div class="filters"><fieldset class="status-filters"><legend class="sr-only">فیلتر وضعیت ${isExperts ? "کارشناسان" : "پرونده‌ها"}</legend>${statuses.map(([value, label]) => `<label class="status-option"><input type="radio" name="${scope}-status" data-filter="status" data-scope="${scope}" value="${value}" ${filters[scope].status === value ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset>
    ${isExperts ? filterSelect(scope, "city", "شهر محل فعالیت", [["all", "همهٔ شهرها"], ...[...new Set(data.experts.map(p => p.city).filter(Boolean))].sort().map(city => [city, city])]) : scope === "cases" ? filterSelect(scope, "expert", "کارشناس", [["all", "همهٔ کارشناسان"], ...data.experts.map(p => [p.mobile, p.name || D.digits(p.mobile)])]) : ""}
    ${!isExperts ? filterSelect(scope, "sort", "ترتیب نمایش", [["newest", "جدیدترین"], ["oldest", "قدیمی‌ترین"]]) : ""}
    ${searchFilter(scope, isExperts ? "جست‌وجوی نام، کد یا موبایل" : "جست‌وجوی خودرو، پلاک یا کد پرونده")}
    <button class="btn btn-text reset-filter" type="button" data-action="reset-filters" data-scope="${scope}" ${hasFilters(scope) ? "" : "hidden"}>پاک‌کردن فیلترها</button></div>`;
}

function filteredExperts() {
  const f = filters.experts;
  return data.experts.filter(person => (f.status === "all" || person.status === f.status) && (f.city === "all" || person.city === f.city) && D.matches([person.name, person.mobile, person.code, person.specialty, person.city], f.query));
}
function filteredCases(scope, mobile = "") {
  const f = filters[scope];
  return data.cases.filter(record => (!mobile || record.ownerMobile === mobile) && (f.status === "all" || D.status(record) === f.status) && (!f.expert || f.expert === "all" || record.ownerMobile === f.expert) && D.matches([record.vehicle.model, record.vehicle.plate, record.ownerMobile, expertName(record), D.caseCode(record), record.id], f.query))
    .sort((a, b) => ((Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)) * (f.sort === "oldest" ? 1 : -1));
}
function scopeRows(scope) {
  if (scope === "experts") return data.experts;
  return scope === "assigned" ? expertCases(route().id) : data.cases;
}
function selection(scope) { return scopeRows(scope).filter(row => selectedRows[scope].has(row.id)); }
function tableTools(scope) {
  const count = selection(scope).length;
  return `<div class="table-tools"><button class="btn btn-text export-button" type="button" data-action="export-table" data-scope="${scope}" ${count ? "" : "disabled"}>${icon("download")}خروجی اکسل <span>(${D.number(count)})</span></button><button class="btn btn-text" type="button" data-action="clear-selection" data-scope="${scope}" ${count ? "" : "hidden"}>لغو انتخاب</button><span class="selection-hint">${count ? `${D.number(count)} ردیف انتخاب‌شده` : "ردیف‌های موردنظر را برای خروجی انتخاب کنید"}</span></div>`;
}
function rowCheck(scope, row, label) {
  return `<td class="check-cell"><input class="table-check" type="checkbox" data-row-select="${e(row.id)}" data-scope="${scope}" aria-label="انتخاب ${e(label)}" ${selectedRows[scope].has(row.id) ? "checked" : ""}></td>`;
}
function selectAll(scope) { return `<th class="check-cell" scope="col"><input class="table-check" type="checkbox" data-select-all="${scope}" aria-label="انتخاب همهٔ ردیف‌های این صفحه"></th>`; }
function syncSelectionControls() {
  for (const checkbox of app.querySelectorAll("[data-select-all]")) {
    const boxes = [...app.querySelectorAll(`[data-row-select][data-scope="${checkbox.dataset.selectAll}"]`)];
    const checked = boxes.filter(box => box.checked).length;
    checkbox.checked = boxes.length > 0 && checked === boxes.length;
    checkbox.indeterminate = checked > 0 && checked < boxes.length;
    checkbox.disabled = boxes.length === 0;
  }
}
function exportSelection(scope) {
  const rows = selection(scope);
  if (!rows.length) return;
  const experts = scope === "experts";
  const headers = experts ? ["نام کارشناس", "کد کارشناس", "شماره موبایل", "تخصص", "شهر", "تعداد پرونده", "وضعیت"] : ["کد پرونده", "خودرو", "پلاک", "کارشناس", "شماره موبایل کارشناس", "تاریخ ثبت", "وضعیت", "امتیاز از ۱۰۰"];
  const values = rows.map(row => experts
    ? [row.name, row.code, row.mobile, row.specialty, row.city, expertCases(row.mobile).length, statusLabels[row.status]]
    : [D.caseCode(row), row.vehicle.model, row.vehicle.plate, expertName(row), row.ownerMobile, D.date(row.createdAt), statusLabels[D.status(row)], D.score(row)]);
  try {
    window.AdminTableExport.download(headers, values, experts ? "کارشناسان" : "پرونده‌ها", `autolm-${experts ? "experts" : "cases"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    notify(`خروجی ${D.number(rows.length)} ردیف برای دانلود آماده شد.`);
  } catch (_) { notify("ساخت خروجی انجام نشد؛ دوباره تلاش کنید."); }
}
function pageOf(items, scope) {
  const size = filters[scope].pageSize;
  const pages = Math.max(1, Math.ceil(items.length / size));
  filters[scope].page = Math.min(Math.max(1, filters[scope].page), pages);
  return { items: items.slice((filters[scope].page - 1) * size, filters[scope].page * size), pages, current: filters[scope].page, total: items.length, size };
}
function pagination(page, scope) {
  const first = page.total ? (page.current - 1) * page.size + 1 : 0;
  const visiblePages = [...new Set([1, page.current - 1, page.current, page.current + 1, page.pages])].filter(n => n >= 1 && n <= page.pages).sort((a, b) => a - b);
  let previous = 0;
  return `<div class="table-footer"><span class="table-range" role="status" aria-live="polite">نمایش ${D.number(first)} تا ${D.number(Math.min(page.current * page.size, page.total))} از ${D.number(page.total)} مورد</span><nav class="pagination" aria-label="صفحه‌بندی جدول"><button class="page-btn" type="button" data-page="${page.current - 1}" data-scope="${scope}" aria-label="صفحه قبل" ${page.current === 1 ? "disabled" : ""}>${icon("right")}</button>${visiblePages.map(n => { const gap = n > previous + 1 ? '<span class="muted small" aria-hidden="true">…</span>' : ""; previous = n; return `${gap}<button class="page-btn" type="button" data-page="${n}" data-scope="${scope}" aria-label="صفحه ${D.number(n)}" ${n === page.current ? 'aria-current="page"' : ""}>${D.number(n)}</button>`; }).join("")}<button class="page-btn" type="button" data-page="${page.current + 1}" data-scope="${scope}" aria-label="صفحه بعد" ${page.current === page.pages ? "disabled" : ""}>${icon("left")}</button></nav><label class="page-size"><span>تعداد در صفحه</span><select class="input" data-page-size="${scope}" aria-label="تعداد ردیف در صفحه">${[10, 20, 50].map(size => option(String(size), D.number(size), String(page.size))).join("")}</select></label></div>`;
}
function empty(scope, title = "نتیجه‌ای پیدا نشد", description = "عبارت جست‌وجو یا فیلترها را تغییر دهید.") {
  const hasData = scope === "experts" ? data.experts.length > 0 : scope === "assigned" ? expertCases(route().id).length > 0 : data.cases.length > 0;
  if (!hasData) { title = scope === "experts" ? "هنوز کارشناسی ثبت نشده" : "هنوز پرونده‌ای ثبت نشده"; description = scope === "experts" ? "اولین کارشناس را اضافه کنید تا بتواند وارد اپ شود." : "پرونده‌ها پس از ثبت در اپ کارشناس، اینجا نمایش داده می‌شوند."; }
  const action = hasData ? `<button class="btn" type="button" data-action="reset-filters" data-scope="${scope}">نمایش همه</button>` : scope === "experts" ? `<button class="btn btn-primary" type="button" data-action="add-expert">${icon("plus")}افزودن کارشناس</button>` : "";
  return `<div class="empty-state"><div class="empty-icon">${icon(scope === "experts" ? "users" : "folder")}</div><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}
function expertResults() {
  const page = pageOf(filteredExperts(), "experts");
  return `${tableTools("experts")}<div class="table-scroll"><table class="data-table"><caption class="sr-only">فهرست کارشناسان</caption><thead><tr>${selectAll("experts")}<th scope="col">نام کارشناس</th><th scope="col">شماره موبایل</th><th scope="col">تخصص</th><th scope="col">شهر</th><th scope="col">پرونده‌ها</th><th scope="col">وضعیت</th><th scope="col">مشاهده</th></tr></thead><tbody>${page.total ? page.items.map(expert => `<tr data-row-link="${path("expert", expert.id, "info")}" class="${selectedRows.experts.has(expert.id) ? "is-selected" : ""}">${rowCheck("experts", expert, expert.name || expert.mobile)}<td><a class="row-link" href="${path("expert", expert.id, "info")}"><span class="identity-copy"><strong>${e(expert.name || "نام ثبت نشده")}</strong><small class="ltr">${e(expert.code)}</small></span></a></td><td><bdi class="mobile-raw">${D.digits(expert.mobile)}</bdi></td><td>${e(expert.specialty || "—")}</td><td>${e(expert.city || "—")}</td><td><a class="text-link" href="${path("expert", expert.id, "cases")}">${D.number(expertCases(expert.mobile).length)} <span class="muted small">پرونده</span></a></td><td>${pill(expert.status)}</td><td><a class="view-link" href="${path("expert", expert.id, "info")}" aria-label="مشاهدهٔ جزئیات ${e(expert.name || expert.mobile)}">مشاهده ${icon("left")}</a></td></tr>`).join("") : `<tr class="empty-table-row"><td colspan="8">${empty("experts")}</td></tr>`}</tbody></table></div>${pagination(page, "experts")}`;
}
function expertsView() {
  return `<div class="page-heading"><div><h1>کارشناسان</h1><p>کارشناسان، اطلاعات فردی و پرونده‌های آن‌ها را مدیریت کنید.</p></div><button class="btn btn-primary" type="button" data-action="add-expert">${icon("plus")}افزودن کارشناس</button></div>${breadcrumbs([["کارشناسان"]])}
    <div class="stats">${stat("همهٔ کارشناسان", data.experts.length, "users")}${stat("کارشناسان فعال", data.experts.filter(p => p.status === "active").length, "check")}${stat("کارشناسان غیرفعال", data.experts.filter(p => p.status === "inactive").length, "user", "gray")}${stat("پرونده‌های کارشناسی", data.cases.length, "folder", "blue")}</div>
    <section class="surface"><header class="panel-head"><div><div class="panel-title"><h2>فهرست کارشناسان</h2><span class="count-label">${D.number(data.experts.length)} نفر</span></div><p class="panel-subtitle">برای مشاهدهٔ اطلاعات و پرونده‌ها، کارشناس را انتخاب کنید.</p></div><span class="source-caption">${icon("info")} اطلاعات ثبت‌شده در سامانه</span></header>${filtersView("experts")}<div id="table-results">${expertResults()}</div></section>`;
}
function caseResults(scope, mobile = "") {
  const page = pageOf(filteredCases(scope, mobile), scope);
  return `${tableTools(scope)}<div class="table-scroll"><table class="data-table"><caption class="sr-only">فهرست پرونده‌های کارشناسی</caption><thead><tr>${selectAll(scope)}<th scope="col">کد پرونده</th><th scope="col">خودرو</th>${scope === "cases" ? '<th scope="col">کارشناس</th>' : ""}<th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">امتیاز</th><th scope="col">عملیات</th></tr></thead><tbody>${page.total ? page.items.map(record => `<tr data-row-link="${path("case", record.id, "status", mobile)}" class="${selectedRows[scope].has(record.id) ? "is-selected" : ""}">${rowCheck(scope, record, D.caseCode(record))}<td><a class="text-link ltr" href="${path("case", record.id, "status", mobile)}">${e(D.caseCode(record))}</a><span class="cell-secondary">ثبت‌شده در اپ</span></td><td><a class="text-link" href="${path("case", record.id, "vehicle", mobile)}">${e(record.vehicle.model || "خودرو بدون نام")}</a><span class="cell-secondary"><bdi>${e(D.digits(record.vehicle.plate || "پلاک ثبت نشده"))}</bdi></span></td>${scope === "cases" ? `<td>${findExpert(record.ownerMobile) ? `<a href="${path("expert", record.ownerMobile, "info")}">${e(expertName(record))}</a>` : e(expertName(record))}</td>` : ""}<td>${D.date(record.createdAt)}<span class="cell-secondary">${e(record.vehicle.year ? `مدل ${D.digits(record.vehicle.year)}` : "سال ثبت نشده")}</span></td><td>${pill(D.status(record))}</td><td>${D.score(record) === null ? '<span class="muted">—</span>' : `<strong class="score-cell-${D.tone(record)}">${D.number(D.score(record))}</strong><span class="muted small"> / ۱۰۰</span>`}</td><td><div class="row-actions"><a class="view-link" href="${path("case", record.id, "status", mobile)}" title="مشاهده پرونده" aria-label="مشاهده پرونده ${e(D.caseCode(record))}">مشاهده ${icon("left")}</a><button class="btn-square" type="button" data-download="${e(record.id)}" title="${D.status(record) === "complete" ? "دانلود گزارش PDF" : "گزارش پس از تکمیل کارشناسی آماده می‌شود"}" aria-label="دانلود گزارش ${e(D.caseCode(record))}" ${D.status(record) !== "complete" ? "disabled" : ""}>${icon("download")}</button></div></td></tr>`).join("") : `<tr class="empty-table-row"><td colspan="${scope === "cases" ? 8 : 7}">${empty(scope)}</td></tr>`}</tbody></table></div>${pagination(page, scope)}`;
}
function casesPanel(scope, mobile = "") { return `<section class="${scope === "cases" ? "surface" : ""}"><header class="panel-head"><div class="panel-title"><h2>${scope === "cases" ? "فهرست پرونده‌ها" : "پرونده‌های کارشناس"}</h2><span class="count-label">${D.number(mobile ? expertCases(mobile).length : data.cases.length)} پرونده</span></div><span class="source-caption">${icon("info")} پرونده را برای مشاهدهٔ جزئیات باز کنید</span></header>${filtersView(scope)}<div id="table-results">${caseResults(scope, mobile)}</div></section>`; }
function casesView() {
  return `<div class="page-heading"><div><h1>پرونده‌ها</h1><p>وضعیت کارشناسی، مشخصات خودرو و گزارش همهٔ پرونده‌ها.</p></div><a class="btn" href="/">${icon("link")}اپ کارشناس</a></div>${breadcrumbs([["پرونده‌ها"]])}<div class="stats">${stat("همهٔ پرونده‌ها", data.cases.length, "folder", "blue")}${stat("تکمیل‌شده", data.cases.filter(p => D.status(p) === "complete").length, "check")}${stat("در حال کارشناسی", data.cases.filter(p => D.status(p) === "progress").length, "clock", "amber")}${stat("پیش‌نویس", data.cases.filter(p => D.status(p) === "draft").length, "file", "gray")}</div>${casesPanel("cases")}`;
}
function info(label, value, full = false, ltr = false) { return `<div class="info-item ${full ? "full" : ""}"><dt>${label}</dt><dd>${value ? ltr ? `<bdi>${e(value)}</bdi>` : e(value) : "—"}</dd></div>`; }
function title(label, glyph) { return `<div class="section-title">${icon(glyph)}<h2>${label}</h2></div>`; }
function tabsView(items, selected) { return `<nav class="tabs" role="tablist" aria-label="بخش‌های جزئیات">${items.map(([id, label, href, glyph]) => `<a class="tab-link" id="tab-${id}" role="tab" href="${e(href)}" aria-selected="${id === selected}" aria-controls="detail-tab-panel" tabindex="${id === selected ? "0" : "-1"}">${icon(glyph)}${label}</a>`).join("")}</nav>`; }
function expertView(r) {
  const expert = findExpert(r.id);
  if (!expert) return missingView("کارشناس پیدا نشد", "experts");
  const records = expertCases(expert.mobile), completed = records.filter(record => D.status(record) === "complete").length;
  const tab = r.tab === "cases" ? "cases" : "info";
  return `${breadcrumbs([["کارشناسان", "#experts"], [expert.name]])}<div class="page-heading"><div><h1>جزئیات کارشناس</h1><p>اطلاعات فردی و پرونده‌های ${e(expert.name || "نام ثبت نشده")}</p></div><a class="btn" href="#experts">${icon("right")}بازگشت به کارشناسان</a></div>
    <section class="surface detail-banner"><div class="profile-identity"><div><div class="profile-title"><h1>${e(expert.name || "نام ثبت نشده")}</h1>${pill(expert.status)}</div><div class="profile-subtitle"><span class="ltr">${e(expert.code)}</span><span>·</span><span>${e(expert.specialty || "کارشناس خودرو")}</span></div></div></div><div class="banner-stats"><div class="banner-stat"><span>همهٔ پرونده‌ها</span><strong>${D.number(records.length)}</strong></div><div class="banner-stat"><span>تکمیل‌شده</span><strong>${D.number(completed)}</strong></div><div class="banner-stat"><span>تکمیل‌نشده</span><strong>${D.number(records.length - completed)}</strong></div></div></section>
    <section class="surface">${tabsView([["info", "اطلاعات فردی", path("expert", expert.id, "info"), "user"], ["cases", `پرونده‌ها (${D.number(records.length)})`, path("expert", expert.id, "cases"), "folder"]], tab)}<div id="detail-tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-${tab}">${tab === "cases" ? casesPanel("assigned", expert.mobile) : `<div class="tab-content"><div class="detail-columns"><div>${title("اطلاعات فردی", "user")}<dl class="info-grid">${info("نام و نام خانوادگی", expert.name)}${info("کد کارشناس", expert.code, false, true)}${info("شماره موبایل", D.digits(expert.mobile), false, true)}${info("کد ملی", D.digits(expert.nationalCode), false, true)}${info("شهر محل فعالیت", expert.city)}${info("ایمیل", expert.email, false, true)}${info("نشانی", expert.address, true)}</dl><div class="info-hint">${!expert.hasLogin ? "این کارشناس از پرونده‌های قبلی منتقل شده است؛ نام و رمز عبور او را تکمیل کنید تا امکان ورود داشته باشد." : "اطلاعات تکمیلی ثبت‌نشده با خط تیره نمایش داده می‌شوند."}</div></div><div>${title("اطلاعات همکاری", "shield")}<div class="activity-line">${icon("clock")}<div>تاریخ ثبت<p>${D.date(expert.joinedAt)}</p></div></div><div class="activity-line">${icon("file")}<div>تخصص کارشناس<p><span class="expert-specialty">${e(expert.specialty || "ثبت نشده")}</span></p></div></div><div class="activity-line">${icon("info")}<div>وضعیت همکاری<p>${expert.status === "active" ? "فعال" : "غیرفعال"} · وضعیت دسترسی به اپ</p></div></div><button class="btn" type="button" data-action="edit-expert" data-id="${e(expert.id)}">${icon("edit")}ویرایش اطلاعات</button></div></div></div>`}</div></section>`;
}
function structuralNotice(record) { const risk = D.structural(record); return risk ? `<div class="notice ${risk.tone === "faulty" ? "notice-faulty" : ""}">${icon("info")}<div><strong>${risk.title}</strong><p>${risk.description}</p></div></div>` : ""; }
function scoreTone(score) { return score === null ? "neutral" : score >= 75 ? "healthy" : score >= 50 ? "review" : "faulty"; }
function scoreMeter(score, label) {
  return `<div class="meter meter-${scoreTone(score)}" ${score === null ? `role="img" aria-label="${e(label)}: هنوز محاسبه نشده"` : `role="progressbar" aria-label="${e(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"`}><span style="width:${score ?? 0}%"></span></div>`;
}
function scoreCard(record, category = null) {
  const score = category ? D.categoryScore(category, record) : D.score(record);
  const tone = category ? scoreTone(score) : D.tone(record);
  const label = category ? `امتیاز ${category.name}` : "شاخص وضعیت خودرو";
  const state = score === null ? "تکمیل‌نشده" : category ? (score >= 75 ? "امتیاز بالا" : score >= 50 ? "نیاز به توجه" : "امتیاز پایین") : D.interpretation(record);
  return `<section class="score-box score-${tone}" aria-label="${e(label)}">
    <div class="score-card-heading"><h3 class="score-box-label">${label}</h3><span class="score-state"><i class="pill-dot" aria-hidden="true"></i>${state}</span></div>
    <div class="score-number"><bdi>${score === null ? "—" : D.number(score)}</bdi><span>از ۱۰۰</span></div>
    ${scoreMeter(score, label)}
    ${score === null ? `<p class="score-description">${category ? "با بررسی هر ۴ مورد، امتیاز این بخش محاسبه می‌شود." : "با تکمیل هر ۱۶ مورد، شاخص کل محاسبه می‌شود."}</p>` : ""}
    <div class="score-card-footer"><span>${category ? "وزن در شاخص کل" : "موارد بررسی‌شده"}</span><strong>${category ? `${D.number(category.weight * 100)}٪` : `${D.number(D.progress(record))} از ۱۶ مورد`}</strong></div>
  </section>`;
}
function categoryMeter(category, record) {
  const score = D.categoryScore(category, record);
  return `<a class="category-summary-item score-${scoreTone(score)}" href="${path("case", record.id, category.id, route().from)}" aria-label="مشاهدهٔ جزئیات ${category.name}"><div class="category-summary-top"><strong>${category.name}</strong>${icon("left")}</div><div class="category-summary-score"><bdi>${score === null ? "—" : D.number(score)}</bdi><span>${score === null ? "تکمیل‌نشده" : "از ۱۰۰"}</span></div>${scoreMeter(score, `امتیاز ${category.name}`)}<div class="category-summary-footer"><span>وزن در شاخص کل</span><strong>${D.number(category.weight * 100)}٪</strong></div></a>`;
}
function statusTab(record) {
  const count = D.progress(record), counts = { healthy: 0, review: 0, faulty: 0 };
  D.itemKeys.forEach(key => { const condition = record.items[key].condition; if (condition) counts[condition]++; });
  return `<div class="detail-columns"><div class="stack"><div>${title("خلاصهٔ کارشناسی", "file")}<div class="condition-counts">${Object.entries(counts).map(([kind, value]) => `<div class="condition-count ${kind}"><strong>${D.number(value)}</strong><span>${D.conditions[kind].label}</span></div>`).join("")}</div></div><div><div class="checklist-heading"><h3>پیشرفت پرونده</h3><span class="small muted">${D.number(count)} از ۱۶ مورد</span></div><div class="meter" role="progressbar" aria-label="پیشرفت کارشناسی" aria-valuemin="0" aria-valuemax="16" aria-valuenow="${count}"><span style="width:${count / 16 * 100}%"></span></div><p class="small muted" style="margin-top:12px">${count === 16 ? "همهٔ موارد بررسی شده‌اند و گزارش آمادهٔ دریافت است." : "پس از ثبت پاسخ همهٔ ۱۶ مورد، امتیاز و گزارش نهایی آماده می‌شود."}</p></div><div><h3 style="margin-bottom:16px">امتیاز بخش‌ها</h3><div class="category-summary">${D.categories.map(c => categoryMeter(c, record)).join("")}</div></div></div><div>${scoreCard(record)}${title("زمان‌های ثبت پرونده", "clock")}<ol class="timeline">${(record.history || []).map(event => `<li>${event.action === "created" ? "ایجاد پرونده" : event.action === "imported" ? "انتقال پروندهٔ قبلی" : "تغییر وضعیت"}<small>${D.date(event.at, true)}</small>${event.detail?.to ? `<p>${statusLabels[event.detail.from] || "—"} ← ${statusLabels[event.detail.to] || "—"}</p>` : ""}</li>`).join("")}</ol><p class="small muted" style="margin-top:20px">آخرین ذخیره: ${D.date(record.updatedAt, true)}</p></div></div>`;
}
function vehicleTab(record) {
  const v = record.vehicle;
  return `<div class="detail-columns"><div>${title("مشخصات خودرو", "car")}<dl class="info-grid">${info("نام و مدل خودرو", v.model)}${info("سال ساخت", D.digits(v.year))}${info("کارکرد", v.mileage ? `${D.number(Number(D.latin(v.mileage)))} کیلومتر` : "")}${info("رنگ خودرو", v.color)}${info("شماره پلاک", D.digits(v.plate), true, true)}${info("شماره شاسی (VIN)", v.vin, true, true)}</dl><p class="info-hint">فیلدهای تکمیل‌نشده در اپ کارشناس، با خط تیره نمایش داده می‌شوند.</p></div><div>${title("اطلاعات پرونده", "folder")}<dl class="info-grid">${info("کد پرونده", D.caseCode(record), false, true)}${info("تاریخ ثبت", D.date(record.createdAt))}${info("کارشناس", expertName(record), true)}${info("موبایل کارشناس", D.digits(record.ownerMobile), true, true)}${info("شناسهٔ یکتا", record.id, true, true)}</dl></div></div>`;
}
const mapPoints = { "body.paint": [240, 85], "body.scratches": [211, 252], "body.dents": [101, 183], "body.chassis": [345, 238], "engine.performance": [122, 160], "engine.noise": [121, 135], "engine.leaks": [126, 186], "engine.exhaust": [350, 267], "interior.dashboard": [206, 155], "interior.seats": [250, 160], "interior.climate": [209, 186], "interior.electronics": [287, 183], "tires.front": [143, 46], "tires.rear": [299, 46], "tires.rims": [143, 277], "tires.spare": [339, 161] };
function checklistTab(record, category) {
  const findings = category.items.filter(([key]) => ["review", "faulty"].includes(record.items[`${category.id}.${key}`].condition));
  return `<div class="detail-columns"><div><div class="checklist-heading"><div><h2>بررسی ${category.name}</h2><p>وضعیت و یادداشت‌های ثبت‌شده توسط کارشناس</p></div><span class="count-label">${D.number(category.items.filter(([key]) => record.items[`${category.id}.${key}`].condition).length)} از ۴ مورد</span></div>${category.items.map(([key, label], index) => { const item = record.items[`${category.id}.${key}`]; return `<div class="checklist-row"><div><strong class="checklist-label"><span class="checklist-number">${D.number(index + 1)}.</span>${label}</strong>${item.note ? `<p class="checklist-note">یادداشت کارشناس: ${e(item.note)}</p>` : '<p class="small muted" style="margin:6px 24px 0 0">یادداشتی ثبت نشده</p>'}</div>${item.condition ? pill(item.condition, D.conditions[item.condition].label) : pill("neutral", "بررسی نشده")}</div>`; }).join("")}</div><div>${scoreCard(record, category)}<h3>نقشهٔ یافته‌های این بخش</h3><div class="car-map"><img src="/assets/car-inspection-map.png" width="460" height="340" alt="نمای شماتیک خودرو؛ محل تقریبی یافته‌های ${category.name}">${findings.map(([key, label]) => { const position = mapPoints[`${category.id}.${key}`], condition = record.items[`${category.id}.${key}`].condition; return `<span class="map-marker ${condition}" style="left:${position[0] / 460 * 100}%;top:${position[1] / 340 * 100}%" title="${e(label)}: ${D.conditions[condition].label}">${D.number(category.items.findIndex(([id]) => id === key) + 1)}</span>`; }).join("")}</div><div class="map-legend"><span><i class="review"></i>نیاز به بررسی</span><span><i></i>معیوب</span></div><p class="small muted" style="margin-top:12px">شماره‌ها با موارد همین بخش مطابقت دارند. محل علامت‌ها تقریبی است.</p></div></div>`;
}
function reportTab(record) {
  if (D.status(record) !== "complete") return `<div class="empty-state"><div class="empty-icon">${icon("clock")}</div><h3>گزارش هنوز آماده نیست</h3><p>${D.number(16 - D.progress(record))} مورد از کارشناسی تکمیل نشده است.</p><a class="btn" href="${path("case", record.id, "status", route().from)}">مشاهدهٔ وضعیت پرونده</a></div>`;
  return `<div class="report-cover"><span>${icon("file")}</span><div><h2>گزارش کارشناسی ${e(record.vehicle.model || "خودرو")}</h2><p>پروندهٔ <bdi>${e(D.caseCode(record))}</bdi> · ${D.date(record.createdAt)}</p></div></div><div class="detail-columns"><div><h3 style="margin-bottom:12px">محتوای گزارش</h3><p class="report-content-label">مشخصات خودرو، اطلاعات کارشناس و تاریخ کارشناسی<br>امتیاز کل و امتیاز هر یک از چهار بخش<br>نتیجهٔ تمام ۱۶ مورد و یادداشت‌های ثبت‌شده<br>یافته‌های ساختاری، در صورت ثبت</p><div class="report-actions"><button class="btn btn-primary" type="button" data-download="${e(record.id)}">${icon("download")}دانلود گزارش PDF</button><button class="btn" type="button" data-print="${e(record.id)}">${icon("print")}چاپ گزارش</button></div><p class="info-hint">گزارش PDF مستقیماً دانلود می‌شود. برای چاپ یا ذخیرهٔ نسخهٔ متنی از «چاپ گزارش» استفاده کنید.</p></div>${scoreCard(record)}</div><p class="small muted" style="margin-top:24px">شاخص فقط ۱۶ مورد این فرم را می‌سنجد و گواهی ایمنی یا کارشناسی کامل فنی خودرو نیست.</p>`;
}
function caseView(r) {
  const record = data.cases.find(item => item.id === r.id);
  if (!record) return missingView("پرونده پیدا نشد", "cases");
  const allowed = ["status", "vehicle", ...D.categories.map(c => c.id), "report"], tab = allowed.includes(r.tab) ? r.tab : "status";
  const from = findExpert(r.from), parentHref = from ? path("expert", from.id, "cases") : "#cases";
  const tabItems = [["status", "وضعیت پرونده", "clock"], ["vehicle", "مشخصات خودرو", "car"], ...D.categories.map(c => [c.id, c.name, c.id]), ["report", "گزارش", "file"]];
  const content = tab === "status" ? statusTab(record) : tab === "vehicle" ? vehicleTab(record) : tab === "report" ? reportTab(record) : checklistTab(record, D.categories.find(c => c.id === tab));
  return `${breadcrumbs([["پرونده‌ها", "#cases"], ...(from ? [[from.name, parentHref]] : []), [D.caseCode(record)]])}<div class="page-heading"><div><h1>جزئیات پرونده</h1><p>وضعیت و نتایج کارشناسی خودرو</p></div><a class="btn" href="${parentHref}">${icon("right")}بازگشت به ${from ? "پرونده‌های کارشناس" : "پرونده‌ها"}</a></div>
    <section class="surface detail-banner case-banner" aria-label="مشخصات پرونده">
      <div class="case-identity"><div class="profile-title"><h2>${e(record.vehicle.model || "خودرو بدون نام")}</h2>${pill(D.status(record))}</div>
        <dl class="case-meta"><div><dt>کد پرونده</dt><dd><bdi class="ltr">${e(D.caseCode(record))}</bdi></dd></div><div><dt>کارشناس</dt><dd>${e(expertName(record))}</dd></div><div><dt>تاریخ ثبت</dt><dd>${D.date(record.createdAt)}</dd></div></dl>
      </div><div class="heading-actions"><button class="btn btn-primary" type="button" data-download="${e(record.id)}" ${D.status(record) !== "complete" ? 'disabled title="پس از تکمیل ۱۶ مورد، گزارش آماده می‌شود"' : ""}>${icon("download")}دانلود گزارش</button></div>
    </section>
    ${structuralNotice(record)}<section class="surface">${tabsView(tabItems.map(([id, label, glyph]) => [id, label, path("case", record.id, id, r.from), glyph]), tab)}<div class="tab-content" id="detail-tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-${tab}">${content}</div></section>`;
}
function missingView(label, back) { return `${breadcrumbs([[label]])}<section class="surface empty-state"><div class="empty-icon">${icon("search")}</div><h1>${label}</h1><p>این نشانی معتبر نیست یا داده در این مرورگر وجود ندارد.</p><a class="btn" href="#${back}">بازگشت به فهرست</a></section>`; }
function render() {
  const r = route();
  if (!session) { app.innerHTML = loginView(); document.title = "ورود به پنل مدیریت | اتو ال‌ام"; return; }
  const content = r.type === "experts" ? expertsView() : r.type === "cases" ? casesView() : r.type === "expert" ? expertView(r) : r.type === "case" ? caseView(r) : missingView("صفحه پیدا نشد", "experts");
  app.innerHTML = shell(content, r);
  applySidebarState(); syncSelectionControls();
  const activeTab = app.querySelector('[role="tab"][aria-selected="true"]');
  if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  document.title = `${r.type.startsWith("expert") ? "کارشناسان" : "پرونده‌ها"} | پنل مدیریت اتو ال‌ام`;
  if (focusTabAfterRender && activeTab) { activeTab.focus({ preventScroll: true }); focusTabAfterRender = false; focusAfterRender = false; }
  else if (focusAfterRender) { document.getElementById("main-content").focus({ preventScroll: true }); focusAfterRender = false; }
}
function refreshResults(scope) {
  const r = route(), host = document.getElementById("table-results");
  if (!host) return;
  host.innerHTML = scope === "experts" ? expertResults() : caseResults(scope, scope === "assigned" ? r.id : "");
  syncSelectionControls();
  const clear = app.querySelector(`[data-action="clear-search"][data-scope="${scope}"]`);
  if (clear) clear.hidden = !filters[scope].query;
  const reset = app.querySelector(`[data-action="reset-filters"][data-scope="${scope}"]`);
  if (reset) reset.hidden = !hasFilters(scope);
}
function formField(name, label, value, options = {}) {
  return `<label class="field ${options.full ? "full" : ""}"><span>${label}${options.required ? ' <b class="required">*</b>' : ""}</span>${options.textarea ? `<textarea class="input" name="${name}" maxlength="250">${e(value)}</textarea>` : `<input class="input ${options.ltr ? "input-mobile" : ""}" name="${name}" value="${e(value)}" type="${options.type || "text"}" maxlength="${options.max || 80}" ${options.required ? "required" : ""} ${options.inputmode ? `inputmode="${options.inputmode}"` : ""} ${name === "mobile" && options.edit ? "readonly" : ""}>`}</label>`;
}
function openExpertDialog(id = "") {
  const expert = findExpert(id) || { name: "", mobile: "", code: "", city: "", specialty: "کارشناسی کامل", status: "active", nationalCode: "", email: "", address: "" };
  const editing = Boolean(id);
  const minimumPasswordLength = localLoginHints?.expertPasswordMinLength || 10;
  dialog.innerHTML = `<form id="expert-form" data-edit="${e(id)}" novalidate><header class="dialog-header"><h2 id="expert-dialog-title">${editing ? "ویرایش اطلاعات کارشناس" : "افزودن کارشناس"}</h2><button type="button" class="btn-square" data-close-dialog aria-label="بستن پنجره">${icon("close")}</button></header><div class="dialog-body"><div class="form-grid">${formField("name", "نام و نام خانوادگی", expert.name, { required: true })}${formField("mobile", "شماره موبایل", expert.mobile, { required: true, type: "tel", ltr: true, max: 11, inputmode: "tel", edit: editing })}${formField("nationalCode", "کد ملی", expert.nationalCode, { ltr: true, max: 10, inputmode: "numeric" })}${formField("city", "شهر محل فعالیت", expert.city)}<label class="field"><span>تخصص</span><select class="input" name="specialty">${["کارشناسی کامل", "بدنه و رنگ", "فنی و موتور"].map(value => option(value, value, expert.specialty)).join("")}</select></label><label class="field"><span>وضعیت</span><select class="input" name="status">${option("active", "فعال", expert.status)}${option("inactive", "غیرفعال", expert.status)}</select></label>${formField("password", editing && expert.hasLogin ? "رمز عبور جدید (اختیاری)" : `رمز ورود کارشناس (حداقل ${D.number(minimumPasswordLength)} نویسه)`, "", { type: "password", full: true, max: 128 })}${formField("email", "ایمیل", expert.email, { type: "email", ltr: true, full: true })}${formField("address", "نشانی", expert.address, { textarea: true, full: true })}</div><p class="form-error" id="expert-form-error" role="alert"></p><p class="small muted" style="margin-top:16px">${editing ? "با غیرفعال‌کردن کارشناس، دسترسی او به اپ بسته می‌شود." : "کارشناس با همین شماره موبایل و رمز تعیین‌شده وارد اپ می‌شود."}</p></div><footer class="dialog-footer"><button class="btn btn-primary" type="submit">${editing ? "ذخیره تغییرات" : "افزودن کارشناس"}</button><button class="btn" type="button" data-close-dialog>انصراف</button></footer></form>`;
  dialog.showModal();
}
async function saveExpert(form) {
  const values = Object.fromEntries(new FormData(form));
  const mobile = D.latin(values.mobile).trim(), nationalCode = D.latin(values.nationalCode).trim(), errors = [];
  if (values.name.trim().length < 3) errors.push("نام و نام خانوادگی را کامل وارد کنید.");
  if (!/^09\d{9}$/.test(mobile)) errors.push("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.");
  if (!form.dataset.edit && findExpert(mobile)) errors.push("کارشناسی با این شماره موبایل وجود دارد.");
  if (nationalCode && !/^\d{10}$/.test(nationalCode)) errors.push("کد ملی باید ۱۰ رقم باشد.");
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.push("ایمیل معتبر وارد کنید.");
  if (errors.length) { document.getElementById("expert-form-error").textContent = errors.join("\n"); return; }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await API.request(form.dataset.edit ? `/api/admin/experts/${encodeURIComponent(form.dataset.edit)}` : "/api/admin/experts", { method: form.dataset.edit ? "PUT" : "POST", body: JSON.stringify({ ...values, mobile, nationalCode }) });
    await fetchData(); dialog.close(); render(); notify("اطلاعات کارشناس ذخیره شد.");
  } catch (error) { document.getElementById("expert-form-error").textContent = error.message; }
  finally { button.disabled = false; }
}
app.addEventListener("submit", async event => {
  if (event.target.id !== "admin-login-form") return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target)), error = document.getElementById("login-error"), button = event.target.querySelector('[type="submit"]');
  const username = values.username.trim();
  if (!username || !values.password) { error.textContent = "نام کاربری و رمز عبور را وارد کنید."; return; }
  button.disabled = true;
  try {
    const result = await API.request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password: values.password, role: "admin" }) });
    session = result.user;
    await importLegacy(); await fetchData(); focusAfterRender = true; render();
  } catch (failure) { error.textContent = failure.message; }
  finally { button.disabled = false; }
});

app.addEventListener("input", event => {
  const scope = event.target.dataset.search;
  if (scope && filters[scope]) { filters[scope].query = event.target.value; filters[scope].page = 1; refreshResults(scope); }
  if (["login-username", "login-password"].includes(event.target.id)) { event.target.removeAttribute("aria-invalid"); const error = document.getElementById("login-error"); if (error) error.textContent = ""; }
});
app.addEventListener("change", event => {
  const target = event.target;
  if (target.dataset.rowSelect !== undefined) {
    const { rowSelect: id, scope } = target.dataset;
    if (!selectedRows[scope]) return;
    if (target.checked) selectedRows[scope].add(id); else selectedRows[scope].delete(id);
    refreshResults(scope);
    app.querySelector(`[data-row-select="${CSS.escape(id)}"][data-scope="${scope}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.selectAll) {
    const scope = target.dataset.selectAll;
    for (const checkbox of app.querySelectorAll(`[data-row-select][data-scope="${scope}"]`)) {
      if (target.checked) selectedRows[scope].add(checkbox.dataset.rowSelect); else selectedRows[scope].delete(checkbox.dataset.rowSelect);
    }
    refreshResults(scope); app.querySelector(`[data-select-all="${scope}"]`)?.focus({ preventScroll: true }); return;
  }
  if (target.dataset.pageSize) {
    const scope = target.dataset.pageSize, size = Number(target.value);
    if (filters[scope] && [10, 20, 50].includes(size)) { filters[scope].pageSize = size; filters[scope].page = 1; refreshResults(scope); app.querySelector(`[data-page-size="${scope}"]`)?.focus({ preventScroll: true }); }
    return;
  }
  const { filter, scope } = event.target.dataset;
  if (filters[scope] && Object.hasOwn(filters[scope], filter)) { filters[scope][filter] = event.target.value; filters[scope].page = 1; refreshResults(scope); }
});
app.addEventListener("click", async event => {
  const action = event.target.closest("[data-action]");
  if (action) {
    const { action: name, scope } = action.dataset;
    if (name === "logout") {
      try { await API.request("/api/auth/logout?role=admin", { method: "POST", body: "{}" }); session = null; data = { experts: [], cases: [] }; Object.values(selectedRows).forEach(set => set.clear()); render(); }
      catch (error) { notify(error.message); }
    } else if (name === "sidebar-toggle") {
      sidebarCollapsed = !sidebarCollapsed;
      try { localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed)); } catch (_) { /* Session-only preference. */ }
      applySidebarState();
    } else if (name === "export-table") exportSelection(scope);
    else if (name === "clear-selection") { selectedRows[scope]?.clear(); refreshResults(scope); }
    else if (name === "menu" || name === "close-menu") {
      const open = name === "menu" && !document.getElementById("sidebar").classList.contains("is-open");
      document.getElementById("sidebar").classList.toggle("is-open", open); app.querySelector(".mobile-overlay").classList.toggle("is-open", open); app.querySelector('[data-action="menu"]').setAttribute("aria-expanded", String(open));
    } else if (name === "add-expert") openExpertDialog();
    else if (name === "edit-expert") openExpertDialog(action.dataset.id);
    else if (name === "clear-search" || name === "reset-filters") {
      if (filters[scope]) {
        if (name === "clear-search") filters[scope].query = "";
        else Object.keys(filters[scope]).forEach(key => { filters[scope][key] = key === "page" ? 1 : key === "pageSize" ? filters[scope].pageSize : key === "query" ? "" : key === "sort" ? "newest" : "all"; });
        filters[scope].page = 1; render(); app.querySelector(`[data-search="${scope}"]`)?.focus();
      }
    }
    return;
  }
  const page = event.target.closest("[data-page]");
  if (page && filters[page.dataset.scope]) { filters[page.dataset.scope].page = Number(page.dataset.page); refreshResults(page.dataset.scope); return; }
  const download = event.target.closest("[data-download]");
  if (download) {
    const record = data.cases.find(item => item.id === download.dataset.download);
    if (!session || !record || D.status(record) !== "complete" || download.disabled) return;
    download.disabled = true; notify("گزارش PDF در حال آماده‌سازی است…");
    try { await window.AdminReport.download(record, expertName(record)); notify("گزارش PDF آماده و برای دانلود ارسال شد."); }
    catch (_) { notify("ساخت PDF انجام نشد؛ از «چاپ گزارش» در تب گزارش استفاده کنید."); }
    finally { if (download.isConnected) download.disabled = false; }
    return;
  }
  const print = event.target.closest("[data-print]");
  if (print) { const record = data.cases.find(item => item.id === print.dataset.print); if (session && record && D.status(record) === "complete") window.AdminReport.print(record, expertName(record)); return; }
  if (!event.target.closest("a,button,input,select,textarea")) { const row = event.target.closest("[data-row-link]"); if (row) navTo(row.dataset.rowLink); }
});
app.addEventListener("keydown", event => {
  const current = event.target.closest('[role="tab"]');
  if (current && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    const links = [...current.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const index = links.indexOf(current), next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (index + (event.key === "ArrowLeft" ? 1 : -1) + links.length) % links.length;
    event.preventDefault(); focusTabAfterRender = true; navTo(links[next].getAttribute("href"));
  }
  if (event.key === "Escape" && document.getElementById("sidebar")?.classList.contains("is-open")) app.querySelector('[data-action="close-menu"]')?.click();
});
dialog.addEventListener("click", event => { if (event.target.closest("[data-close-dialog]") || event.target === dialog) dialog.close(); });
dialog.addEventListener("submit", event => { if (event.target.id === "expert-form") { event.preventDefault(); saveExpert(event.target); } });
window.addEventListener("hashchange", () => { focusAfterRender = true; render(); window.scrollTo(0, 0); });

document.addEventListener("visibilitychange", () => { if (!document.hidden && session && !dialog.open) refreshFromServer(); });
document.querySelector(".skip-link").addEventListener("click", event => { event.preventDefault(); document.getElementById("main-content")?.focus(); });
async function importLegacy() {
  const inspections = API.legacyRecords();
  let profiles = [];
  try { const old = JSON.parse(localStorage.getItem(D.PROFILES_KEY) || "[]"); if (Array.isArray(old)) profiles = old.filter(p => p && p.demo !== true); } catch (_) { /* Original data is retained. */ }
  if (!inspections.length && !profiles.length) return;
  const result = await API.request("/api/admin/import", { method: "POST", body: JSON.stringify({ inspections, profiles }) });
  if (result.imported) notify(`${D.number(result.imported)} پروندهٔ قبلی به پایگاه داده منتقل شد.`);
}
async function fetchData() {
  const result = await API.request("/api/admin/overview");
  data = result; backendError = ""; lastPayload = JSON.stringify(result);
}
async function refreshFromServer() {
  if (refreshRunning || !session || dialog.open) return;
  refreshRunning = true;
  try {
    const result = await API.request("/api/admin/overview"), payload = JSON.stringify(result);
    if (payload !== lastPayload || backendError) { data = result; lastPayload = payload; backendError = ""; render(); }
  } catch (error) { backendError = error.message; if (error.status === 401) session = null; render(); }
  finally { refreshRunning = false; }
}
async function start() {
  try {
    if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
      try {
        const response = await fetch("/api/local-login-hints?role=admin", { cache: "no-store" });
        if (response.ok) localLoginHints = await response.json();
      } catch (_) { /* Local login hints are optional. */ }
    }
    try { session = (await API.request("/api/auth/session?role=admin")).user; } catch (error) { if (error.status !== 401) throw error; }
    if (session) { await importLegacy(); await fetchData(); }
  } catch (error) { backendError = error.message; }
  loading = false; render();
}
render(); start();
setInterval(refreshFromServer, 5000);
