const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const mobile = '09990000000';
const storageKey = 'carcheck_inspections_v2';
const authKey = 'carcheck_demo_auth_v1';

test('user-provided report context escapes source text and outside-form notes', () => {
  const app = loadApp();
  const sample = {
    provenance: 'user_description',
    additionalNotes: ['ترمز صدا دارد <img src=x onerror=alert(2)>'],
    sourceHistory: [{ text: 'موتور صدا دارد <script>bad()</script>' }]
  };
  const html = app.evaluate(`importedReportContext(${JSON.stringify(sample)})`);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});

function loadApp(storage = new Map([[authKey, JSON.stringify({ mobile, verified: true })]])) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', value: '', hidden: false, open: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      showModal() { this.open = true; }, close() { this.open = false; },
      focus() {}, setSelectionRange() {}
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [] },
    Intl, Date, AbortController,
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => callback(),
    window: { location: { protocol: 'http:', hostname: 'example.test', href: 'http://example.test/' }, scrollY: 0, scrollTo() {} },
    location: { protocol: 'http:', hostname: 'example.test', href: 'http://example.test/' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  vm.runInContext(source, context);
  // Workflow unit tests start from an explicitly authenticated fixture. Production
  // authentication is exercised separately against the server and its cookies.
  vm.runInContext(`auth = JSON.parse(localStorage.getItem("carcheck_demo_auth_v1") || "null"); if (auth) { INSPECTOR_NAME = "کارشناس آزمون"; claimLegacyRecords(auth.mobile); restoreActiveView(); renderApp(); }`, context);
  const evaluate = code => vm.runInContext(code, context);
  const click = (selector, value) => element('app').listeners.click({
    target: { closest: candidate => candidate === selector ? value : null }
  });
  const field = (name, value, start = value.length, end = start, inputType = 'insertText') => {
    const target = {
      name, value, selectionStart: start, selectionEnd: end, selectionDirection: 'none',
      matches: selector => selector === '#vehicle-form [name]', removeAttribute() {},
      setSelectionRange(start, end, direction) {
        this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
      }
    };
    element('app').listeners.input({ target, inputType });
    return target;
  };
  const plate = (part, value) => element('app').listeners.input({ target: {
    value, dataset: { platePart: part }, matches: selector => selector === '[data-plate-part]'
  } });
  const submit = () => element('app').listeners.submit({ preventDefault() {}, target: { id: 'vehicle-form' } });
  return {
    storage, evaluate, element, field, plate, submit,
    data: () => JSON.parse(storage.get(storageKey)),
    state: () => JSON.parse(evaluate('JSON.stringify(state)')),
    action: action => click('[data-action]', { dataset: { action } }),
    condition: (key, value) => click('[data-key][data-value]', { dataset: { key, value } })
  };
}

test('manual mileage groups digits immediately while persisting the plain number', () => {
  const app = loadApp();
  for (const value of ['123456', '۱۲۳۴۵۶', '١٢٣٤٥٦', '123,456', '۱۲۳٬۴۵۶']) {
    const input = app.field('mileage', value);
    assert.equal(input.value, '۱۲۳٬۴۵۶');
    assert.equal(input.selectionStart, input.value.length);
    assert.equal(app.data().inspections[0].vehicle.mileage, '123456');
  }
  assert.equal(app.field('mileage', '').value, '');
  assert.equal(app.data().inspections[0].vehicle.mileage, '');
});

test('mileage formatting preserves the insertion point and selection inside the number', () => {
  const app = loadApp();
  const insertion = app.field('mileage', '۱۲۹٬۳۴۵', 3);
  assert.equal(insertion.value, '۱۲۹٬۳۴۵');
  assert.equal(insertion.selectionStart, 3);
  const selection = app.field('mileage', '1234567', 2, 5);
  assert.equal(selection.value, '۱٬۲۳۴٬۵۶۷');
  assert.equal(selection.selectionStart, 3);
  assert.equal(selection.selectionEnd, 7);
  const deletion = app.field('mileage', '۱۲۳۴۵', 2, 2, 'deleteContentBackward');
  assert.equal(deletion.value, '۱۲٬۳۴۵');
  assert.equal(deletion.selectionStart, 2);
});

