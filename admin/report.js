/* Offline PDF download: browser-rendered Persian pages embedded as JPEGs.
   Native printing remains available for a text-selectable report. */
(function () {
  "use strict";
  const D = window.AdminDomain;
  const disclaimer = "این شاخص فقط ۱۶ مورد این فرم را می‌سنجد و گواهی ایمنی یا ارزیابی کامل فنی خودرو نیست. ترمز، فرمان، تعلیق، گیربکس و تست رانندگی در این فرم ارزیابی نمی‌شوند.";
  const points = { "body.paint": [240, 85], "body.scratches": [211, 252], "body.dents": [101, 183], "body.chassis": [345, 238], "engine.performance": [122, 160], "engine.noise": [121, 135], "engine.leaks": [126, 186], "engine.exhaust": [350, 267], "interior.dashboard": [206, 155], "interior.seats": [250, 160], "interior.climate": [209, 186], "interior.electronics": [287, 183], "tires.front": [143, 46], "tires.rear": [299, 46], "tires.rims": [143, 277], "tires.spare": [339, 161] };
  async function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, 4000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = src;
    });
  }
  function imagePdf(pages) {
    const encoder = new TextEncoder();
    const chunks = [], offsets = [0];
    let length = 0;
    const append = value => { const bytes = typeof value === "string" ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
    const object = (id, body) => { offsets[id] = length; append(`${id} 0 obj\n${body}\nendobj\n`); };
    append("%PDF-1.4\n% Auto LM report\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
    pages.forEach((canvas, index) => {
      const id = 3 + index * 3;
      object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /PageImage ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
      const raw = atob(canvas.toDataURL("image/jpeg", .94).split(",")[1]);
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      offsets[id + 1] = length;
      append(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      append(bytes); append("\nendstream\nendobj\n");
      const command = "q\n595.28 0 0 841.89 0 0 cm\n/PageImage Do\nQ\n";
      object(id + 2, `<< /Length ${encoder.encode(command).length} >>\nstream\n${command}endstream`);
    });
    const xref = length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (let i = 1; i < offsets.length; i++) append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: "application/pdf" });
  }
  async function create(record, inspector) {
    if (D.status(record) !== "complete") throw new Error("Incomplete report");
    await document.fonts.ready;
    const [logo, map] = await Promise.all([loadImage("/assets/auto-ml-logo.png"), loadImage("/assets/car-inspection-map.png")]);
    const W = 1240, H = 1754, M = 90, R = W - M, bottom = H - 118;
    const pages = [];
    let ctx, y;
    const colors = { ink: "#17262B", muted: "#697579", line: "#DFE3E5", green: "#117D65", soft: "#E9F9F4", review: "#9A6500", faulty: "#B83237", healthy: "#16805F", neutral: "#697579" };
    function font(size = 24, bold = false) { ctx.font = `${bold ? "700" : "400"} ${size}px IRANYekanXFaNum, IRANYekanX, Tahoma, sans-serif`; }
    function text(value, x, top, size = 24, color = colors.ink, bold = false, align = "right") {
      font(size, bold); ctx.direction = "rtl"; ctx.textAlign = align; ctx.textBaseline = "top"; ctx.fillStyle = color; ctx.fillText(String(value), x, top);
    }
    function box(x, top, width, height, fill, stroke = "") {
      ctx.beginPath(); ctx.roundRect(x, top, width, height, 10); ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    function line(top) { ctx.strokeStyle = colors.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, top); ctx.lineTo(R, top); ctx.stroke(); }
    function wrap(value, width, size = 23, bold = false) {
      font(size, bold);
      const output = [];
      for (const paragraph of String(value).split("\n")) {
        let row = "";
        for (const word of paragraph.split(/\s+/)) {
          if (ctx.measureText(word).width > width) {
            if (row) { output.push(row); row = ""; }
            let segment = "";
            for (const character of word) { if (segment && ctx.measureText(segment + character).width > width) { output.push(segment); segment = ""; } segment += character; }
            row = segment;
          } else if (row && ctx.measureText(`${row} ${word}`).width > width) { output.push(row); row = word; }
          else row = row ? `${row} ${word}` : word;
        }
        output.push(row);
      }
      return output;
    }
    function paragraph(value, width = R - M, size = 23, color = colors.muted, lineHeight = 38, right = R) {
      const rows = wrap(value, width, size);
      rows.forEach(row => { text(row, right, y, size, color); y += lineHeight; });
    }
    function addPage() {
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      pages.push(canvas); ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, W, H);
      if (logo) ctx.drawImage(logo, R - 66, 62, 66, 66);
      text("اتو ال‌ام", R - (logo ? 84 : 0), 72, 29, colors.ink, true);
      text(record.demo ? "گزارش نمونهٔ کارشناسی خودرو" : "گزارش کارشناسی خودرو", R - (logo ? 84 : 0), 111, 19, colors.muted);
      text(D.caseCode(record), M, 80, 22, colors.muted, false, "left");
      line(160); y = 198;
    }
    function ensure(height) { if (y + height > bottom) addPage(); }
    function section(name) { ensure(120); text(name, R, y, 29, colors.ink, true); y += 56; }
    addPage();
    if (record.provenance === "user_description") {
      paragraph("گزارش به روایت کاربر؛ وضعیت‌ها از توضیحات کاربر ثبت شده‌اند و تأیید بازدید حضوری نیستند.", R - M, 23, colors.review);
      y += 20;
    }
    const vehicleTitle = wrap(record.vehicle.model || "خودرو بدون نام", R - M, 39, true);
    vehicleTitle.forEach(row => { text(row, R, y, 39, colors.ink, true); y += 56; }); y += 10;
    const fields = [["کد پرونده", D.caseCode(record)], ["کارشناس", inspector], ["تاریخ کارشناسی", D.date(record.createdAt)], ["شماره پلاک", D.digits(record.vehicle.plate || "—")], ["سال ساخت", D.digits(record.vehicle.year || "—")], ["کارکرد", record.vehicle.mileage ? `${D.number(Number(D.latin(record.vehicle.mileage)))} کیلومتر` : "—"]];
    for (let index = 0; index < fields.length; index += 2) {
      const entries = [fields[index], fields[index + 1]].filter(Boolean).map(entry => ({ label: entry[0], lines: wrap(entry[1], (R - M) / 2 - 30, 24) }));
      const rowHeight = Math.max(86, ...entries.map(entry => entry.lines.length * 36 + 50));
      ensure(rowHeight + 12);
      entries.forEach((entry, column) => {
        if (!entry) return;
        const right = column === 0 ? R : W / 2 - 26;
        text(entry.label, right, y, 19, colors.muted);
        entry.lines.forEach((row, i) => text(row, right, y + 30 + i * 36, 24));
      });
      y += rowHeight;
    }
    const tone = D.tone(record);
    ensure(170); box(M, y, R - M, 136, "#F7F8F9");
    text("شاخص وضعیت خودرو", R - 24, y + 20, 23, colors.muted);
    text(`${D.number(D.score(record))} از ۱۰۰`, R - 24, y + 62, 36, colors[tone] || colors.green, true);
    text(D.interpretation(record), M + 24, y + 74, 22, colors[tone] || colors.green, false, "left"); y += 164;
    const finding = D.structural(record);
    if (finding) {
      const lines = wrap(`${finding.title}: ${finding.description}`, R - M - 40, 23);
      const height = lines.length * 38 + 36;
      ensure(height + 20); box(M, y, R - M, height, finding.tone === "faulty" ? "#FCEDEE" : "#FFF5DE");
      y += 18; paragraph(`${finding.title}: ${finding.description}`, R - M - 40, 23, colors[finding.tone], 38, R - 20); y += 38;
    }
    section("امتیاز بخش‌ها");
    D.categories.forEach(category => {
      ensure(60);
      text(category.name, R, y, 24);
      text(`وزن ${D.number(category.weight * 100)}٪`, W / 2 + 60, y, 20, colors.muted);
      text(`${D.number(D.categoryScore(category, record))} از ۱۰۰`, M, y, 24, colors.green, true, "left"); y += 52;
    });
    const issues = D.categories.flatMap(category => category.items.map(([key, label]) => ({ key: `${category.id}.${key}`, label, item: record.items[`${category.id}.${key}`] }))).filter(issue => ["review", "faulty"].includes(issue.item.condition));
    if (map) {
      let mapWidth = 620, mapHeight = mapWidth * 340 / 460;
      const mapCaption = issues.length ? "شماره‌های نقشه با موارد علامت‌دار در نتایج مطابقت دارند. زرد: نیاز به بررسی؛ قرمز: معیوب. محل علامت‌ها تقریبی است." : "نیازی به بررسی یا عیبی در موارد این فرم گزارش نشده است.";
      const captionHeight = wrap(mapCaption, R - M, 19).length * 31;
      const fixedHeight = 16 + 56 + 20 + captionHeight + 24;
      const availableMapHeight = bottom - y - fixedHeight;
      if (availableMapHeight < mapHeight && availableMapHeight >= 340) {
        mapHeight = availableMapHeight;
        mapWidth = mapHeight * 460 / 340;
      } else if (availableMapHeight < 340) {
        addPage();
      }
      // Fit the map to the remaining space where possible instead of leaving
      // a large gap and pushing a nearly full-size map onto its own page.
      ensure(16 + 56 + mapHeight + 20 + captionHeight + 24); y += 16; section("نقشهٔ تقریبی یافته‌ها");
      const left = (W - mapWidth) / 2;
      ctx.drawImage(map, left, y, mapWidth, mapHeight);
      issues.forEach((issue, i) => {
        const point = points[issue.key], x = left + point[0] / 460 * mapWidth, top = y + point[1] / 340 * mapHeight;
        ctx.beginPath(); ctx.arc(x, top, 18, 0, Math.PI * 2); ctx.fillStyle = issue.item.condition === "review" ? "#C68B00" : colors.faulty; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        text(D.digits(i + 1), x, top - 13, 22, "white", true, "center");
      });
      y += mapHeight + 20;
      paragraph(mapCaption, R - M, 19, colors.muted, 31); y += 24;
    }
    // Continue results on the current page. Each category reserves enough room
    // for its heading and first item, so an extra forced page only creates gaps.
    section("نتایج کامل کارشناسی");
    D.categories.forEach(category => {
      const firstNote = record.items[`${category.id}.${category.items[0][0]}`].note;
      ensure(170 + (firstNote ? wrap(`یادداشت کارشناس: ${firstNote}`, R - M - 32, 22).length * 36 : 0)); box(M, y, R - M, 54, "#E9F9F4");
      text(category.name, R - 18, y + 11, 25, colors.green, true);
      text(`${D.number(D.categoryScore(category, record))} از ۱۰۰`, M + 18, y + 13, 22, colors.green, true, "left"); y += 76;
      category.items.forEach(([key, label]) => {
        const item = record.items[`${category.id}.${key}`];
        const issueIndex = issues.findIndex(issue => issue.key === `${category.id}.${key}`);
        const noteLines = item.note ? wrap(`یادداشت کارشناس: ${item.note}`, R - M - 32, 22) : [];
        const height = 68 + noteLines.length * 36;
        ensure(height + 14);
        text(`${issueIndex >= 0 ? `(${D.digits(issueIndex + 1)}) ` : ""}${label}`, R, y, 25, colors.ink, true);
        text(D.conditions[item.condition].label, M, y + 2, 22, colors[item.condition], true, "left");
        y += 43;
        noteLines.forEach(row => { text(row, R - 16, y, 22, colors.muted); y += 36; });
        line(y + 11); y += 34;
      });
      y += 28;
    });
    if (record.provenance === "user_description") {
      for (const [title, lines] of [["سایر گفته‌های کاربر، خارج از امتیاز فرم", record.additionalNotes || []], ["متن و سابقه توضیحات کاربر", (record.sourceHistory || []).map(h => h.text)]]) {
        if (!lines.length) continue;
        section(title);
        for (const value of lines) for (const row of wrap(value, R - M, 22)) { ensure(42); text(row, R, y, 22, colors.muted); y += 36; }
        y += 20;
      }
    }
    const disclaimerLines = wrap(disclaimer, R - M, 20);
    ensure(disclaimerLines.length * 32 + 50); y += 20; paragraph(disclaimer, R - M, 20, colors.muted, 32);
    pages.forEach((canvas, index) => {
      ctx = canvas.getContext("2d"); line(H - 95);
      text(`اتو ال‌ام${record.demo ? " · داده‌های نمونه" : ""}`, R, H - 70, 18, colors.muted);
      text(`صفحهٔ ${D.digits(index + 1)} از ${D.digits(pages.length)}`, M, H - 70, 18, colors.muted, false, "left");
    });
    return imagePdf(pages);
  }
  async function download(record, inspector) {
    const blob = await create(record, inspector), url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${D.caseCode(record)}-report.pdf`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function markup(record, inspector) {
    const e = D.escape, risk = D.structural(record);
    const provenance = record.provenance === "user_description" ? `<section class="print-section"><h2>گزارش به روایت کاربر</h2><p>وضعیت‌ها از توضیحات کاربر ثبت شده‌اند و تأیید بازدید حضوری نیستند.</p>${(record.additionalNotes || []).map(n => `<p>${e(n)}</p>`).join("")}${(record.sourceHistory || []).map(h => `<p>${e(h.text)}</p>`).join("")}</section>` : "";
    return `${provenance}<header class="print-header"><img src="/assets/auto-ml-logo.png" width="64" height="64" alt="اتو ال‌ام"><div><h1>گزارش کارشناسی خودرو</h1><p>اتو ال‌ام${record.demo ? " · گزارش نمونه" : ""} · <bdi>${e(D.caseCode(record))}</bdi></p></div></header><div class="print-meta"><div>خودرو: ${e(record.vehicle.model || "—")}</div><div>سال ساخت: ${e(D.digits(record.vehicle.year || "—"))}</div><div>پلاک: <bdi>${e(D.digits(record.vehicle.plate || "—"))}</bdi></div><div>کارکرد: ${e(record.vehicle.mileage ? `${D.number(Number(D.latin(record.vehicle.mileage)))} کیلومتر` : "—")}</div><div>کارشناس: ${e(inspector)}</div><div>تاریخ کارشناسی: ${D.date(record.createdAt)}</div></div><div class="print-score"><strong>شاخص وضعیت: ${D.number(D.score(record))} از ۱۰۰</strong> · ${D.interpretation(record)}${risk ? `<p>${e(risk.description)}</p>` : ""}</div>${D.categories.map(category => `<section class="print-section"><h2>${category.name} · ${D.number(D.categoryScore(category, record))} از ۱۰۰ · وزن ${D.number(category.weight * 100)}٪</h2>${category.items.map(([key, label]) => { const item = record.items[`${category.id}.${key}`]; return `<div class="print-item"><div><strong>${label}</strong><span>${D.conditions[item.condition].label}</span></div>${item.note ? `<p>یادداشت کارشناس: ${e(item.note)}</p>` : ""}</div>`; }).join("")}</section>`).join("")}<p class="print-disclaimer">${disclaimer}</p>`;
  }
  async function print(record, inspector) {
    if (D.status(record) !== "complete") return;
    const host = document.getElementById("print-root");
    host.innerHTML = markup(record, inspector);
    await document.fonts.ready;
    await loadImage("/assets/auto-ml-logo.png");
    window.print();
  }
  window.AdminReport = { create, download, print, markup };
})();
