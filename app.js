"use strict";

const STORAGE_KEY = "carcheck_inspections_v2";
const LEGACY_STORAGE_KEY = "carcheck_inspection_v1";
const AUTH_KEY = "carcheck_demo_auth_v1";
const ACTIVE_VIEW_KEY = "carcheck_active_views_v1";
const SCHEMA_VERSION = 2;
let INSPECTOR_NAME = "";
const PLATE_LETTERS = ["الف", "ب", "پ", "ت", "ث", "ج", "چ", "ح", "خ", "د", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ه", "ی"];
const STAGES = [{ id: "setup", name: "اطلاعات خودرو" }, { id: "body", name: "بدنه" }, { id: "engine", name: "موتور" }, { id: "interior", name: "داخل کابین" }, { id: "tires", name: "لاستیک‌ها" }];
const CATEGORIES = [
  { id: "body", name: "بدنه", weight: .30, items: [
    ["paint", "وضعیت رنگ بدنه"], ["scratches", "خط و خش بدنه"],
    ["dents", "فرورفتگی و آسیب ظاهری"], ["chassis", "وضعیت شاسی و ستون‌ها"]
  ] },
  { id: "engine", name: "موتور", weight: .35, items: [
    ["performance", "عملکرد موتور"], ["noise", "صدای غیرعادی موتور"],
    ["leaks", "نشتی روغن و مایعات"], ["exhaust", "دود و وضعیت اگزوز"]
  ] },
  { id: "interior", name: "داخل کابین", weight: .20, items: [
    ["dashboard", "وضعیت داشبورد و کنسول"], ["seats", "سلامت صندلی‌ها و روکش"],
    ["climate", "عملکرد کولر و سیستم تهویه"], ["electronics", "تجهیزات برقی و نمایشگرها"]
  ] },
  { id: "tires", name: "لاستیک‌ها", weight: .15, items: [
    ["front", "وضعیت لاستیک‌های جلو"], ["rear", "وضعیت لاستیک‌های عقب"],
    ["rims", "سلامت رینگ‌ها"], ["spare", "وضعیت لاستیک زاپاس"]
  ] }
];
const CONDITIONS = {
  healthy: { label: "سالم", points: 100, icon: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16 9.5"/>' },
  review: { label: "نیاز به بررسی", points: 50, icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="16" r=".6" fill="currentColor" stroke="none"/>' },
  faulty: { label: "معیوب", points: 0, icon: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l8 13.4a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/>' }
};
function conditionIcon(value) {
  return `<svg class="condition-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CONDITIONS[value].icon}</svg>`;
}
function categoryIcon(id) {
  const icons = {
    body: '<path d="m3 13 2-6h10l4 6h2v5h-2m-12 0h8m-12 0H2v-5h17M8 7l-1 6m5-6v6"/><circle cx="5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    engine: '<path d="M7 4h7m-3.5 0v3M4 11H2m0-3v9m2-3v-4h3l2-3h7l3 4h3v7h-3l-2 3H8l-4-4Z"/><path d="m13 10-3 4h5l-3 4"/>',
    interior: '<path d="M7 3H5a1 1 0 0 0-1 1v8a5 5 0 0 0 5 5h9a2 2 0 0 0 0-4h-7a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2Z"/><path d="m7 17-1 4m10-4 1 4M5 21h14"/>',
    tires: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 7v3.5m4.8.5-3.3 1m1.4 4-2-2.8m-3.8 2.8 2-2.8M7.2 11l3.3 1M9 3.5l1 3.9m10.5 1.1-4.1.3m.6 11.1-1.4-3.8m-8.6 3.8 1.4-3.8M3.5 8.5l4.1.3"/>'
  };
  return `<svg class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[id]}</svg>`;
}
// Coordinates use the 460 × 340 display canvas of car-inspection-map.png.
// These fields describe whole systems, so points indicate representative areas.
const INSPECTION_MAP_POINTS = {
  "body.paint": [240, 85], "body.scratches": [211, 252],
  "body.dents": [101, 183], "body.chassis": [345, 238],
  "engine.performance": [122, 160], "engine.noise": [121, 135],
  "engine.leaks": [126, 186], "engine.exhaust": [350, 267],
  "interior.dashboard": [206, 155], "interior.seats": [250, 160],
  "interior.climate": [209, 186], "interior.electronics": [287, 183],
  "tires.front": [143, 46], "tires.rear": [299, 46],
  "tires.rims": [143, 277], "tires.spare": [339, 161]
};
function inspectionMap(record) {
  const issues = CATEGORIES.flatMap(category => category.items.flatMap(([id, label]) => {
    const key = `${category.id}.${id}`;
    const condition = record.items[key]?.condition;
    return condition === "review" || condition === "faulty"
      ? [{ key, label, category: category.name, condition, point: INSPECTION_MAP_POINTS[key] }]
      : [];
  }));
  const findingsLayout = issues.length > 6 ? "many-findings" : issues.length ? "compact-findings" : "no-findings";
  return `<div class="report-map-layout ${findingsLayout}">
  <section class="card inspection-map-card" aria-labelledby="inspection-map-title">
    <h2 id="inspection-map-title">نقشه وضعیت خودرو</h2>
    <p class="small muted">نماهای خودرو محل تقریبی موارد ثبت‌شده را نشان می‌دهند. شماره‌ها با فهرست همین بخش مطابقت دارند.</p>
    <figure class="inspection-map-figure">
      <div class="inspection-map-canvas" dir="ltr">
        <img src="assets/car-inspection-map.png" width="460" height="340" alt="نمای شماتیک خودرو از بالا و دو طرف">
        ${issues.map((issue, index) => `<svg class="inspection-marker" style="left:${issue.point[0] / 460 * 100}%;top:${issue.point[1] / 340 * 100}%" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="${issue.condition === "review" ? "#d59a00" : "#d12f39"}" stroke="#fff" stroke-width="2"/><text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="800">${persianDigits(index + 1)}</text></svg>`).join("")}
      </div>
      <figcaption class="inspection-map-legend"><span><i class="legend-dot marker-review"></i>نیاز به بررسی</span><span><i class="legend-dot marker-faulty"></i>معیوب</span></figcaption>
    </figure>
    ${issues.length ? "" : `<p class="inspection-map-empty">برای موارد ثبت‌شده، نیازی به بررسی یا عیب گزارش نشده است.</p>`}
  </section>
  ${issues.length ? `<section class="card inspection-issues" aria-labelledby="inspection-issues-title"><h3 id="inspection-issues-title">موارد مشخص‌شده روی نقشه</h3><ol class="inspection-issue-list">${issues.map((issue, index) => `<li><span class="issue-number marker-${issue.condition}">${persianDigits(index + 1)}</span><span class="issue-detail"><strong>${issue.label}</strong><small>${issue.category}</small></span><span class="issue-status status-${issue.condition}">${CONDITIONS[issue.condition].label}</span></li>`).join("")}</ol></section>` : ""}
  </div>`;
}
const app = document.getElementById("app");
const toast = document.getElementById("toast");
const stepsSheet = document.getElementById("steps-sheet");
const noteSheet = document.getElementById("note-sheet");
const historyFilterSheet = document.getElementById("history-filter-sheet");
const plateLetterSheet = document.getElementById("plate-letter-sheet");
const noteEditor = document.getElementById("note-editor");
let editingNoteKey = null;
const numberFormatter = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const yearFormatter = new Intl.NumberFormat("fa-IR", { useGrouping: false });
let storageError = false;
let database = loadDatabase();
let auth = null;
let localLoginHints = null;
let state = auth ? getDraft(auth.mobile) : blankInspection();
let screen = auth ? "home" : "login";
let homeTab = "new";
let loginStage = "mobile";
let loginMobile = "";
let toastTimer = null;
let reportWarning = false;
let reportOrigin = "workflow";
let workflowOrigin = "new";
let historySearch = "";
let historyStatusFilter = "all";
let historySort = "newest";
let historySortDraft = "newest";

// A starter catalogue of common vehicles. Unlisted vehicles remain editable.
const VEHICLE_CATALOGUE = [
  ["پژو", "peugeot", ["۲۰۷ دنده‌ای", "۲۰۷ اتوماتیک", "۲۰۶ تیپ ۲", "۲۰۶ تیپ ۵", "۲۰۶ صندوقدار V8", "۴۰۵ GLX", "۴۰۵ SLX", "پارس سال", "پارس TU5", "پارس ELX", "۲۰۰۸"]],
  ["ایران‌خودرو", "iran khodro ikco", ["سمند LX", "سمند EF7", "سورن پلاس", "دنا", "دنا پلاس دنده‌ای", "دنا پلاس اتوماتیک", "رانا LX", "رانا پلاس", "تارا دنده‌ای", "تارا اتوماتیک", "آریسان ۲"]],
  ["سایپا", "saipa", ["پراید ۱۱۱", "پراید ۱۳۱", "پراید ۱۳۲", "پراید ۱۴۱", "وانت ۱۵۱", "تیبا صندوقدار", "تیبا ۲", "ساینا دنده‌ای", "ساینا اتوماتیک", "ساینا S", "کوییک دنده‌ای", "کوییک اتوماتیک", "کوییک R", "کوییک S", "شاهین دنده‌ای", "شاهین اتوماتیک", "اطلس"]],
  ["رنو", "renault", ["تندر ۹۰", "ساندرو دنده‌ای", "ساندرو اتوماتیک", "ساندرو استپ‌وی", "مگان", "کپچر", "کولیوس", "تالیسمان"]],
  ["ام‌وی‌ام", "mvm ام وی ام", ["۱۱۰", "۳۱۵", "X22 دنده‌ای", "X22 اتوماتیک", "X22 Pro", "X33", "X33 S", "X55 Pro"]],
  ["چری", "chery", ["آریزو ۵", "آریزو ۶", "تیگو ۵", "تیگو ۷"]],
  ["فونیکس", "fownix chery", ["آریزو ۶ Pro", "آریزو ۸", "تیگو ۷ Pro", "تیگو ۸ Pro", "تیگو ۸ Pro Max", "FX"]],
  ["جک", "jac", ["J3", "J4", "J5 دنده‌ای", "J5 اتوماتیک", "S3", "S5 دنده‌ای", "S5 اتوماتیک"]],
  ["کی‌ام‌سی", "kmc کی ام سی", ["J7", "K7", "T8", "T9", "X5"]],
  ["بهمن", "bahman", ["فیدلیتی پرایم", "فیدلیتی پرستیژ", "دیگنیتی پرایم", "دیگنیتی پرستیژ", "ریسپکت"]],
  ["چانگان", "changan", ["CS35", "CS35 Plus", "CS55 Plus"]],
  ["هایما", "haima", ["S5", "S7", "S7 پلاس", "8S"]],
  ["لیفان", "lifan", ["۶۲۰", "۸۲۰", "X50", "X60"]],
  ["برلیانس", "brilliance", ["H220", "H230", "H320", "H330", "کراس"]],
  ["هیوندای", "hyundai", ["اکسنت", "النترا", "سوناتا", "آزرا", "توسان", "سانتافه", "i20", "i30"]],
  ["کیا", "kia", ["پراید", "ریو", "سراتو", "اپتیما", "اسپورتیج", "سورنتو", "پیکانتو", "سول"]],
  ["تویوتا", "toyota", ["کرولا", "کمری", "یاریس", "پریوس", "راوفور RAV4", "پرادو", "لندکروزر", "هایلوکس", "C-HR"]],
  ["مزدا", "mazda", ["۳", "۳ نیو", "۳۲۳", "۲"]],
  ["نیسان", "nissan", ["ماکسیما", "تیانا", "جوک", "ایکس‌تریل", "قشقایی", "پاترول", "وانت"]],
  ["سوزوکی", "suzuki", ["گرند ویتارا", "کیزاشی"]],
  ["میتسوبیشی", "mitsubishi", ["لنسر", "ASX", "اوتلندر", "پاجرو"]],
  ["بی‌ام‌و", "bmw بی ام و", ["۳۲۰i", "۳۲۸i", "۵۲۰i", "۵۲۸i", "X1", "X3", "X4", "X5"]],
  ["مرسدس بنز", "mercedes benz", ["C200", "E200", "E250", "S500", "GLA", "GLC"]]
].flatMap(([brand, aliases, models]) => models.map(model => ({
  label: `${brand} ${model}`,
  search: normalizeSearch(`${brand} ${model} ${aliases} ${model.includes("دنده‌ای") ? "دستی manual" : ""} ${model.includes("اتوماتیک") ? "automatic" : ""}`)
})));
let vehiclePicker = { name: null, active: -1, options: [], calendar: "persian", browseYears: false };

function vehicleMatches(query) {
  const tokens = String(query).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  return VEHICLE_CATALOGUE.filter(vehicle => tokens.every(token => vehicle.search.includes(token)));
}
function yearOptions(query, calendar) {
  const currentYear = Number(new Intl.DateTimeFormat("en-u-ca-" + calendar, { year: "numeric", timeZone: "Asia/Tehran" }).formatToParts(new Date()).find(part => part.type === "year").value);
  const minimum = calendar === "persian" ? 1300 : 1900;
  const normalized = normalizeDigits(query).trim();
  return Array.from({ length: currentYear + 2 - minimum }, (_, i) => String(currentYear + 1 - i))
    .filter(year => year.startsWith(normalized));
}
function vehicleComboField(name, value) {
  const model = name === "model";
  return `<div class="field vehicle-combobox" data-vehicle-combobox="${name}">
    <label class="field-label" for="vehicle-${name}">${model ? 'نام و مدل خودرو <span class="required" aria-hidden="true">*</span>' : "سال ساخت"}</label>
    <div class="vehicle-combo-anchor">
      <div class="vehicle-combo-control">
        <input id="vehicle-${name}" class="text-input vehicle-combo-input" type="text" name="${name}" value="${safeText(model ? value : persianDigits(value))}" placeholder="${model ? "مثلاً ۲۰۷ یا پژو" : "مثلاً ۱۴۰۲ یا ۲۰۲۳"}" ${model ? 'required maxlength="100"' : 'inputmode="numeric" maxlength="4"'} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="vehicle-${name}-list" aria-describedby="${name}-hint ${name}-error" autocomplete="off" spellcheck="false">
        <button class="vehicle-combo-clear" type="button" data-vehicle-clear="${name}" aria-label="پاک کردن ${model ? "نام خودرو" : "سال ساخت"}" ${value ? "" : "hidden"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
        <button class="vehicle-combo-toggle" type="button" data-vehicle-toggle="${name}" aria-label="نمایش پیشنهادهای ${model ? "خودرو" : "سال ساخت"}" aria-expanded="false" aria-controls="vehicle-${name}-popup" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
      </div>
      <div id="vehicle-${name}-popup" class="vehicle-combo-popup" hidden>
        ${model ? '<p class="vehicle-combo-caption" id="vehicle-model-caption"></p>' : '<div class="vehicle-year-calendars" role="group" aria-label="تقویم سال ساخت"><button type="button" data-vehicle-calendar="persian" aria-pressed="true">شمسی</button><button type="button" data-vehicle-calendar="gregory" aria-pressed="false">میلادی</button></div>'}
        <div id="vehicle-${name}-list" class="vehicle-combo-list" role="listbox" aria-label="${model ? "پیشنهادهای خودرو" : "سال‌های ساخت"}"></div>
        ${model ? '<button type="button" class="vehicle-combo-manual" data-vehicle-manual></button>' : ""}
      </div>
    </div>
    <span class="field-hint" id="${name}-hint">${model ? "جست‌وجو و انتخاب؛ خودروی دیگری دارید؟ نام آن را بنویسید." : "سال شمسی یا میلادی درج‌شده در مدارک خودرو"}</span>
    <span class="field-error" id="${name}-error"></span>
    <span class="visually-hidden" id="${name}-suggestions-status" role="status" aria-live="polite" aria-atomic="true"></span>
  </div>`;
}
function closeVehiclePicker() {
  if (!vehiclePicker.name) return;
  const name = vehiclePicker.name;
  const input = document.getElementById(`vehicle-${name}`);
  input?.setAttribute("aria-expanded", "false");
  input?.removeAttribute("aria-activedescendant");
  const popup = document.getElementById(`vehicle-${name}-popup`);
  if (popup) popup.hidden = true;
  document.querySelector(`[data-vehicle-toggle="${name}"]`)?.setAttribute("aria-expanded", "false");
  vehiclePicker.name = null;
  vehiclePicker.active = -1;
  vehiclePicker.options = [];
  vehiclePicker.browseYears = false;
}
function openVehiclePicker(name) {
  const input = document.getElementById(`vehicle-${name}`);
  if (!input) return;
  if (vehiclePicker.name !== name) {
    closeVehiclePicker();
    vehiclePicker.name = name;
    if (name === "year") vehiclePicker.calendar = /^(1[89]|2)/.test(normalizeDigits(input.value)) ? "gregory" : "persian";
  }
  input.setAttribute("aria-expanded", "true");
  document.querySelector(`[data-vehicle-toggle="${name}"]`)?.setAttribute("aria-expanded", "true");
  document.getElementById(`vehicle-${name}-popup`).hidden = false;
  updateVehicleSuggestions();
}
function updateVehicleSuggestions() {
  const name = vehiclePicker.name;
  if (!name) return;
  const input = document.getElementById(`vehicle-${name}`);
  const list = document.getElementById(`vehicle-${name}-list`);
  const query = input.value.trim();
  vehiclePicker.active = -1;
  input.removeAttribute("aria-activedescendant");
  if (name === "model") {
    const matches = vehicleMatches(query);
    vehiclePicker.options = matches.map(vehicle => ({ value: vehicle.label, label: vehicle.label }));
    document.getElementById("vehicle-model-caption").textContent = query ? `${formatNumber(matches.length)} پیشنهاد` : "خودروهای رایج؛ برای پیدا کردن مدل، تایپ کنید";
    const manual = document.querySelector("[data-vehicle-manual]");
    manual.hidden = !query || matches.some(vehicle => normalizeSearch(vehicle.label) === normalizeSearch(query));
    manual.textContent = `ثبت دستی «${query}»`;
  } else {
    vehiclePicker.options = yearOptions(vehiclePicker.browseYears ? "" : query, vehiclePicker.calendar).map(year => ({ value: year, label: persianDigits(year) }));
    document.querySelectorAll("[data-vehicle-calendar]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.vehicleCalendar === vehiclePicker.calendar)));
  }
  list.innerHTML = vehiclePicker.options.length ? vehiclePicker.options.map((option, index) => `<div id="vehicle-${name}-option-${index}" class="vehicle-combo-option" role="option" aria-selected="${normalizeSearch(option.value) === normalizeSearch(input.value)}" data-vehicle-option="${index}"><span>${safeText(option.label)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></div>`).join("") : `<p class="vehicle-combo-empty">${name === "model" ? "خودرویی پیدا نشد. می‌توانید نام خودرو را دستی ثبت کنید." : "سالی پیدا نشد؛ عدد یا تقویم انتخاب‌شده را بررسی کنید."}</p>`;
  list.scrollTop = 0;
  document.getElementById(`${name}-suggestions-status`).textContent = `${formatNumber(vehiclePicker.options.length)} پیشنهاد ${name === "model" ? "خودرو" : "سال ساخت"} موجود است.`;
}
function selectVehicleSuggestion(index) {
  const option = vehiclePicker.options[index];
  if (!option) return;
  const name = vehiclePicker.name;
  const input = document.getElementById(`vehicle-${name}`);
  state.vehicle[name] = option.value;
  input.value = name === "year" ? persianDigits(option.value) : option.value;
  input.removeAttribute("aria-invalid");
  document.getElementById(`${name}-error`).textContent = "";
  document.querySelector(`[data-vehicle-clear="${name}"]`).hidden = false;
  input.focus({ preventScroll: true });
  closeVehiclePicker();
  saveInspection();
}
function vehiclePickerKeydown(event) {
  if (event.isComposing) return;
  const name = event.target.name;
  if (event.key === "Escape") {
    if (event.key === "Escape" && vehiclePicker.name) event.preventDefault();
    closeVehiclePicker();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
  if (event.key === "Enter") {
    if (vehiclePicker.name === name && vehiclePicker.active >= 0) {
      event.preventDefault(); selectVehicleSuggestion(vehiclePicker.active);
    } else if (vehiclePicker.name === name) {
      // Enter accepts the typed value first, without accidentally submitting.
      event.preventDefault(); closeVehiclePicker();
    }
    return;
  }
  event.preventDefault();
  if (vehiclePicker.name !== name) openVehiclePicker(name);
  const count = vehiclePicker.options.length;
  if (!count) return;
  const next = vehiclePicker.active < 0 ? (event.key === "ArrowDown" ? 0 : count - 1) : (vehiclePicker.active + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
  vehiclePicker.active = next;
  document.querySelectorAll(`#vehicle-${name}-list [role="option"]`).forEach((option, index) => option.classList.toggle("is-active", index === next));
  const option = document.getElementById(`vehicle-${name}-option-${next}`);
  event.target.setAttribute("aria-activedescendant", option.id);
  option.scrollIntoView({ block: "nearest" });
}

function blankInspection() {
  const items = {};
  CATEGORIES.forEach(category => category.items.forEach(([id]) => {
    items[`${category.id}.${id}`] = { condition: null, note: "" };
  }));
  return {
    schemaVersion: SCHEMA_VERSION, id: null, ownerMobile: null, step: "setup", complete: false,
    createdAt: null, updatedAt: null,
    vehicle: { model: "", year: "", mileage: "", color: "", vin: "", plate: "", plateParts: { first: "", letter: "", serial: "", region: "" }, inspector: INSPECTOR_NAME, date: "" },
    items
  };
}
function hasInspectionData(record) {
  const v = record.vehicle;
  return [v.model, v.year, v.mileage, v.plate, ...Object.values(v.plateParts)].some(value => String(value).trim())
    || Object.values(record.items).some(item => item.condition || item.note || item.noteDraft);
}
function ensureInspectionIdentity(record, mobile) {
  if (record.id) return;
  const created = new Date();
  record.id = generateId();
  record.createdAt = created.toISOString();
  record.vehicle.date = localISODate(created);
  record.ownerMobile = mobile;
}
function releaseSetupDraft() {
  if (auth && state.id && database.drafts[auth.mobile] === state) {
    database.drafts[auth.mobile] = blankInspection();
    database.drafts[auth.mobile].ownerMobile = auth.mobile;
  }
}
function localISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inspectionDate(record) {
  const created = record.createdAt && new Date(record.createdAt);
  return created && !Number.isNaN(created.getTime()) ? localISODate(created) : record.vehicle.date;
}
function normalizeDigits(value) {
  return String(value).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
}
function normalizeSearch(value) {
  return normalizeDigits(String(value ?? "").normalize("NFKC")).toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[\p{M}\p{P}\p{Z}\p{Cf}\s\u0640]/gu, "");
}
function persianDigits(value) { return String(value).replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]); }
function parsePlate(value) {
  const normalized = normalizeDigits(value).replace(/ایران|[\s\-–—|]/g, "");
  const match = normalized.match(/^(\d{2})([^\d]+)(\d{3})(\d{2})$/u);
  return match && PLATE_LETTERS.includes(match[2]) ? { first: match[1], letter: match[2], serial: match[3], region: match[4] } : null;
}
function plateText(parts) {
  return parts.first && parts.letter && parts.serial && parts.region
    ? `${persianDigits(parts.first)} ${parts.letter} ${persianDigits(parts.serial)} ایران ${persianDigits(parts.region)}` : "";
}
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
function sanitizeInspection(data) {
  const empty = blankInspection();
  if (!data || typeof data !== "object") return empty;
    const vehicle = data.vehicle || {};
    Object.keys(empty.vehicle).forEach(key => {
      if (typeof vehicle[key] === "string") empty.vehicle[key] = vehicle[key].slice(0, 250);
    });
    const savedParts = vehicle.plateParts;
    if (savedParts && typeof savedParts === "object") {
      for (const [key, length] of Object.entries({ first: 2, serial: 3, region: 2 })) {
        empty.vehicle.plateParts[key] = normalizeDigits(savedParts[key] ?? "").replace(/\D/g, "").slice(0, length);
      }
      empty.vehicle.plateParts.letter = PLATE_LETTERS.includes(savedParts.letter) ? savedParts.letter : "";
    } else if (empty.vehicle.plate) {
      empty.vehicle.plateParts = parsePlate(empty.vehicle.plate) || empty.vehicle.plateParts;
    }
    Object.keys(empty.items).forEach(key => {
      const item = data.items?.[key];
      if (!item || typeof item !== "object") return;
      empty.items[key].condition = Object.hasOwn(CONDITIONS, item.condition) ? item.condition : null;
      empty.items[key].note = typeof item.note === "string" ? item.note.slice(0, 250) : "";
      if (typeof item.noteDraft === "string") empty.items[key].noteDraft = item.noteDraft.slice(0, 250);
    });
    empty.id = typeof data.id === "string" ? data.id.slice(0, 80) : null;
    empty.ownerMobile = typeof data.ownerMobile === "string" ? data.ownerMobile.slice(0, 20) : null;
    empty.createdAt = typeof data.createdAt === "string" ? data.createdAt : null;
    empty.updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
    empty.step = data.step === "report" || data.step === "setup" || CATEGORIES.some(c => c.id === data.step) ? data.step : "setup";
    if (!empty.id) empty.step = "setup";
    if (empty.step === "report" && !isComplete(empty)) empty.step = "body";
    if (data.provenance === "user_description") {
      empty.provenance = "user_description";
      empty.additionalNotes = Array.isArray(data.additionalNotes) ? data.additionalNotes.filter(n => typeof n === "string").slice(0, 20).map(n => n.slice(0, 500)) : [];
      empty.sourceHistory = Array.isArray(data.sourceHistory) ? data.sourceHistory.slice(0, 100).filter(h => typeof h?.text === "string").map(h => ({ text: h.text.slice(0, 6000), recordedAt: typeof h.recordedAt === "string" ? h.recordedAt.slice(0, 40) : "" })) : [];
    }
    empty.version = Number.isInteger(data.version) ? data.version : 0;
    empty.complete = isComplete(empty);
    return empty;
}
function loadDatabase() {
  const empty = { schemaVersion: SCHEMA_VERSION, inspections: [], drafts: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.inspections)) {
        return empty;
      }
      const seen = new Set();
      empty.inspections = data.inspections.map(sanitizeInspection).filter(record => {
        if (!record.id || seen.has(record.id)) return false;
        seen.add(record.id); return true;
      });
      if (data.drafts && typeof data.drafts === "object") {
        Object.entries(data.drafts).forEach(([mobile, draft]) => {
          if (/^09\d{9}$/.test(mobile)) {
            const clean = sanitizeInspection(draft);
            clean.ownerMobile = mobile;
            empty.drafts[mobile] = empty.inspections.find(record => record.id === clean.id && record.ownerMobile === mobile) || clean;
          }
        });
      } else if (data.draft) empty.drafts._legacy = sanitizeInspection(data.draft);
      return empty;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      if (old?.schemaVersion === 1) {
        const record = sanitizeInspection(old);
        if (record.id) empty.inspections.push(record);
        else empty.drafts._legacy = record;
      }
    }
  } catch (_) {
    storageError = true;
  }
  return empty;
}
function getDraft(mobile) {
  if (!database.drafts[mobile]) database.drafts[mobile] = blankInspection();
  database.drafts[mobile].ownerMobile = mobile;
  return database.drafts[mobile];
}
function saveActiveView() {
  if (!auth) return;
  try {
    const views = JSON.parse(localStorage.getItem(ACTIVE_VIEW_KEY) || "{}");
    const savedViews = views && typeof views === "object" && !Array.isArray(views) ? views : {};
    savedViews[auth.mobile] = {
      screen,
      homeTab,
      inspectionId: state.id || null,
      workflowOrigin,
      reportOrigin
    };
    localStorage.setItem(ACTIVE_VIEW_KEY, JSON.stringify(savedViews));
  } catch (_) { storageError = true; }
}
function restoreActiveView() {
  if (!auth) return;
  state = getDraft(auth.mobile);
  screen = "home";
  homeTab = "new";
  try {
    const views = JSON.parse(localStorage.getItem(ACTIVE_VIEW_KEY) || "{}");
    const view = views?.[auth.mobile];
    if (!view || typeof view !== "object") return;
    homeTab = view.homeTab === "history" ? "history" : "new";
    workflowOrigin = view.workflowOrigin === "history" ? "history" : "new";
    reportOrigin = view.reportOrigin === "history" ? "history" : "workflow";
    if (view.screen === "home") return;
    if (view.screen === "profile") { screen = "profile"; return; }
    const record = typeof view.inspectionId === "string"
      ? database.inspections.find(item => item.id === view.inspectionId && item.ownerMobile === auth.mobile)
      : null;
    if (view.screen === "workflow") {
      if (record) state = record;
      else if (view.inspectionId) return;
      screen = "workflow";
    } else if (record && view.screen === "detail") {
      state = record; screen = "detail";
    } else if (record && view.screen === "report" && isComplete(record)) {
      state = record; screen = "report";
    }
  } catch (_) { /* A damaged view must not hide saved inspections. */ }
}
function claimLegacyRecords(mobile) {
  let changed = false;
  database.inspections.forEach(record => { if (!record.ownerMobile) { record.ownerMobile = mobile; changed = true; } });
  if (database.drafts._legacy && !database.drafts[mobile]) {
    database.drafts[mobile] = database.drafts._legacy;
    database.drafts[mobile].ownerMobile = mobile;
    delete database.drafts._legacy; changed = true;
  }
  const draft = database.drafts[mobile];
  if (draft && hasInspectionData(draft) && !database.inspections.some(record => record.id === draft.id)) {
    ensureInspectionIdentity(draft, mobile);
    database.inspections.unshift(draft);
    changed = true;
  }
  if (changed) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(database)); } catch (_) { storageError = true; }
  }
}
function saveInspection() {
  if (!state.id && hasInspectionData(state)) ensureInspectionIdentity(state, auth?.mobile || null);
  state.updatedAt = new Date().toISOString();
  state.complete = isComplete(state);
  try {
    if (state.id) {
      const index = database.inspections.findIndex(record => record.id === state.id);
      if (index < 0) database.inspections.unshift(state);
      else database.inspections[index] = state;
    } else database.drafts[auth?.mobile || "_legacy"] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    storageError = false;
    saveActiveView();
    if (window.AutoLMApi && auth && state.id) queueServerSave(state);
  } catch (_) {
    storageError = true;
    if (window.AutoLMApi && auth && state.id) queueServerSave(state);
    notify("ذخیرهٔ پشتیبان مرورگر انجام نشد؛ وضعیت ثبت روی سرور را بررسی کنید.");
  }
}
function formatNumber(value) { return numberFormatter.format(value); }
const MILEAGE_MAX = 9999999;
const MILEAGE_STEP = 10000;
const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
function threeDigitWords(value) {
  const parts = [];
  if (value >= 100) parts.push(HUNDREDS[Math.floor(value / 100)]);
  value %= 100;
  if (value >= 10 && value < 20) parts.push(TEENS[value - 10]);
  else {
    if (value >= 20) parts.push(TENS[Math.floor(value / 10)]);
    if (value % 10) parts.push(ONES[value % 10]);
  }
  return parts.join(" و ");
}
function mileageWords(value) {
  if (!/^\d+$/.test(value) || Number(value) > MILEAGE_MAX) return "مقدار کارکرد را به‌صورت عدد وارد کنید";
  const number = Number(value);
  if (number === 0) return "صفر کیلومتر";
  const parts = [];
  const millions = Math.floor(number / 1000000);
  const thousands = Math.floor(number / 1000) % 1000;
  const remainder = number % 1000;
  if (millions) parts.push(`${threeDigitWords(millions)} میلیون`);
  if (thousands) parts.push(`${threeDigitWords(thousands)} هزار`);
  if (remainder) parts.push(threeDigitWords(remainder));
  return `${parts.join(" و ")} کیلومتر`;
}
function mileageField(value) {
  const digits = normalizeDigits(value).replace(/[\s,٬]/g, "");
  const valid = /^\d+$/.test(digits) && Number(digits) <= MILEAGE_MAX;
  const atZero = digits === "" || (valid && Number(digits) === 0);
  return `<div class="field mileage-field" role="group" aria-labelledby="mileage-label">
    <span class="field-label" id="mileage-label">کارکرد خودرو</span>
    <div class="mileage-control" dir="ltr">
      <button class="mileage-button mileage-minus" type="button" data-mileage-step="-${MILEAGE_STEP}" aria-label="کاهش کارکرد به اندازهٔ ده هزار کیلومتر" ${atZero ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/></svg></button>
      <span class="mileage-unit" dir="ltr">km</span>
      <input class="mileage-input" type="text" name="mileage" inputmode="numeric" dir="ltr" value="${safeText(valid ? formatNumber(Number(digits)) : persianDigits(value))}" placeholder="۰" aria-label="کارکرد خودرو به کیلومتر" aria-describedby="mileage-words mileage-error">
      <button class="mileage-button mileage-plus" type="button" data-mileage-step="${MILEAGE_STEP}" aria-label="افزایش کارکرد به اندازهٔ ده هزار کیلومتر" ${valid && Number(digits) + MILEAGE_STEP > MILEAGE_MAX ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4v16"/></svg></button>
    </div>
    <span class="mileage-words" id="mileage-words" aria-live="polite">${valid ? mileageWords(digits) : "مقدار کارکرد به حروف نمایش داده می‌شود"}</span>
    <span class="field-error" id="mileage-error"></span>
  </div>`;
}
function formatMileageInput(input, inputType) {
  const raw = normalizeDigits(input.value);
  const digits = raw.replace(/[\s,٬]/g, "");
  if (!/^\d+$/.test(digits) || Number(digits) > MILEAGE_MAX) return;
  const formatted = formatNumber(Number(digits));
  if (input.value === formatted) return;
  // Anchor both ends of the selection to digits so grouping does not move the caret.
  const position = offset => {
    let remaining = raw.slice(offset).replace(/\D/g, "").length;
    let cursor = formatted.length;
    while (cursor > 0 && remaining > 0) {
      if (/\d/.test(normalizeDigits(formatted[--cursor]))) remaining--;
    }
    if (inputType === "deleteContentBackward" && /[,٬]/.test(formatted[cursor - 1] || "")) cursor--;
    return cursor;
  };
  const start = position(input.selectionStart);
  const end = position(input.selectionEnd);
  const direction = input.selectionDirection;
  input.value = formatted;
  input.setSelectionRange(start, end, direction);
}
function updateMileageDisplay() {
  const input = document.querySelector('#vehicle-form [name="mileage"]');
  if (!input) return;
  const digits = normalizeDigits(input.value).replace(/[\s,٬]/g, "");
  const valid = /^\d+$/.test(digits) && Number(digits) <= MILEAGE_MAX;
  document.getElementById("mileage-words").textContent = digits ? mileageWords(digits) : "مقدار کارکرد به حروف نمایش داده می‌شود";
  document.querySelector(".mileage-minus").disabled = digits === "" || (valid && Number(digits) === 0);
  document.querySelector(".mileage-plus").disabled = valid && Number(digits) + MILEAGE_STEP > MILEAGE_MAX;
}
function parseISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
function formatDate(iso) {
  const date = parseISODate(iso);
  if (!date) return "—";
  try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone:"UTC", year:"numeric", month:"long", day:"numeric" }).format(date); }
  catch (_) { return new Intl.DateTimeFormat("fa-IR", { timeZone:"UTC" }).format(date); }
}
function caseNumber(record) {
  const date = parseISODate(inspectionDate(record));
  if (!date) return "—";
  try {
    const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone:"UTC", year:"numeric", month:"2-digit", day:"2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(part => ["year", "month", "day"].includes(part.type)).map(part => [part.type, normalizeDigits(part.value)]));
    return persianDigits(`${values.year}${values.month.padStart(2, "0")}${values.day.padStart(2, "0")}`);
  } catch (_) {
    return "—";
  }
}
function progress() {
  let answered = 0;
  Object.values(state.items).forEach(item => { if (item.condition) answered++; });
  return { answered, total: 16, percent: Math.round(answered / 16 * 100) };
}
function isComplete(record) {
  return Object.values(record.items).length === 16 && Object.values(record.items).every(item => Boolean(item.condition));
}
function categoryScore(category, record = state) {
  const values = category.items.map(([id]) => record.items[`${category.id}.${id}`].condition);
  if (values.some(value => !value)) return null;
  return values.reduce((sum, value) => sum + CONDITIONS[value].points, 0) / values.length;
}
function finalScore(record = state) {
  if (!isComplete(record)) return null;
  const raw = CATEGORIES.reduce((sum, category) => sum + categoryScore(category, record) * category.weight, 0);
  return Math.round(raw * 10) / 10;
}
function structuralFinding(record = state) {
  const condition = record.items?.["body.chassis"]?.condition;
  if (condition === "faulty") {
    return {
      condition,
      title: "یافتهٔ ساختاری با اولویت بالا",
      text: "وضعیت شاسی و ستون‌ها معیوب ثبت شده است. این یافته را جدا از امتیاز عددی بررسی کنید و پیش از تصمیم‌گیری، بازبینی حضوری متخصص بدنه و ساختار خودرو بگیرید."
    };
  }
  if (condition === "review") {
    return {
      condition,
      title: "ساختار بدنه نیازمند بررسی است",
      text: "برای وضعیت شاسی و ستون‌ها بررسی بیشتر ثبت شده است؛ امتیاز کل به‌تنهایی نتیجهٔ این بررسی را نشان نمی‌دهد."
    };
  }
  return null;
}
function structuralFindingMarkup(record = state) {
  const finding = structuralFinding(record);
  if (!finding) return "";
  return `<div class="score-risk score-risk-${finding.condition}" role="note"><strong>${finding.title}</strong><p>${finding.text}</p></div>`;
}
function interpretation(score, record = state) {
  const structure = structuralFinding(record);
  if (structure?.condition === "faulty") return "هشدار ساختاری؛ بازبینی تخصصی لازم است";
  if (score < 50) return structure?.condition === "review" ? "وضعیت ضعیف؛ بررسی ساختار هم لازم است" : "وضعیت ضعیف";
  if (structure?.condition === "review") return "ساختار بدنه نیازمند بررسی است";
  if (score >= 90) return "وضعیت عالی";
  if (score >= 75) return "وضعیت خوب";
  return "نیازمند بررسی";
}
function scoreTone(score, record = state) {
  const structure = structuralFinding(record);
  if (structure?.condition === "faulty") return "faulty";
  if (score < 50) return "faulty";
  if (structure?.condition === "review") return "review";
  if (score >= 75) return "healthy";
  return "review";
}
function firstIncomplete() {
  for (const category of CATEGORIES) {
    for (const [id] of category.items) {
      if (!state.items[`${category.id}.${id}`].condition) return { category: category.id, id };
    }
  }
  return null;
}
function incompleteCategories() {
  return CATEGORIES.map(category => ({
    category,
    remaining: category.items.filter(([id]) => !state.items[`${category.id}.${id}`].condition).length
  })).filter(entry => entry.remaining);
}
function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function brandLogo(className, size) {
  return `<img class="brand-logo ${className}" src="assets/auto-ml-logo.png" alt="لوگوی اتو ال‌ام" width="${size}" height="${size}" decoding="async">`;
}
function topBar(title, back = false) {
  return `<header class="topbar ${back ? "" : "home-topbar"}"><div class="topbar-inner">
    <div class="header-actions">${back ? `<button class="icon-control" type="button" data-action="back" aria-label="بازگشت"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>` : ""}
      <button class="icon-control" type="button" data-action="home" aria-label="خانه"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/></svg></button>
      ${back ? "" : `<button class="icon-control" type="button" data-action="profile" aria-label="مشخصات"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></button>`}</div>
    <div class="topbar-title ${back ? "" : "topbar-brand"}">${back ? "" : brandLogo("topbar-brand-logo", 36)}<strong>${title}</strong></div><div class="header-end"><button class="icon-control" type="button" data-action="logout" aria-label="خروج از حساب"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m4-12 4 4-4 4m4-4H8"/></svg></button></div>
  </div></header>`;
}
function actionBar(content, report = false) {
  return `<footer class="actionbar ${report ? "report-actions" : ""}"><div class="actionbar-inner">
    <div class="action-buttons">${content}</div>
  </div></footer>`;
}
function stageCard(step) {
  const index = Math.max(0, STAGES.findIndex(stage => stage.id === step));
  const percent = Math.round((index + 1) / STAGES.length * 100);
  return `<section class="card stage-card" aria-label="مراحل کارشناسی"><div class="stage-top"><strong>مرحله: ${formatNumber(index + 1)} از ${formatNumber(STAGES.length)}</strong><button type="button" class="stage-trigger" data-action="stages">مشاهده مراحل</button></div>
    <div class="progress-track" role="progressbar" aria-label="مرحلهٔ جاری" aria-valuenow="${index + 1}" aria-valuemin="1" aria-valuemax="${STAGES.length}"><div class="progress-fill" style="width:${percent}%"></div></div></section>`;
}
function setupContent() {
  const v = state.vehicle;
  return `<section class="card" aria-labelledby="vehicle-form-title"><h2 id="vehicle-form-title">اطلاعات خودرو</h2>
        <form id="vehicle-form" novalidate><div class="form-grid">
          ${vehicleComboField("model", v.model)}
          ${vehicleComboField("year", v.year)}
          <div class="vehicle-meta-row">
            ${mileageField(v.mileage)}
          </div>
          ${plateField(v)}
        </div></form>
      </section>
      ${state.id ? `<section class="card card-tight"><p class="muted">پاسخ‌های ثبت‌شده با ویرایش اطلاعات خودرو حفظ می‌شوند.</p></section>` : ""}`;
}
function renderSetup() {
  return `<div class="app-shell">${topBar("اطلاعات خودرو", true)}<main class="content stage-content">${stageCard("setup")}${setupContent()}</main>
    ${actionBar(`<button class="btn btn-primary btn-large btn-block" type="submit" form="vehicle-form">تأیید و ادامه</button>`)}</div>`;
}
function renderLogin() {
  const hint = localLoginHints ? `<aside class="local-login-hint" role="note"><strong>ورود محلی کارشناس</strong><span>نام کاربری: <bdi dir="ltr">${safeText(localLoginHints.username)}</bdi></span><span>رمز عبور: <bdi dir="ltr">${safeText(localLoginHints.password)}</bdi></span></aside>` : "";
  return `<div class="app-shell login-shell"><main class="content auth-content">${brandLogo("auth-brand", 112)}<p class="eyebrow">اتو ال‌ام</p><h1>ورود کارشناس</h1><p class="intro">با شماره موبایل و رمز عبوری که مدیر برای شما تعیین کرده است وارد شوید.</p>${hint}<section class="card"><form id="expert-login-form" novalidate><label class="field"><span class="field-label">شماره موبایل</span><input class="text-input" type="tel" inputmode="tel" autocomplete="username" name="mobile" dir="ltr" maxlength="11" value="${safeText(loginMobile)}"></label><label class="field"><span class="field-label">رمز عبور</span><input class="text-input" type="password" autocomplete="current-password" name="password" maxlength="128"></label><span class="field-error" id="expert-login-error" role="alert"></span></form></section><p class="small"><a href="/admin/" class="text-control">پنل مدیریت کارشناسان و پرونده‌ها</a></p></main><footer class="actionbar"><div class="actionbar-inner"><button class="btn btn-primary btn-large btn-block" type="submit" form="expert-login-form">ورود به اتو ال‌ام</button></div></footer></div>`;
}
function renderHome() {
  state = getDraft(auth.mobile);
  const newTab = homeTab === "new";
  return `<div class="app-shell">${topBar("اتو ال‌ام")}
    <main class="content home-content ${newTab ? "" : "no-action"}">
      <div class="tab-bar" role="tablist" aria-label="بخش‌های اتو ال‌ام"><button type="button" role="tab" class="tab" data-tab="new" aria-selected="${newTab}">ثبت کارشناسی جدید</button><button type="button" role="tab" class="tab" data-tab="history" aria-selected="${!newTab}">کارشناسی‌های قبلی</button></div>
      ${newTab ? `${stageCard("setup")}${setupContent()}` : renderHistory()}
    </main>${newTab ? actionBar(`<button class="btn btn-primary btn-large btn-block" type="submit" form="vehicle-form">تأیید و ادامه</button>`) : ""}</div>`;
}
function importedReportContext(record) {
  if (record.provenance !== "user_description") return "";
  return `<section class="card"><h2>گزارش به روایت کاربر</h2><p>وضعیت‌ها از توضیحات ثبت‌شده تهیه شده‌اند و تأیید بازدید حضوری نیستند.</p>${record.additionalNotes?.length ? `<h3>سایر گفته‌های کاربر، خارج از امتیاز فرم</h3><ul>${record.additionalNotes.map(n => `<li>${safeText(n)}</li>`).join("")}</ul>` : ""}${record.sourceHistory?.length ? `<h3>متن و سابقه توضیحات کاربر</h3>${record.sourceHistory.map(h => `<p class="small">${safeText(h.text)}</p>`).join("")}` : ""}</section>`;
}
function renderHistory() {
  const records = database.inspections.filter(record => record.ownerMobile === auth.mobile).sort((a,b) => {
    const order = String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    return historySort === "oldest" ? -order : order;
  });
  if (!records.length) return `<section class="card empty-state"><img class="empty-state-image" src="assets/empty-state.png" alt="" width="160" height="160"><h2>هنوز کارشناسی ثبت نشده است</h2><p class="muted">بعد از شروع اولین کارشناسی، پیش‌نویس و گزارش آن در اینجا دیده می‌شود.</p><button class="btn btn-outline" type="button" data-tab="new">ثبت کارشناسی جدید</button></section>`;
  const query = normalizeSearch(historySearch);
  const matchedCount = records.filter(record => historyRecordMatches(record, query)).length;
  return `<section class="history-section" aria-label="جست‌وجو و فهرست کارشناسی‌ها">
    <section class="card history-tools" aria-label="جست‌وجو و فیلتر کارشناسی‌ها">
      <label class="history-search-label" for="history-search">جست‌وجو بر اساس خودرو، پلاک یا شمارهٔ پرونده</label>
      <div class="history-search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input id="history-search" class="text-input history-search-input" type="search" value="${safeText(historySearch)}" placeholder="مثلاً پراید یا ۱۴۰۵۰۸۰۱" autocomplete="off" aria-label="جست‌وجو با نام خودرو، شماره پلاک یا شمارهٔ پرونده"><button type="button" class="history-search-clear" data-history-clear aria-label="پاک کردن جست‌وجو" ${historySearch ? "" : "hidden"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <div class="history-filter-bar"><div class="history-chips" role="group" aria-label="فیلتر وضعیت کارشناسی‌ها"><button type="button" class="filter-chip" data-history-status="all" aria-pressed="${historyStatusFilter === "all"}">همه</button><button type="button" class="filter-chip" data-history-status="draft" aria-pressed="${historyStatusFilter === "draft"}">پیش‌نویس</button><button type="button" class="filter-chip" data-history-status="complete" aria-pressed="${historyStatusFilter === "complete"}">تکمیل‌شده</button></div><button type="button" class="history-advanced-filter" data-history-filter aria-haspopup="dialog" aria-label="مرتب‌سازی کارشناسی‌ها"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4"/></svg><span>مرتب‌سازی</span></button></div>
      ${historySort === "oldest" ? `<p class="history-sort-note">مرتب‌سازی: قدیمی‌ترین</p>` : ""}
    </section>
    <div id="history-results" aria-live="polite">${records.map(record => {
    const complete = isComplete(record);
    const plate = record.vehicle.plate || plateText(record.vehicle.plateParts || {});
    const reference = caseNumber(record);
    const searchValues = historySearchValues(record);
    const timestamp = Date.parse(record.updatedAt || record.createdAt || "") || 0;
    const matches = historyRecordMatches(record, query);
    return `<article class="card history-card" data-history-card data-history-search="${safeText(JSON.stringify(searchValues))}" data-history-complete="${complete}" data-history-time="${timestamp}" ${matches ? "" : "hidden"}>
      <div class="history-heading">
        <div class="history-title">
          <button type="button" class="history-open" data-record="${safeText(record.id)}">${safeText(record.vehicle.model || "خودرو بدون نام")}</button>
        </div>
        <button type="button" class="history-chevron" data-record="${safeText(record.id)}" aria-label="بازکردن پروندهٔ ${safeText(record.vehicle.model || "خودرو")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button>
      </div>
      <div class="history-case-number">
        <span class="history-case-reference">شماره پرونده <bdi>${reference}</bdi></span>
        ${plate ? `<span class="history-plate"><span class="history-separator" aria-hidden="true">|</span><span>پلاک: <bdi>${safeText(plate)}</bdi></span></span>` : ""}
      </div>
      <div class="history-footer">
        <span class="history-status ${complete ? "history-status-complete" : "history-status-draft"}">${complete ? "تکمیل‌شده" : "پیش‌نویس"}</span>
        <button type="button" class="btn btn-secondary history-pdf" data-pdf="${safeText(record.id)}" aria-label="دانلود PDF ${safeText(record.vehicle.model || "خودرو")}" ${complete ? "" : "disabled"}>دانلود PDF</button>
      </div>
    </article>`;
  }).join("")}<div class="history-no-results card" id="history-no-results" ${matchedCount ? "hidden" : ""}><strong>نتیجه‌ای پیدا نشد</strong><p class="muted">عبارت جست‌وجو یا فیلتر وضعیت را تغییر دهید.</p><button class="btn btn-secondary" type="button" data-history-reset>پاک‌کردن جست‌وجو و فیلترها</button></div></div></section>`;
}
function historySearchValues(record) {
  const plate = record.vehicle.plate || plateText(record.vehicle.plateParts || {});
  const parts = parsePlate(plate);
  const compactPlate = normalizeSearch(plate).replace(/ایران/g, "");
  // Keep fields separate so the end of one cannot match the start of another.
  return [record.vehicle.model || "خودرو بدون نام", caseNumber(record),
    parts ? plateText(parts) : plate, compactPlate, compactPlate.replace(/\D/g, "")]
    .map(normalizeSearch).filter(Boolean);
}
function historyTextMatches(values, query) {
  return !query || values.some(value => value.includes(query));
}
function historyRecordMatches(record, query = normalizeSearch(historySearch)) {
  const complete = isComplete(record);
  if (historyStatusFilter === "complete" && !complete) return false;
  if (historyStatusFilter === "draft" && complete) return false;
  return historyTextMatches(historySearchValues(record), query);
}
function updateHistoryResults() {
  const section = document.querySelector(".history-section");
  if (!section) return;
  const query = normalizeSearch(historySearch);
  let visible = 0;
  document.querySelectorAll("[data-history-card]").forEach(card => {
    const statusMatches = historyStatusFilter === "all" || (historyStatusFilter === "complete" ? card.dataset.historyComplete === "true" : card.dataset.historyComplete === "false");
    const textMatches = historyTextMatches(JSON.parse(card.dataset.historySearch), query);
    card.hidden = !(statusMatches && textMatches);
    if (!card.hidden) visible++;
  });
  const noResults = document.getElementById("history-no-results");
  const clearButton = document.querySelector("[data-history-clear]");
  if (noResults) noResults.hidden = visible > 0;
  if (clearButton) clearButton.hidden = !historySearch;
  document.querySelectorAll("[data-history-status]").forEach(chip => chip.setAttribute("aria-pressed", String(chip.dataset.historyStatus === historyStatusFilter)));
}
function renderHistoryDetail() {
  const v = state.vehicle;
  const p = progress();
  return `<div class="app-shell">${topBar("جزئیات کارشناسی", true)}<main class="content"><section class="card"><h1>${safeText(v.model || "خودرو")}</h1><dl class="info-list">${info("تاریخ کارشناسی", formatDate(inspectionDate(state)))}${info("نام کارشناس", v.inspector || INSPECTOR_NAME)}${info("شماره پرونده", caseNumber(state))}${info("شماره پلاک", v.plate)}</dl></section>
    <section class="card"><h2>وضعیت بررسی</h2><p>${formatNumber(p.answered)} از ۱۶ مورد بررسی شده است.</p><p class="muted">برای دریافت گزارش و PDF، همهٔ موارد را تکمیل کنید.</p></section>
    ${importedReportContext(state)}${CATEGORIES.map(category => `<section class="card report-section"><h2 class="category-heading">${categoryIcon(category.id)}<span>${category.name}</span></h2>${category.items.map(([id, label]) => {
      const item = state.items[`${category.id}.${id}`];
      const condition = item.condition ? CONDITIONS[item.condition] : null;
      return `<div class="result-row"><div class="result-main"><strong>${label}</strong>${item.note ? `<p>یادداشت کارشناس: ${safeText(item.note)}</p>` : ""}</div><span class="badge ${item.condition ? `badge-${item.condition}` : "badge-empty"}">${condition ? `${conditionIcon(item.condition)}${condition.label}` : "ثبت نشده"}</span></div>`;
    }).join("")}</section>`).join("")}</main>
    ${actionBar(`<button class="btn btn-primary btn-large btn-block" type="button" data-action="resume">ادامه کارشناسی</button>`)}</div>`;
}
function plateField(vehicle) {
  const parts = vehicle.plateParts || parsePlate(vehicle.plate) || { first: "", letter: "", serial: "", region: "" };
  return `<div class="field field-wide plate-field" role="group" aria-labelledby="plate-label">
    <span class="field-label" id="plate-label">شماره پلاک</span>
    <div class="iran-plate" dir="ltr">
      <img class="plate-flag-panel" src="assets/iran-plate-band.png" alt="" aria-hidden="true">
      <span class="plate-spacer" aria-hidden="true"></span>
      <input class="plate-box plate-first" data-plate-part="first" inputmode="numeric" pattern="[0-9۰-۹]*" maxlength="2" dir="ltr" aria-label="دو رقم اول پلاک" placeholder="--" value="${safeText(persianDigits(parts.first))}">
      <span class="plate-letter-wrap"><button type="button" id="plate-letter-trigger" class="plate-box plate-letter" data-plate-part="letter" value="${safeText(parts.letter)}" dir="rtl" aria-label="حرف پلاک${parts.letter ? `: ${safeText(parts.letter)}` : "؛ انتخاب کنید"}" aria-haspopup="dialog" aria-controls="plate-letter-sheet" aria-expanded="false"><span class="plate-letter-value" ${parts.letter ? "" : 'data-placeholder="true"'}>${safeText(parts.letter || "حرف")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></span>
      <input class="plate-box plate-serial" data-plate-part="serial" inputmode="numeric" pattern="[0-9۰-۹]*" maxlength="3" dir="ltr" aria-label="سه رقم میانی پلاک" placeholder="---" value="${safeText(persianDigits(parts.serial))}">
      <span class="plate-region-wrap"><span class="plate-region-label" aria-hidden="true">ایران</span><input class="plate-region-number" data-plate-part="region" inputmode="numeric" pattern="[0-9۰-۹]*" maxlength="2" dir="ltr" aria-label="کد دو رقمی ایران" placeholder="--" value="${safeText(persianDigits(parts.region))}"></span>
    </div>
    ${vehicle.plate && !parsePlate(vehicle.plate) && !plateText(parts) ? `<span class="field-hint">پلاک ثبت‌شدهٔ قبلی: ${safeText(vehicle.plate)}</span>` : ""}
  </div>`;
}
function itemControl(category, id, label) {
  const key = `${category.id}.${id}`;
  const item = state.items[key];
  return `<div class="item" id="item-${key}">
    <h3 class="item-title" id="label-${key}">${label}</h3>
    <div class="condition-group" role="radiogroup" aria-labelledby="label-${key}">
      ${Object.entries(CONDITIONS).map(([value, config]) => `<button type="button" role="radio" class="condition" data-key="${key}" data-value="${value}" aria-checked="${item.condition === value}" tabindex="${item.condition === value || (!item.condition && value === "healthy") ? 0 : -1}">${conditionIcon(value)}<span>${config.label}</span></button>`).join("")}
    </div>
    <button type="button" class="note-toggle ${item.note ? "has-note" : ""}" data-note-toggle="${key}" aria-haspopup="dialog" aria-label="${item.note ? "ویرایش یادداشت" : "افزودن یادداشت"} برای ${safeText(label)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
      <span>${item.note ? "ویرایش یادداشت" : "افزودن یادداشت"}</span>${item.note ? `<span class="note-saved">ثبت شده</span>` : ""}
    </button>
  </div>`;
}
function incompleteBanner() {
  const missing = incompleteCategories();
  return `<section class="banner" role="alert"><h2>گزارش هنوز آماده نیست</h2>
    <p>${formatNumber(16 - progress().answered)} مورد باقی مانده است. برای نمایش امتیاز، وضعیت همهٔ موارد را مشخص کنید.</p>
    <ul class="missing-list">${missing.map(({ category, remaining }) => `<li>${category.name}: ${formatNumber(remaining)} مورد</li>`).join("")}</ul>
    <button class="btn btn-outline" type="button" data-action="first-incomplete">رفتن به اولین مورد ناقص</button>
  </section>`;
}
function renderStep() {
  const index = CATEGORIES.findIndex(c => c.id === state.step);
  const category = CATEGORIES[index];
  return `<div class="app-shell">${topBar(`بررسی ${category.name}`, true)}
    <main class="content stage-content">${stageCard(category.id)}
      ${reportWarning ? incompleteBanner() : ""}
      <section class="card checklist-card" aria-labelledby="checklist-title"><div class="section-head checklist-card-head"><h2 id="checklist-title">موارد ${category.name}</h2><span class="checklist-count">${formatNumber(category.items.filter(([id]) => state.items[`${category.id}.${id}`].condition).length)} از ۴</span></div>
        ${category.items.map(([id, label]) => itemControl(category, id, label)).join("")}
      </section>
    </main>${actionBar(`<button class="btn btn-primary btn-large btn-block" type="button" data-action="next">تأیید و ادامه</button>`)}</div>`;
}
function reportSummaryIcon(type) {
  const icons = {
    vehicle: '<path d="m3 12 1.6-4.1A2 2 0 0 1 6.5 6.5h11a2 2 0 0 1 1.9 1.4L21 12v6h-2v-2H5v2H3z"/><path d="M4 12h16M7 16v-2m10 2v-2"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="12" r="1"/>',
    mileage: '<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 12 16.5 8M7 18h10"/><path d="M5.5 13H7m10 0h1.5M12 5.5V7"/>',
    plate: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4m-4 4h7m-7 3h3m6-7h2v4h-2z"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4m9-4v4M4 9h16m-12 4h2m3 0h2m-7 3h2m3 0h2"/>',
    reference: '<path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/><path d="M14 3.5v5h5M9 12h6m-6 3h6"/>',
    healthy: CONDITIONS.healthy.icon,
    review: CONDITIONS.review.icon,
    faulty: CONDITIONS.faulty.icon
  };
  return `<svg class="report-summary-icon icon-${type}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[type] || icons.reference}</svg>`;
}
function reportSummaryItem(icon, label, value, tone = "") {
  return `<div class="report-summary-item ${tone ? `summary-${tone}` : ""}">${reportSummaryIcon(icon)}<div class="report-summary-copy"><span>${label}</span><bdi>${safeText(value || "—")}</bdi></div></div>`;
}
function reportScoreMeter(value, label, showScale = false) {
  return `<div class="report-meter-wrap"><div class="progress-track report-meter" role="progressbar" aria-label="${safeText(label)}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${formatNumber(value)} از ۱۰۰"><div class="progress-fill" style="width:${value}%"></div></div>${showScale ? '<div class="report-meter-scale" aria-hidden="true"><span>۰</span><span>۵۰</span><span>۱۰۰</span></div>' : ""}</div>`;
}
function renderReport() {
  const score = finalScore();
  if (score === null) { state.step = "body"; reportWarning = true; return renderStep(); }
  const v = state.vehicle;
  const counts = { healthy:0, review:0, faulty:0 };
  Object.values(state.items).forEach(item => counts[item.condition]++);
  return `<div class="app-shell">${topBar("گزارش کارشناسی خودرو", true)}
    <main class="content report-content" id="print-report">
      <header class="report-header card">
        <div class="report-header-main">${brandLogo("report-brand-mark", 72)}<div class="report-header-title"><p class="eyebrow">اتو ال‌ام</p><h1>گزارش کارشناسی خودرو</h1></div><div class="report-header-actions"><span class="report-status">تکمیل‌شده</span><button class="icon-control report-edit no-print" type="button" data-action="edit" aria-label="ویرایش کارشناسی" title="ویرایش کارشناسی"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m16 3 5 5M4 15 16 3a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L9 20l-6 1 1-6Z"/></svg></button></div></div>
        <div class="report-header-meta"><div><span>شماره پرونده</span><bdi>${caseNumber(state)}</bdi></div><div><span>تاریخ کارشناسی</span><bdi>${formatDate(inspectionDate(state))}</bdi></div></div>
      </header>
      ${importedReportContext(state)}
      <div class="report-overview">
        <section class="card report-summary" aria-labelledby="report-summary-title"><h2 id="report-summary-title">خلاصه اطلاعات و وضعیت</h2><div class="report-summary-grid">
          ${reportSummaryItem("vehicle", "خودرو", `${v.model || "—"}${v.year ? ` · ${yearFormatter.format(Number(v.year))}` : ""}`)}
          ${reportSummaryItem("mileage", "کارکرد", v.mileage ? `${formatNumber(Number(v.mileage))} کیلومتر` : "—")}
          ${reportSummaryItem("plate", "شماره پلاک", v.plate || "—")}
          ${reportSummaryItem("healthy", "سالم", `${formatNumber(counts.healthy)} مورد`, "healthy")}
          ${reportSummaryItem("review", "نیاز به بررسی", `${formatNumber(counts.review)} مورد`, "review")}
          ${reportSummaryItem("faulty", "معیوب", `${formatNumber(counts.faulty)} مورد`, "faulty")}
          ${reportSummaryItem("person", "کارشناس", v.inspector || INSPECTOR_NAME)}
          ${reportSummaryItem("calendar", "تاریخ کارشناسی", formatDate(inspectionDate(state)))}
          ${reportSummaryItem("reference", "شماره پرونده", caseNumber(state))}
        </div></section>
        <section class="card score-card score-${scoreTone(score, state)}"><h2>شاخص وضعیت خودرو</h2><div class="score-number">${formatNumber(score)} <small>از ۱۰۰</small></div>
          <div class="score-label">${interpretation(score, state)}</div>
          ${reportScoreMeter(score, "شاخص وضعیت خودرو", true)}
          ${structuralFindingMarkup(state)}
        </section>
      </div>
      ${inspectionMap(state)}
      <section class="card category-scores-card"><h2>امتیاز بخش‌ها</h2><div class="category-score-grid">${CATEGORIES.map(category => {
        const value = categoryScore(category);
        const tone = value >= 75 ? "healthy" : value >= 50 ? "review" : "faulty";
        return `<div class="category-score meter-${tone}"><div class="category-score-top"><div class="category-score-heading">${categoryIcon(category.id)}<div><h3>${category.name}</h3><span class="category-score-weight">وزن ${formatNumber(category.weight * 100)}٪</span></div></div><div class="category-score-value"><bdi>${formatNumber(value)}</bdi><small>از ۱۰۰</small></div></div>${reportScoreMeter(value, `امتیاز ${category.name}`)}</div>`;
      }).join("")}</div></section>
      <section class="report-results" aria-labelledby="report-results-title"><h2 id="report-results-title">نتایج کامل بررسی</h2>${CATEGORIES.map(category => `<section class="card result-category"><h3 class="category-heading">${categoryIcon(category.id)}<span>${category.name}</span></h3>${category.items.map(([id, label]) => {
        const item = state.items[`${category.id}.${id}`];
        const condition = CONDITIONS[item.condition];
        return `<div class="result-row"><div class="result-main"><strong>${label}</strong>${item.note ? `<p>یادداشت کارشناس: ${safeText(item.note)}</p>` : ""}</div><span class="badge badge-${item.condition}">${conditionIcon(item.condition)}${condition.label}</span></div>`;
      }).join("")}</section>`).join("")}</section>
    </main>${actionBar(`<button class="btn btn-primary btn-large" type="button" data-action="download-pdf">دانلود PDF</button><button class="btn btn-text" type="button" data-action="new">شروع کارشناسی جدید</button>`, true)}</div>`;
}
function info(label, value) { return `<div><dt>${label}</dt><dd>${value ? safeText(value) : "—"}</dd></div>`; }
function renderProfile() {
  return `<div class="app-shell profile-page">
    <header class="topbar profile-topbar"><div class="topbar-inner">
      <button class="icon-control" type="button" data-action="back" aria-label="بازگشت"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>
      <h1 class="profile-page-title" id="profile-title" tabindex="-1">مشخصات</h1>
      <span aria-hidden="true"></span>
    </div></header>
    <main class="content profile-content" aria-labelledby="profile-title">
      <section class="card profile-summary" aria-labelledby="profile-name">
        <div class="profile-avatar" aria-hidden="true"><div class="profile-avatar-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg></div></div>
        <h2 id="profile-name">${safeText(INSPECTOR_NAME)}</h2>
        <p class="profile-role">کارشناس خودرو</p>
      </section>
      <section class="card profile-details" aria-labelledby="profile-details-title">
        <h2 id="profile-details-title">اطلاعات فردی</h2>
        <dl class="profile-fields">
          <div><dt>نام و نام خانوادگی</dt><dd>${safeText(INSPECTOR_NAME)}</dd></div>
          <div><dt>شماره موبایل</dt><dd><bdi id="profile-mobile" dir="ltr">${persianDigits(auth.mobile)}</bdi></dd></div>
        </dl>
      </section>
      <button class="profile-logout" type="button" data-action="logout"><span class="profile-logout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></svg></span><span>خروج از حساب</span><svg class="profile-logout-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    </main>
  </div>`;
}
function renderApp() {
  closeVehiclePicker();
  if (screen === "login") app.innerHTML = renderLogin();
  else if (screen === "home") app.innerHTML = renderHome();
  else if (screen === "profile") app.innerHTML = renderProfile();
  else if (screen === "detail") app.innerHTML = renderHistoryDetail();
  else if (screen === "report") app.innerHTML = renderReport();
  else if (state.step === "setup") app.innerHTML = renderSetup();
  else app.innerHTML = renderStep();
}
function navigate(step, targetId = null) {
  if (step !== "setup") releaseSetupDraft();
  state.step = step;
  screen = step === "report" ? "report" : "workflow";
  if (step !== "report") reportWarning = false;
  saveInspection(); saveActiveView(); renderApp();
  window.scrollTo(0, 0);
  if (targetId) requestAnimationFrame(() => document.getElementById(`item-${step}.${targetId}`)?.scrollIntoView({ block:"center" }));
}
function goHome(tab = "new") {
  releaseSetupDraft();
  saveInspection();
  screen = "home";
  homeTab = tab;
  reportWarning = false;
  state = getDraft(auth.mobile);
  saveActiveView();
  renderApp(); window.scrollTo(0, 0);
}
function openRecord(id) {
  const record = database.inspections.find(item => item.id === id && item.ownerMobile === auth.mobile);
  if (!record) { notify("کارشناسی پیدا نشد."); return; }
  state = record;
  workflowOrigin = "history";
  if (isComplete(record)) {
    screen = "report"; reportOrigin = "history"; saveActiveView(); renderApp(); window.scrollTo(0, 0);
  } else { screen = "detail"; saveActiveView(); renderApp(); window.scrollTo(0, 0); }
}
async function downloadReport(record, button) {
  if (!record || !isComplete(record)) { notify("گزارش پس از تکمیل کارشناسی آماده می‌شود."); return; }
  if (!window.AdminReport) { notify("امکان ساخت PDF فراهم نیست."); return; }
  if (button) button.disabled = true;
  notify("گزارش PDF در حال آماده‌سازی است…");
  try {
    await window.AdminReport.download(record, INSPECTOR_NAME || record.vehicle.inspector || "نام کارشناس ثبت نشده");
    notify("گزارش PDF آماده و برای دانلود ارسال شد.");
  } catch (_) {
    notify("ساخت PDF انجام نشد؛ دوباره تلاش کنید.");
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function openSteps() {
  const current = screen === "home" ? "setup" : state.step;
  const setupComplete = Boolean(state.id) && !Object.keys(validateVehicle()).length;
  document.getElementById("steps-content").innerHTML = `<ol class="sheet-steps">${STAGES.map((stage, index) => {
    const active = stage.id === current;
    const complete = stage.id === "setup" ? setupComplete : CATEGORIES.find(c => c.id === stage.id).items.every(([id]) => state.items[`${stage.id}.${id}`].condition);
    const disabled = !setupComplete && stage.id !== "setup";
    return `<li class="sheet-step ${active ? "active" : ""} ${complete ? "done" : ""}"><button type="button" data-sheet-step="${stage.id}" ${disabled ? "disabled" : ""} ${active ? `aria-current="step"` : ""}><span class="step-dot" aria-hidden="true"></span><span class="step-name">${stage.name}</span><span class="step-state">${active ? "مرحلهٔ جاری" : complete ? "تکمیل‌شده" : "در انتظار"}</span></button></li>`;
  }).join("")}</ol>`;
  stepsSheet.showModal();
}
function openProfile() {
  screen = "profile";
  saveActiveView();
  renderApp();
  window.scrollTo(0, 0);
  requestAnimationFrame(() => document.getElementById("profile-title")?.focus({ preventScroll: true }));
}
function openNoteSheet(key) {
  const [categoryId, itemId] = key.split(".");
  const category = CATEGORIES.find(entry => entry.id === categoryId);
  const item = category?.items.find(([id]) => id === itemId);
  if (!category || !item) return;
  editingNoteKey = key;
  document.getElementById("note-title").textContent = `${category.name} · ${item[1]}`;
  noteEditor.value = state.items[key].noteDraft ?? state.items[key].note;
  document.getElementById("note-count").textContent = `${formatNumber(noteEditor.value.length)} / ۲۵۰`;
  noteSheet.showModal();
  requestAnimationFrame(() => {
    noteEditor.focus({ preventScroll: true });
    noteEditor.setSelectionRange(noteEditor.value.length, noteEditor.value.length);
  });
}
function closeNoteSheet() {
  if (noteSheet.open) noteSheet.close();
  editingNoteKey = null;
}
function saveNote() {
  if (!editingNoteKey) return;
  const key = editingNoteKey;
  const scrollPosition = window.scrollY;
  state.items[key].note = noteEditor.value.slice(0, 250).trim();
  delete state.items[key].noteDraft;
  saveInspection();
  closeNoteSheet();
  renderApp();
  window.scrollTo(0, scrollPosition);
  requestAnimationFrame(() => document.querySelector(`[data-note-toggle="${key}"]`)?.focus({ preventScroll: true }));
}
function validateVehicle() {
  const errors = {};
  const v = state.vehicle;
  if (!v.model.trim()) errors.model = "نام و مدل خودرو را وارد کنید.";
  if (v.model.length > 100) errors.model = "نام خودرو باید کمتر از ۱۰۰ نویسه باشد.";
  if (v.year && (!/^\d{4}$/.test(normalizeDigits(v.year)) || Number(normalizeDigits(v.year)) < 1300 || Number(normalizeDigits(v.year)) > 2100)) errors.year = "سال ساخت را به‌صورت عدد چهاررقمی وارد کنید.";
  if (v.mileage && (!/^\d+$/.test(normalizeDigits(v.mileage)) || Number(normalizeDigits(v.mileage)) > 9999999)) errors.mileage = "کارکرد را به‌صورت عدد مثبت وارد کنید.";
  return errors;
}
function showVehicleErrors(errors) {
  document.querySelectorAll("#vehicle-form [name]").forEach(input => {
    const error = errors[input.name] || "";
    input.setAttribute("aria-invalid", String(Boolean(error)));
    const el = document.getElementById(`${input.name}-error`);
    if (el) el.textContent = error;
  });
  const first = Object.keys(errors)[0];
  if (first) document.querySelector(`#vehicle-form [name="${first}"]`)?.focus();
}
function generateId() {
  if (globalThis.crypto?.randomUUID) return `CC-${crypto.randomUUID().toUpperCase()}`;
  return `CC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
app.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "expert-login-form") {
    const form = event.target, mobile = normalizeDigits(form.elements.mobile.value).replace(/\s|-/g, "");
    const error = document.getElementById("expert-login-error");
    if (!/^09\d{9}$/.test(mobile)) { error.textContent = "شماره موبایل معتبر وارد کنید."; return; }
    loginMobile = mobile;
    const button = document.querySelector('[form="expert-login-form"]'); button.disabled = true;
    try {
      const result = await window.AutoLMApi.request("/api/auth/login", { method: "POST", body: JSON.stringify({ role: "expert", mobile, password: form.elements.password.value }) });
      await acceptExpertSession(result.user);
      notify("به اتو ال‌ام خوش آمدید.");
    } catch (failure) { error.textContent = failure.message; }
    finally { button.disabled = false; }
    return;
  }
  if (event.target.id !== "vehicle-form") return;
  closeVehiclePicker();
  const errors = validateVehicle(); showVehicleErrors(errors);
  if (Object.keys(errors).length) { notify("اطلاعات خودرو را بررسی کنید."); return; }
  const fresh = screen === "home";
  if (fresh) workflowOrigin = "new";
  state.vehicle.inspector = INSPECTOR_NAME;
  navigate("body");
  if (!fresh) notify("اطلاعات خودرو ذخیره شد.");
});
app.addEventListener("input", event => {
  const target = event.target;
  if (target.matches("#history-search")) {
    historySearch = target.value;
    updateHistoryResults();
    return;
  }
  if (target.matches("[data-plate-part]")) {
    updatePlatePart(target);
    return;
  }
  if (target.matches('[data-otp]')) {
    const digit = normalizeDigits(target.value).replace(/\D/g, "").slice(-1);
    target.value = digit;
    document.getElementById("otp-error").textContent = "";
    if (digit) document.querySelector(`[data-otp="${Number(target.dataset.otp) + 1}"]`)?.focus();
    return;
  }
  if (target.matches('#mobile-form [name="mobile"]')) {
    loginMobile = target.value;
    target.removeAttribute("aria-invalid"); document.getElementById("mobile-error").textContent = "";
    return;
  }
  if (target.matches("#vehicle-form [name]")) {
    const value = target.name === "year" || target.name === "mileage" ? normalizeDigits(target.value).replace(/[\s,٬]/g, "") : target.value;
    state.vehicle[target.name] = value;
    target.removeAttribute("aria-invalid");
    const error = document.getElementById(`${target.name}-error`);
    if (error) error.textContent = "";
    if (target.name === "mileage") {
      if (!event.isComposing) formatMileageInput(target, event.inputType);
      updateMileageDisplay();
    }
    if (target.matches('[role="combobox"]')) {
      document.querySelector(`[data-vehicle-clear="${target.name}"]`).hidden = !target.value;
      vehiclePicker.browseYears = false;
      if (target.name === "year" && target.value) vehiclePicker.calendar = /^(1[89]|2)/.test(normalizeDigits(target.value)) ? "gregory" : "persian";
      openVehiclePicker(target.name);
    }
    saveInspection();
  }
});
function updatePlatePart(target) {
  const key = target.dataset.platePart;
  if (!key || !Object.hasOwn(state.vehicle.plateParts, key)) return;
  if (key === "letter") state.vehicle.plateParts.letter = PLATE_LETTERS.includes(target.value) ? target.value : "";
  else {
    const length = key === "serial" ? 3 : 2;
    const digits = normalizeDigits(target.value).replace(/\D/g, "").slice(0, length);
    state.vehicle.plateParts[key] = digits;
    target.value = persianDigits(digits);
  }
  state.vehicle.plate = plateText(state.vehicle.plateParts);
  saveInspection();
}
function openPlateLetterPicker() {
  const trigger = document.getElementById("plate-letter-trigger");
  if (!trigger || plateLetterSheet.open) return;
  const parts = state.vehicle.plateParts;
  document.getElementById("plate-letter-preview").innerHTML = `<span class="plate-preview-band">I.R.</span><span>${safeText(persianDigits(parts.first) || "ــ")}</span><strong>${safeText(parts.letter || "؟")}</strong><span>${safeText(persianDigits(parts.serial) || "ـــ")}</span><span class="plate-preview-region"><small>ایران</small>${safeText(persianDigits(parts.region) || "ــ")}</span>`;
  document.getElementById("plate-letter-options").innerHTML = PLATE_LETTERS.map(letter => `<button type="button" role="option" class="plate-letter-option" data-plate-letter="${letter}" aria-label="حرف ${letter}" aria-selected="${parts.letter === letter}" tabindex="${letter === (parts.letter || PLATE_LETTERS[0]) ? "0" : "-1"}"><span>${letter}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8 2.5 2.5L12 5"/></svg></button>`).join("");
  document.getElementById("clear-plate-letter").disabled = !parts.letter;
  trigger.setAttribute("aria-expanded", "true");
  plateLetterSheet.showModal();
  plateLetterSheet.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
}
function selectPlateLetter(letter) {
  if (letter !== "" && !PLATE_LETTERS.includes(letter)) return;
  const trigger = document.getElementById("plate-letter-trigger");
  if (!trigger) { plateLetterSheet.close(); return; }
  trigger.value = letter;
  updatePlatePart(trigger);
  trigger.setAttribute("aria-label", letter ? `حرف پلاک: ${letter}` : "حرف پلاک؛ انتخاب کنید");
  const label = trigger.querySelector(".plate-letter-value");
  label.textContent = letter || "حرف";
  label.toggleAttribute("data-placeholder", !letter);
  plateLetterSheet.close();
}
app.addEventListener("focusout", event => {
  if (event.target.matches('#vehicle-form [name="mileage"]')) {
    const digits = normalizeDigits(event.target.value).replace(/[\s,٬]/g, "");
    if (/^\d+$/.test(digits) && Number(digits) <= MILEAGE_MAX) event.target.value = formatNumber(Number(digits));
  }
  if (event.target.matches("#vehicle-form [name], [data-plate-part]")) saveInspection();
});
app.addEventListener("keydown", event => {
  const target = event.target;
  if (target.matches('[role="combobox"]')) { vehiclePickerKeydown(event); return; }
  if (target.matches("#plate-letter-trigger") && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault(); openPlateLetterPicker(); return;
  }
  if (target.matches('[data-otp]') && event.key === "Backspace" && !target.value) {
    document.querySelector(`[data-otp="${Number(target.dataset.otp) - 1}"]`)?.focus();
    return;
  }
  if (!target.matches('[role="radio"][data-key]')) return;
  const values = Object.keys(CONDITIONS);
  const index = values.indexOf(target.dataset.value);
  let next;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % values.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + values.length - 1) % values.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = values.length - 1;
  else return;
  event.preventDefault();
  document.querySelector(`[data-key="${target.dataset.key}"][data-value="${values[next]}"]`)?.click();
});
app.addEventListener("paste", event => {
  if (!event.target.matches('[data-otp]')) return;
  const digits = normalizeDigits(event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
  if (!digits) return;
  event.preventDefault();
  [...document.querySelectorAll('[data-otp]')].forEach((input, index) => { input.value = digits[index] || ""; });
  document.querySelector(`[data-otp="${Math.min(digits.length, 3)}"]`)?.focus();
});
app.addEventListener("click", async event => {
  const vehicleOption = event.target.closest("[data-vehicle-option]");
  if (vehicleOption) { selectVehicleSuggestion(Number(vehicleOption.dataset.vehicleOption)); return; }
  const vehicleToggle = event.target.closest("[data-vehicle-toggle]");
  if (vehicleToggle) {
    const name = vehicleToggle.dataset.vehicleToggle;
    const wasOpen = vehiclePicker.name === name;
    document.getElementById(`vehicle-${name}`).focus({ preventScroll: true });
    if (wasOpen) closeVehiclePicker();
    else openVehiclePicker(name);
    return;
  }
  const vehicleClear = event.target.closest("[data-vehicle-clear]");
  if (vehicleClear) {
    const name = vehicleClear.dataset.vehicleClear;
    const input = document.getElementById(`vehicle-${name}`);
    input.value = "";
    state.vehicle[name] = "";
    input.removeAttribute("aria-invalid");
    document.getElementById(`${name}-error`).textContent = "";
    vehicleClear.hidden = true;
    input.focus({ preventScroll: true });
    openVehiclePicker(name);
    saveInspection();
    return;
  }
  const vehicleCalendar = event.target.closest("[data-vehicle-calendar]");
  if (vehicleCalendar) {
    vehiclePicker.calendar = vehicleCalendar.dataset.vehicleCalendar;
    vehiclePicker.browseYears = true;
    updateVehicleSuggestions();
    return;
  }
  if (event.target.closest("[data-vehicle-manual]")) {
    const input = document.getElementById("vehicle-model");
    state.vehicle.model = input.value.trim();
    input.value = state.vehicle.model;
    input.focus({ preventScroll: true });
    closeVehiclePicker();
    saveInspection();
    return;
  }
  const vehicleInput = event.target.closest('[role="combobox"]');
  if (vehicleInput) { openVehiclePicker(vehicleInput.name); return; }
  if (event.target.closest("#plate-letter-trigger")) {
    openPlateLetterPicker();
    return;
  }
  const historyStatus = event.target.closest("[data-history-status]");
  if (historyStatus) {
    historyStatusFilter = historyStatus.dataset.historyStatus;
    updateHistoryResults();
    return;
  }
  if (event.target.closest("[data-history-filter]")) {
    historySortDraft = historySort;
    const option = historyFilterSheet.querySelector(`[data-history-sort="${historySortDraft}"]`);
    if (option) option.checked = true;
    historyFilterSheet.showModal();
    return;
  }
  if (event.target.closest("[data-history-clear]")) {
    historySearch = "";
    const input = document.getElementById("history-search");
    if (input) { input.value = ""; input.focus(); }
    updateHistoryResults();
    return;
  }
  if (event.target.closest("[data-history-reset]")) {
    historySearch = ""; historyStatusFilter = "all"; historySort = "newest"; historySortDraft = "newest";
    renderApp();
    return;
  }
  const mileageStep = event.target.closest("[data-mileage-step]");
  if (mileageStep) {
    const current = Number(state.vehicle.mileage);
    const base = Number.isFinite(current) ? current : 0;
    const step = Number(mileageStep.dataset.mileageStep);
    if (step > 0 && base + step > MILEAGE_MAX) return;
    const next = Math.max(0, base + step);
    state.vehicle.mileage = String(next);
    const input = document.querySelector('#vehicle-form [name="mileage"]');
    input.value = formatNumber(next);
    input.removeAttribute("aria-invalid");
    document.getElementById("mileage-error").textContent = "";
    updateMileageDisplay();
    saveInspection();
    return;
  }
  const condition = event.target.closest("[data-key][data-value]");
  if (condition) {
    state.items[condition.dataset.key].condition = condition.dataset.value;
    saveInspection(); renderApp();
    document.querySelector(`[data-key="${condition.dataset.key}"][data-value="${condition.dataset.value}"]`)?.focus();
    return;
  }
  const noteToggle = event.target.closest("[data-note-toggle]");
  if (noteToggle) {
    openNoteSheet(noteToggle.dataset.noteToggle);
    return;
  }
  const tab = event.target.closest("[data-tab]");
  if (tab) { goHome(tab.dataset.tab); return; }
  const pdf = event.target.closest("[data-pdf]");
  if (pdf) {
    const record = database.inspections.find(item => item.id === pdf.dataset.pdf && item.ownerMobile === auth?.mobile);
    await downloadReport(record, pdf);
    return;
  }
  const record = event.target.closest("[data-record]");
  if (record) { openRecord(record.dataset.record); return; }
  const actionControl = event.target.closest("[data-action]");
  const action = actionControl?.dataset.action;
  if (!action) return;
  if (action === "home" || action === "new") goHome("new");
  else if (action === "stages") openSteps();
  else if (action === "profile") openProfile();
  else if (action === "logout") {
    if (window.AutoLMApi) {
      await flushServerSaves();
      if ([...serverPending.values()].some(record => record.ownerMobile === auth.mobile)) { notify("تغییرات هنوز روی سرور ذخیره نشده‌اند؛ ابتدا دوباره تلاش کنید."); return; }
      try { await window.AutoLMApi.request("/api/auth/logout?role=expert", { method: "POST", body: "{}" }); }
      catch (error) { notify(error.message); return; }
    }
    try { localStorage.removeItem(AUTH_KEY); } catch (_) { /* Legacy marker is not an authenticated session. */ }
    historySearch = ""; historyStatusFilter = "all"; historySort = "newest"; historySortDraft = "newest";
    auth = null; INSPECTOR_NAME = ""; loginMobile = ""; loginStage = "mobile"; screen = "login"; renderApp();
  } else if (action === "change-mobile") { loginStage = "mobile"; renderApp(); }
  else if (action === "resume") navigate(state.step === "report" ? "body" : state.step);
  else if (action === "next") {
    const i = CATEGORIES.findIndex(c => c.id === state.step);
    if (i < 3) navigate(CATEGORIES[i + 1].id);
    else if (isComplete(state)) { reportOrigin = "workflow"; navigate("report"); }
    else { reportWarning = true; renderApp(); window.scrollTo(0, 0); notify("همهٔ موارد را تکمیل کنید."); }
  } else if (action === "first-incomplete") {
    const first = firstIncomplete(); if (first) navigate(first.category, first.id);
  } else if (action === "edit") navigate("body");
  else if (action === "back") {
    if (screen === "profile") {
      goHome(homeTab);
      requestAnimationFrame(() => document.querySelector('[data-action="profile"]')?.focus({ preventScroll: true }));
    } else if (screen === "report") reportOrigin === "history" ? goHome("history") : navigate("tires");
    else if (screen === "detail") goHome("history");
    else if (state.step === "setup") goHome(workflowOrigin === "history" ? "history" : "new");
    else { const i = CATEGORIES.findIndex(c => c.id === state.step); navigate(i <= 0 ? "setup" : CATEGORIES[i - 1].id); }
  } else if (action === "download-pdf") {
    if (screen === "report") await downloadReport(state, actionControl);
  }
});
document.getElementById("close-steps").addEventListener("click", () => stepsSheet.close());
document.getElementById("ack-steps").addEventListener("click", () => stepsSheet.close());
document.getElementById("steps-content").addEventListener("click", event => {
  const step = event.target.closest("[data-sheet-step]");
  if (!step || step.disabled) return;
  stepsSheet.close();
  if (screen === "home" && step.dataset.sheetStep === "setup") return;
  navigate(step.dataset.sheetStep);
});
stepsSheet.addEventListener("click", event => { if (event.target === stepsSheet) stepsSheet.close(); });
document.getElementById("close-note").addEventListener("click", closeNoteSheet);
document.getElementById("cancel-note").addEventListener("click", closeNoteSheet);
document.getElementById("save-note").addEventListener("click", saveNote);
noteEditor.addEventListener("input", () => {
  document.getElementById("note-count").textContent = `${formatNumber(noteEditor.value.length)} / ۲۵۰`;
  if (editingNoteKey) {
    state.items[editingNoteKey].noteDraft = noteEditor.value.slice(0, 250);
    saveInspection();
  }
});
noteSheet.addEventListener("click", event => { if (event.target === noteSheet) closeNoteSheet(); });
noteSheet.addEventListener("close", () => { editingNoteKey = null; });
historyFilterSheet.addEventListener("change", event => {
  if (event.target.matches("[data-history-sort]")) historySortDraft = event.target.value;
});
document.getElementById("close-history-filter").addEventListener("click", () => historyFilterSheet.close());
document.getElementById("apply-history-filter").addEventListener("click", () => {
  historySort = historySortDraft;
  historyFilterSheet.close();
  renderApp();
});
historyFilterSheet.addEventListener("click", event => { if (event.target === historyFilterSheet) historyFilterSheet.close(); });
document.getElementById("close-plate-letter").addEventListener("click", () => plateLetterSheet.close());
document.getElementById("clear-plate-letter").addEventListener("click", () => selectPlateLetter(""));
plateLetterSheet.addEventListener("click", event => {
  const option = event.target.closest("[data-plate-letter]");
  if (option) selectPlateLetter(option.dataset.plateLetter);
  if (event.target === plateLetterSheet) {
    const rect = plateLetterSheet.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) plateLetterSheet.close();
  }
});
plateLetterSheet.addEventListener("keydown", event => {
  const option = event.target.closest("[data-plate-letter]");
  if (!option || event.altKey || event.ctrlKey || event.metaKey) return;
  const options = [...plateLetterSheet.querySelectorAll("[data-plate-letter]")];
  const index = options.indexOf(option);
  const columns = getComputedStyle(document.getElementById("plate-letter-options")).gridTemplateColumns.split(" ").length;
  let next = index;
  if (event.key === "ArrowLeft") next = Math.min(index + 1, options.length - 1);
  else if (event.key === "ArrowRight") next = Math.max(index - 1, 0);
  else if (event.key === "ArrowDown") next = Math.min(index + columns, options.length - 1);
  else if (event.key === "ArrowUp") next = Math.max(index - columns, 0);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  else if (PLATE_LETTERS.includes(event.key)) next = PLATE_LETTERS.indexOf(event.key);
  else return;
  event.preventDefault();
  option.tabIndex = -1;
  options[next].tabIndex = 0;
  options[next].focus();
});
plateLetterSheet.addEventListener("close", () => {
  const trigger = document.getElementById("plate-letter-trigger");
  trigger?.setAttribute("aria-expanded", "false");
  trigger?.focus({ preventScroll: true });
});
app.addEventListener("focusin", event => {
  if (event.target.matches('[role="combobox"]')) openVehiclePicker(event.target.name);
  else if (!event.target.closest("[data-vehicle-combobox]")) closeVehiclePicker();
});
app.addEventListener("pointerdown", event => {
  if (!event.target.closest("[data-vehicle-combobox]")) closeVehiclePicker();
});
app.addEventListener("mousedown", event => {
  if (event.target.closest(".vehicle-combo-popup")) event.preventDefault();
});
// The server is authoritative. Browser records are retained only as a recovery
// cache and for one-way, idempotent migration of the previous local version.
const SERVER_PENDING_KEY = "carcheck_server_pending_v1";
const serverPending = new Map();
const serverInFlight = new Map();
const serverVersions = new Map();
let serverSaveTimer = null, serverSaving = false, serverSaveFailure = "", serverSavePromise = null;
function showSyncState() {
  const banner = document.getElementById("server-sync-status");
  if (!banner) return;
  banner.hidden = !serverSaveFailure;
  if (serverSaveFailure) banner.querySelector("span").textContent = serverSaveFailure;
}
function cachePending() {
  try {
    const previous = JSON.parse(localStorage.getItem(SERVER_PENDING_KEY) || "[]");
    const all = new Map((Array.isArray(previous) ? previous : []).filter(record => record?.ownerMobile !== auth?.mobile).map(record => [record.id, record]));
    for (const record of [...serverInFlight.values(), ...serverPending.values()]) all.set(record.id, { ...record, version: serverVersions.get(record.id) ?? record.version ?? 0 });
    localStorage.setItem(SERVER_PENDING_KEY, JSON.stringify([...all.values()]));
  } catch (_) { /* API writes continue even if the recovery cache is unavailable. */ }
}
function queueServerSave(record) {
  serverPending.set(record.id, JSON.parse(JSON.stringify(record)));
  cachePending(); clearTimeout(serverSaveTimer);
  serverSaveTimer = setTimeout(flushServerSaves, 350);
}
function flushServerSaves() {
  if (!serverSavePromise) serverSavePromise = writeServerSaves().finally(() => { serverSavePromise = null; });
  return serverSavePromise;
}
async function writeServerSaves() {
  if (serverSaving || !auth || !window.AutoLMApi) return;
  serverSaving = true; clearTimeout(serverSaveTimer);
  try {
    for (const [id, snapshot] of serverPending) {
      if (!auth) return;
      if (snapshot.ownerMobile !== auth.mobile) continue;
      serverInFlight.set(id, snapshot);
      serverPending.delete(id);
      try {
        const result = await window.AutoLMApi.request(`/api/expert/inspections/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ ...snapshot, version: serverVersions.get(id) || 0 }) });
        serverVersions.set(id, result.inspection.version);
        const saved = database.inspections.find(record => record.id === id);
        if (saved) { saved.version = result.inspection.version; saved.createdAt = result.inspection.createdAt; saved.vehicle.inspector = auth?.name || saved.vehicle.inspector; }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(database)); } catch (_) { /* Server has persisted the record. */ }
      } catch (error) {
        if (!serverPending.has(id)) serverPending.set(id, snapshot);
        serverInFlight.delete(id);
        serverSaveFailure = `${error.message} تغییرات این صفحه هنوز روی سرور ثبت نشده‌اند.`;
        cachePending(); showSyncState(); return;
      }
      serverInFlight.delete(id);
      cachePending();
    }
    serverSaveFailure = ""; showSyncState();
  } finally { serverSaving = false; }
}
async function acceptExpertSession(user) {
  const previousAuth = auth;
  try {
    const existing = window.AutoLMApi.legacyRecords().filter(record => record.ownerMobile === user.mobile);
    if (existing.length) await window.AutoLMApi.request("/api/expert/import", { method: "POST", body: JSON.stringify({ inspections: existing }) });
    const remote = await window.AutoLMApi.request("/api/expert/inspections");
    auth = { ...user, verified: true, expert: remote.expert }; INSPECTOR_NAME = remote.expert.name;
    const records = remote.inspections.map(sanitizeInspection);
    records.forEach(record => serverVersions.set(record.id, record.version));
    const priorDraft = database.drafts[user.mobile];
    database.inspections = [...database.inspections.filter(record => record.ownerMobile !== user.mobile), ...records];
    database.drafts[user.mobile] = records.find(record => record.id === priorDraft?.id) || blankInspection();
    database.drafts[user.mobile].ownerMobile = user.mobile;
    try {
      const pending = JSON.parse(localStorage.getItem(SERVER_PENDING_KEY) || "[]");
      if (Array.isArray(pending)) for (const value of pending) {
        if (value?.ownerMobile !== user.mobile || !value.id) continue;
        const record = sanitizeInspection(value);
        serverPending.set(record.id, record);
        serverVersions.set(record.id, record.version || 0);
        const index = database.inspections.findIndex(item => item.id === record.id);
        if (index < 0) database.inspections.push(record); else database.inspections[index] = record;
        if (priorDraft?.id === record.id) database.drafts[user.mobile] = record;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    } catch (_) { /* Server records remain available without local storage. */ }
    restoreActiveView(); renderApp(); flushServerSaves();
  } catch (error) { auth = previousAuth; throw error; }
}
async function initializeBackend() {
  try { const { user } = await window.AutoLMApi.request("/api/auth/session?role=expert"); await acceptExpertSession(user); }
  catch (error) {
    auth = null; screen = "login"; renderApp();
    if (error.status !== 401) document.getElementById("expert-login-error").textContent = error.message;
  }
}
async function loadLocalLoginHints() {
  if (!["localhost", "127.0.0.1", "::1"].includes(location.hostname)) return;
  try {
    const response = await fetch("/api/local-login-hints?role=expert", { cache: "no-store" });
    if (!response.ok) return;
    const hints = await response.json();
    if (typeof hints.username === "string" && typeof hints.password === "string") {
      localLoginHints = hints;
      if (screen === "login") renderApp();
    }
  } catch (_) { /* Local login hints are optional. */ }
}
restoreActiveView(); renderApp();
loadLocalLoginHints();
if (window.AutoLMApi) {
  initializeBackend();
  document.getElementById("retry-server-sync").addEventListener("click", flushServerSaves);
  window.addEventListener("pagehide", () => { cachePending(); });
  window.addEventListener("online", flushServerSaves);
  setInterval(async () => {
    if (!auth) return;
    try { const result = await window.AutoLMApi.request("/api/auth/session?role=expert"); auth = { ...auth, ...result.user }; INSPECTOR_NAME = result.user.name; }
    catch (error) { if (error.status === 401) { auth = null; screen = "login"; renderApp(); notify("نشست پایان یافته یا حساب غیرفعال شده است."); } }
  }, 10000);
}
