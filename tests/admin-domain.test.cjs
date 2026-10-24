const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../admin/domain.js');
function record() { return D.cleanRecord({ id: 'CC-domain-test', ownerMobile: '09990000000', vehicle: {}, items: Object.fromEntries(D.itemKeys.map(key => [key, { condition: 'healthy', note: '' }])) }); }
test('incomplete or unrecognized conditions cannot produce a final report', () => {
  const fixture = record(); fixture.items['body.paint'].condition = 'invalid';
  const clean = D.cleanRecord(fixture); assert.equal(D.score(clean), null); assert.equal(D.status(clean), 'progress');
});
test('weights and structural warnings stay consistent with the expert app', () => {
  const fixture = record(); assert.equal(D.score(fixture), 100);
  fixture.items['body.paint'].condition = 'review'; fixture.items['engine.noise'].condition = 'faulty'; assert.equal(D.score(fixture), 87.5);
  fixture.items['body.chassis'].condition = 'faulty'; assert.equal(D.score(fixture), 80); assert.equal(D.tone(fixture), 'faulty');
  Object.values(fixture.items).forEach(item => { item.condition = 'faulty'; }); fixture.items['body.chassis'].condition = 'review'; assert.equal(D.tone(fixture), 'faulty'); assert.match(D.interpretation(fixture), /ضعیف/);
});
test('draft notes are excluded from report data', () => {
  const fixture = record(); fixture.items['body.paint'] = { condition: 'healthy', note: 'تأیید شده', noteDraft: 'در حال ویرایش' };
  assert.deepEqual(D.cleanRecord(fixture).items['body.paint'], { condition: 'healthy', note: 'تأیید شده' });
});
test('Persian and Arabic letters, numerals and word order remain searchable', () => {
  const values = ['کیا اسپورتیج', '۱۲ ب ۳۴۵ ایران ۶۷', 'LM-1048'];
  for (const query of ['كيا', '١٠٤٨', 'اسپورتیج کیا', '12 ب 345']) assert.ok(D.matches(values, query));
  assert.equal(D.matches(values, 'پژو'), false);
});
test('invalid dates and missing items fail safely', () => {
  assert.equal(D.date('broken'), '—'); assert.equal(D.cleanRecord({}), null);
  const fixture = record(); fixture.items = {}; assert.equal(D.score(D.cleanRecord(fixture)), null);
});
test('runtime contract has no sample generator or browser database reader', () => {
  assert.equal(D.sampleData, undefined); assert.equal(D.readData, undefined);
});
