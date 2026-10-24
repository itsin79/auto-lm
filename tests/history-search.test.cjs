const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const mobile = '09990000000';

function loadApp() {
  const elements = new Map();
  let cards = [];
  const clear = { hidden: true };
  const chips = ['all', 'draft', 'complete'].map(status => ({
    dataset: { historyStatus: status },
    setAttribute(name, value) { this[name] = value; }
  }));
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', value: '', hidden: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { this.focused = true; }
    });
    return elements.get(id);
  };
  const document = {
    getElementById: element,
    querySelector(selector) {
      if (selector === '.history-section') return {};
      if (selector === '[data-history-clear]') return clear;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-history-card]') return cards;
      if (selector === '[data-history-status]') return chips;
      return [];
    }
  };
  const context = vm.createContext({
    document, Intl, Date, AbortController, setTimeout, clearTimeout,
    window: { location: { protocol: 'http:', hostname: 'example.test', href: 'http://example.test/' } },
    location: { protocol: 'http:', hostname: 'example.test', href: 'http://example.test/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  });
  vm.runInContext(source, context);
  const evaluate = code => vm.runInContext(code, context);
  const makeRecord = (id, model, plate, date, complete, owner = mobile) => {
    const record = context.blankInspection();
    Object.assign(record, { id, ownerMobile: owner, createdAt: `${date}T08:00:00Z`, updatedAt: `${date}T08:00:00Z` });
    Object.assign(record.vehicle, { model, plate, year: '1999', mileage: '99999', inspector: 'بازرس آزمایشی' });
    if (complete) Object.values(record.items).forEach(item => { item.condition = 'healthy'; });
    return record;
  };
  context.fixtures = [
    makeRecord('pride', 'پراید ۱۳۱', '۱۲ ب ۳۴۵ ایران ۶۷', '2026-10-23', false),
    makeRecord('peugeot', 'پژو ۲۰۶', '۲۳ ج ۴۵۶ ایران ۷۸', '2026-10-22', true),
    makeRecord('kia', 'كيا اسپورتيج', '۴۵ ی ۶۷۸ ایران ۹۰', '2026-10-21', false),
    makeRecord('legacy', 'Toyota Corolla', '۷۸ الف ۹۰۱ ۱۲', '2026-10-20', true),
    makeRecord('other-owner', 'پراید ۱۳۱', '۱۲ ب ۳۴۵ ایران ۶۷', '2026-10-23', true, '09990000001')
  ];
  evaluate(`database.inspections = fixtures; auth = { mobile: '${mobile}', verified: true }; screen = 'home'; homeTab = 'history';`);
  const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  function mount(query = '', status = 'all') {
    context.query = query;
    context.status = status;
    evaluate('historySearch = query; historyStatusFilter = status; renderApp();');
    const html = element('app').innerHTML;
    cards = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)].map(([, attributes, body]) => {
      const dataset = {};
      for (const [, name, value] of attributes.matchAll(/data-([\w-]+)="([^"]*)"/g)) {
        dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = decode(value);
      }
      return { id: decode(body.match(/data-record="([^"]*)"/)[1]), dataset, hidden: /\shidden(?:\s|$)/.test(attributes) };
    });
    element('history-search').value = query;
    return visible();
  }
  const visible = () => cards.filter(card => !card.hidden).map(card => card.id).sort();
  function input(query) {
    element('history-search').value = query;
    element('app').listeners.input({ target: { value: query, matches: selector => selector === '#history-search' } });
    return visible();
  }
  function click(selector, target) {
    element('app').listeners.click({ target: { closest: candidate => candidate === selector ? target : null } });
  }
  return { mount, input, visible, evaluate, element, clear, chips,
    filter: status => click('[data-history-status]', { dataset: { historyStatus: status } }),
    clearSearch: () => click('[data-history-clear]', {}) };
}