test('mileage formatting retains invalid input for validation and accepts the maximum', () => {
  const app = loadApp();
  assert.equal(app.field('mileage', '9999999').value, '۹٬۹۹۹٬۹۹۹');
  for (const value of ['10000000', '-1234', '12.5', '۱۲الف']) {
    assert.equal(app.field('mileage', value).value, value);
  }
});

test('opening an empty form and viewing steps creates no inspection', () => {
  const app = loadApp();
  app.action('stages');
  app.action('home');
  assert.equal(app.data().inspections.length, 0);
  assert.equal(app.state().id, null);
});

for (const [name, value] of [['model', 'پ'], ['year', '۱۴'], ['mileage', '0']]) {
  test(`the first ${name} input creates one persistent, resumable setup draft`, () => {
    const app = loadApp();
    app.field(name, value);
    const record = app.data().inspections[0];
    assert.ok(record.id);
    assert.equal(record.step, 'setup');
    assert.equal(record.ownerMobile, mobile);
    assert.equal(record.complete, false);
    assert.equal(app.data().inspections.length, 1);
    const reload = loadApp(app.storage);
    assert.equal(reload.state().id, record.id);
    assert.equal(reload.state().vehicle[name], name === 'year' ? '14' : value);
    reload.field(name, value + '۱');
    assert.equal(reload.data().inspections.length, 1);
    assert.equal(reload.data().inspections[0].id, record.id);
    reload.action('home');
    assert.equal(reload.state().id, null);
    assert.equal(reload.data().inspections[0].id, record.id);
    reload.evaluate('goHome("history")');
    assert.ok(reload.element('app').innerHTML.includes(`data-record="${record.id}"`));
    reload.evaluate(`openRecord(${JSON.stringify(record.id)})`);
    reload.action('resume');
    assert.equal(reload.state().step, 'setup');
    assert.equal(reload.state().id, record.id);
  });
}

for (const [part, value, normalized] of [['first', '۱', '1'], ['serial', '۲۳', '23'], ['region', '۴', '4'], ['letter', 'ب', 'ب']]) {
  test(`partial plate ${part} survives refresh and remains in history without a model`, () => {
    const app = loadApp();
    app.plate(part, value);
    const reload = loadApp(app.storage);
    assert.equal(reload.state().vehicle.plateParts[part], normalized);
    assert.equal(reload.data().inspections.length, 1);
    reload.evaluate('goHome("history")');
    assert.ok(reload.element('app').innerHTML.includes('خودرو بدون نام'));
  });
}

test('confirmation reuses the setup draft ID and creation date, then home starts a separate draft', () => {
  const app = loadApp();
  app.field('model', 'پژو ۲۰۷');
  const initial = app.state();
  app.submit();
  assert.equal(app.state().step, 'body');
  assert.equal(app.state().id, initial.id);
  assert.equal(app.state().createdAt, initial.createdAt);
  assert.equal(app.state().vehicle.date, initial.vehicle.date);
  assert.equal(app.data().inspections.length, 1);
  assert.equal(app.data().drafts[mobile].id, null);
  app.action('home');
  app.field('model', 'پراید');
  assert.equal(app.data().inspections.length, 2);
  assert.notEqual(app.state().id, initial.id);
  assert.equal(app.data().inspections.find(record => record.id === initial.id).vehicle.model, 'پژو ۲۰۷');
});

test('clearing a field and leaving never deletes the existing draft', () => {
  const app = loadApp();
  app.field('model', 'پژو');
  const id = app.state().id;
  app.field('model', '');
  app.submit();
  assert.equal(app.state().step, 'setup');
  app.action('home');
  assert.equal(app.data().inspections.length, 1);
  assert.equal(app.data().inspections[0].id, id);
});

test('early draft identity does not enable later stages before valid setup', () => {
  const app = loadApp();
  app.field('year', '۱۴');
  app.action('stages');
  const html = app.element('steps-content').innerHTML;
  for (const stage of ['body', 'engine', 'interior', 'tires']) {
    assert.match(html, new RegExp(`data-sheet-step="${stage}" disabled`));
  }
  app.submit();
  assert.equal(app.state().step, 'setup');
  assert.equal(app.data().inspections.length, 1);
});

