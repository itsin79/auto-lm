const test = require('node:test');
const assert = require('node:assert/strict');
const { workbook } = require('../admin/table-export.js');

function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = new Map();
  let position = 0;
  while (view.getUint32(position, true) === 0x04034B50) {
    const size = view.getUint32(position + 18, true), nameLength = view.getUint16(position + 26, true), extraLength = view.getUint16(position + 28, true);
    assert.equal(view.getUint16(position + 8, true), 0, 'standard uncompressed ZIP entry');
    const start = position + 30, body = start + nameLength + extraLength;
    files.set(new TextDecoder().decode(bytes.slice(start, start + nameLength)), new TextDecoder().decode(bytes.slice(body, body + size)));
    position = body + size;
  }
  assert.equal(view.getUint32(position, true), 0x02014B50, 'central directory exists');
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054B50, 'ZIP end record exists');
  assert.equal(view.getUint16(bytes.length - 12, true), files.size);
  return files;
}

test('XLSX contains a right-to-left worksheet, frozen header and numeric counts', () => {
  const files = entries(workbook(['نام', 'تعداد'], [['کارشناس', 3]], 'کارشناسان'));
  assert.equal(files.size, 6);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /rightToLeft="1"/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<c r="B2" s="0"><v>3<\/v><\/c>/);
  assert.match(sheet, /autoFilter ref="A1:B2"/);
  assert.match(files.get('xl/workbook.xml'), /name="کارشناسان"/);
});

test('phone numbers keep their initial zero and untrusted strings never become formulas', () => {
  const files = entries(workbook(['موبایل', 'نام', 'خالی'], [['09990009991', '=HYPERLINK("https://example.test") & <script>\u0001', null]]));
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /t="inlineStr"><is><t xml:space="preserve">09990009991<\/t>/);
  assert.match(sheet, /=HYPERLINK\(&quot;https:\/\/example.test&quot;\) &amp; &lt;script&gt;/);
  assert.doesNotMatch(sheet, /<f>|<script>|\u0001|undefined|null/);
});

test('wide tables use valid Excel column references and safe sheet names', () => {
  const files = entries(workbook(Array.from({ length: 28 }, (_, i) => String(i)), [], 'invalid:/sheet*name?'));
  assert.match(files.get('xl/worksheets/sheet1.xml'), /r="AB1"/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /autoFilter ref="A1:AB1"/);
  assert.match(files.get('xl/workbook.xml'), /name="invalid  sheet name "/);
  assert.throws(() => workbook([], []), /column/);
});