const all = ['kia', 'legacy', 'peugeot', 'pride'];
const queries = [
  ['', all], ['   ', all], ['---', all],
  ['پراید', ['pride']], ['پرايد', ['pride']], ['پَـرایِد', ['pride']],
  ['پراید ۱۳۱', ['pride']], ['  پراید‌  131  ', ['pride']],
  ['۱۳۱', ['pride']], ['131', ['pride']], ['١٣١', ['pride']],
  ['کیا اسپورتیج', ['kia']], ['كيا اسپورتيج', ['kia']],
  ['TOYOTA corolla', ['legacy']], ['پژو-206', ['peugeot']],
  ['۱۲ ب ۳۴۵ ایران ۶۷', ['pride']], ['12 ب 345 ایران 67', ['pride']],
  ['١٢ ب ٣٤٥ ايران ٦٧', ['pride']], ['۱۲ب۳۴۵۶۷', ['pride']],
  ['12ب34567', ['pride']], ['12 ب 345 - 67', ['pride']],
  ['۱۲/ب/۳۴۵/۶۷', ['pride']], ['‎12 ‏ب ‎345 ایران ‎67', ['pride']],
  ['۱۲۳۴۵۶۷', ['pride']], ['1234567', ['pride']], ['١٢٣٤٥٦٧', ['pride']],
  ['۳۴۵۶۷', ['peugeot', 'pride']], ['۱۲ ب ۳۴۵', ['pride']],
  ['23ج45678', ['peugeot']], ['45ي67890', ['kia']],
  ['۷۸ الف ۹۰۱ ۱۲', ['legacy']], ['78الف901ایران12', ['legacy']],
  ['۱۴۰۵۰۸۰۱', ['pride']], ['14050801', ['pride']], ['١٤٠٥٠٨٠١', ['pride']],
  ['۱۴۰۵/۰۸/۰۱', ['pride']], ['1405-08-01', ['pride']], ['۱٬۴۰۵٬۰۸۰۱', ['pride']],
  ['۱۴۰۵۰۷۳۰', ['peugeot']], ['بنز', []], ['۱۲ ب ۳۴۵ ایران ۹۹', []],
  ['pride', []], ['۱۹۹۹', []], ['۹۹۹۹۹', []], ['بازرس آزمایشی', []],
  ['۱۳۱۱۲ب', []], ['۶۷۱۴۰۵', []], ['<script>alert(1)</script>', []]
];

for (const [query, expected] of queries) {
  test(`initial and live results agree for ${JSON.stringify(query)}`, () => {
    const app = loadApp();
    assert.deepEqual(app.mount(query), expected, 'initial rendering');
    app.mount();
    assert.deepEqual(app.input(query), expected, 'input event and visible cards');
    assert.equal(app.element('history-no-results').hidden, expected.length > 0, 'empty state');
    assert.equal(app.clear.hidden, !query, 'clear button');
  });
}

test('status filters intersect with the search and never expose another owner', () => {
  const app = loadApp();
  assert.deepEqual(app.mount('', 'draft'), ['kia', 'pride']);
  assert.deepEqual(app.input('پراید'), ['pride']);
  app.filter('complete');
  assert.deepEqual(app.visible(), []);
  assert.equal(app.element('history-no-results').hidden, false);
  assert.equal(app.chips.find(chip => chip.dataset.historyStatus === 'complete')['aria-pressed'], 'true');
  app.filter('all');
  assert.deepEqual(app.visible(), ['pride']);
  assert.deepEqual(app.input(''), all);
  app.filter('complete');
  assert.deepEqual(app.visible(), ['legacy', 'peugeot']);
});

test('clearing restores results and focus while preserving the status filter', () => {
  const app = loadApp();
  app.mount('', 'complete');
  app.input('بی‌نتیجه');
  app.clearSearch();
  assert.deepEqual(app.visible(), ['legacy', 'peugeot']);
  assert.equal(app.element('history-search').value, '');
  assert.equal(app.element('history-search').focused, true);
  assert.equal(app.clear.hidden, true);
  assert.equal(app.element('history-no-results').hidden, true);
});

test('missing optional plate and invalid date do not crash or match unrelated text', () => {
  const app = loadApp();
  app.evaluate("fixtures[0].vehicle.plate = ''; fixtures[0].createdAt = null; fixtures[0].vehicle.date = ''; fixtures[0].vehicle.model = '';");
  assert.deepEqual(app.mount('خودرو بدون نام'), ['pride']);
  assert.deepEqual(app.input('1234567'), []);
});

test('plate parts remain searchable when the saved display string is absent', () => {
  const app = loadApp();
  app.evaluate("fixtures[0].vehicle.plate = ''; fixtures[0].vehicle.plateParts = { first: '12', letter: 'ب', serial: '345', region: '67' };");
  assert.deepEqual(app.mount('۱۲ ب ۳۴۵ ایران ۶۷'), ['pride']);
  assert.deepEqual(app.input('12ب34567'), ['pride']);
  assert.deepEqual(app.input('1234567'), ['pride']);
});

test('compatibility characters and quotes in a vehicle name survive rendered search data', () => {
  const app = loadApp();
  app.evaluate(`fixtures[0].vehicle.model = 'MVM X22 "Pro"';`);
  assert.deepEqual(app.mount('ＭＶＭ Ｘ２２'), ['pride']);
  assert.deepEqual(app.input('MVM X22 "Pro"'), ['pride']);
});