test('header back, refresh and home preserve all answers across every stage', () => {
  let app = loadApp();
  app.field('model', 'پژو');
  app.submit();
  const id = app.state().id;
  const stages = [['body', 'paint', 'review'], ['engine', 'noise', 'faulty'], ['interior', 'seats', 'healthy'], ['tires', 'front', 'review']];
  for (let index = 0; index < stages.length; index++) {
    const [stage, item, value] = stages[index];
    app.condition(`${stage}.${item}`, value);
    app.action('back');
    assert.equal(app.state().step, index === 0 ? 'setup' : stages[index - 1][0]);
    if (index === 0) app.submit(); else app.action('next');
    app = loadApp(app.storage);
    assert.equal(app.state().id, id);
    assert.equal(app.state().step, stage);
    for (const [savedStage, savedItem, savedValue] of stages.slice(0, index + 1)) {
      assert.equal(app.state().items[`${savedStage}.${savedItem}`].condition, savedValue);
    }
    if (index < stages.length - 1) app.action('next');
  }
  app.action('home');
  assert.equal(app.data().inspections.length, 1);
  app.evaluate(`openRecord(${JSON.stringify(id)})`);
  app.action('resume');
  assert.equal(app.state().step, 'tires');
});

test('an unconfirmed note survives closing and refresh without replacing its confirmed text', () => {
  let app = loadApp();
  app.field('model', 'پژو');
  app.submit();
  app.evaluate('state.items["body.paint"].note = "یادداشت قبلی"; openNoteSheet("body.paint")');
  app.element('note-editor').value = 'متن در حال ویرایش';
  app.element('note-editor').listeners.input();
  app.element('cancel-note').listeners.click();
  app = loadApp(app.storage);
  assert.equal(app.state().items['body.paint'].note, 'یادداشت قبلی');
  app.evaluate('openNoteSheet("body.paint")');
  assert.equal(app.element('note-editor').value, 'متن در حال ویرایش');
  app.element('save-note').listeners.click();
  assert.equal(app.data().inspections[0].items['body.paint'].note, 'متن در حال ویرایش');
  assert.equal('noteDraft' in app.data().inspections[0].items['body.paint'], false);
});

test('previously saved setup buffers migrate to history once without losing partial data', () => {
  const app = loadApp();
  const legacyDraft = app.state();
  legacyDraft.vehicle.plateParts.letter = 'ب';
  app.storage.set(storageKey, JSON.stringify({ schemaVersion: 2, inspections: [], drafts: { [mobile]: legacyDraft } }));
  const migrated = loadApp(app.storage);
  assert.equal(migrated.data().inspections.length, 1);
  assert.equal(migrated.state().vehicle.plateParts.letter, 'ب');
  const id = migrated.state().id;
  const reload = loadApp(app.storage);
  assert.equal(reload.state().id, id);
  assert.equal(reload.data().inspections.length, 1);
});

test('draft ownership and the active setup buffer stay separate between accounts', () => {
  const first = loadApp();
  first.field('model', 'خودروی اول');
  const id = first.state().id;
  first.action('logout');
  const otherMobile = '09990000001';
  first.storage.set(authKey, JSON.stringify({ mobile: otherMobile, verified: true }));
  const second = loadApp(first.storage);
  assert.equal(second.state().id, null);
  second.field('model', 'خودروی دوم');
  assert.equal(second.data().inspections.length, 2);
  second.storage.set(authKey, JSON.stringify({ mobile, verified: true }));
  assert.equal(loadApp(second.storage).state().id, id);
});

test('each workflow footer has only confirm and continue and back stays in the header', () => {
  const app = loadApp();
  app.field('model', 'پژو');
  app.submit();
  for (const stage of ['setup', 'body', 'engine', 'interior', 'tires']) {
    app.evaluate(`navigate(${JSON.stringify(stage)})`);
    const html = app.element('app').innerHTML;
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.equal((footer.match(/<button\b/g) || []).length, 1);
    assert.ok(footer.includes('تأیید و ادامه'));
    assert.ok(html.match(/<header[\s\S]*?<\/header>/)[0].includes('data-action="back"'));
    assert.ok(!footer.includes('data-action="previous"'));
  }
});
