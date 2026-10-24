/* Small, dependency-free XLSX writer for the admin's selected table rows. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AdminTableExport = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const encoder = new TextEncoder();
  const xml = value => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xEDB88320 : 0);
    return value >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function concat(parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
  }
  // Store entries without compression; XLSX readers support standard ZIP method 0.
  function zip(files) {
    const local = [], directory = [];
    let offset = 0;
    for (const [path, source] of Object.entries(files)) {
      const name = encoder.encode(path), bytes = encoder.encode(source), crc = crc32(bytes);
      const header = new Uint8Array(30), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034B50, true); view.setUint16(4, 20, true); view.setUint16(12, 33, true);
      view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, name.length, true);
      local.push(header, name, bytes);
      const entry = new Uint8Array(46), central = new DataView(entry.buffer);
      central.setUint32(0, 0x02014B50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(14, 33, true);
      central.setUint32(16, crc, true); central.setUint32(20, bytes.length, true); central.setUint32(24, bytes.length, true); central.setUint16(28, name.length, true); central.setUint32(42, offset, true);
      directory.push(entry, name); offset += header.length + name.length + bytes.length;
    }
    const central = concat(directory), end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054B50, true); view.setUint16(8, Object.keys(files).length, true); view.setUint16(10, Object.keys(files).length, true);
    view.setUint32(12, central.length, true); view.setUint32(16, offset, true);
    return concat([...local, central, end]);
  }
  function column(index) {
    let label = "";
    for (index++; index; index = Math.floor((index - 1) / 26)) label = String.fromCharCode(65 + (index - 1) % 26) + label;
    return label;
  }
  function workbook(headers, rows, name = "Export") {
    if (!headers.length) throw new Error("At least one column is required");
    const safeName = String(name).replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Export";
    const cell = (value, row, col) => {
      const ref = `${column(col)}${row}`, style = row === 1 ? 1 : 0;
      return typeof value === "number" && Number.isFinite(value)
        ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    };
    const sheetRows = [headers, ...rows].map((values, index) => `<row r="${index + 1}" ht="28" customHeight="1">${headers.map((_, col) => cell(values[col], index + 1, col)).join("")}</row>`).join("");
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    return zip({
      "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml": `<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "xl/styles.xml": `<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FF176B57"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      "xl/worksheets/sheet1.xml": `<worksheet ${ns}><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${headers.length}" width="25" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${column(headers.length - 1)}${rows.length + 1}"/></worksheet>`
    });
  }
  function download(headers, rows, title, filename) {
    const url = URL.createObjectURL(new Blob([workbook(headers, rows, title)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return { workbook, download };
});
