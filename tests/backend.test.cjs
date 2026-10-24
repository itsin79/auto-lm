const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createStore } = require('../backend/store.js');
const { createApi } = require('../backend/api.js');
const D = require('../admin/domain.js');
const admin = { mobile: '09990000000', name: 'مدیر آزمون', password: 'Server-test-password-42' };
const person = (mobile = '09990000001') => ({ mobile, name: 'کارشناس آزمون', password: 'Expert-test-password-42', status: 'active', city: 'تهران', specialty: 'کارشناسی کامل', nationalCode: '', email: '', address: '' });
function record(id = 'CC-server-test', ownerMobile = '09990000001') {
  return { id, ownerMobile, version: 0, createdAt: '2000-01-01T00:00:00Z', vehicle: { model: 'خودرو آزمون', inspector: 'نام جعلی سمت مرورگر', year: '1403', mileage: '12000' }, step: 'report', complete: true, items: Object.fromEntries(D.itemKeys.map(key => [key, { condition: 'healthy', note: '' }])) };
}
function storeFor(t) { const store = createStore(':memory:'); t.after(() => store.close()); return store; }

test('new local database is empty and creates the documented local administrator', async t => {
  const store = storeFor(t);
  assert.deepEqual(store.overview(), { experts: [], cases: [] });
  const { user, token } = await store.login({ role: 'admin', username: 'admin', password: 'admin' });
  assert.equal(user.role, 'admin'); assert.equal(store.session(token, 'admin').mobile, 'admin');
  assert.equal(store.session(token, 'expert'), null);
  assert.deepEqual(store.overview(), { experts: [], cases: [] });
  assert.notEqual(store.db.prepare('SELECT password_hash FROM users').get().password_hash, 'admin');
  assert.equal(JSON.stringify(store.overview()).includes('admin'), false);
});

test('local administrator login verifies the stored password and supports logout', async t => {
  const store = storeFor(t);
  await assert.rejects(store.login({ role: 'admin', mobile: admin.mobile, password: '1111' }), { status: 401 });
  await assert.rejects(store.login({ ...admin, role: 'expert' }), { status: 401 });
  const { token } = await store.login({ role: 'admin', username: 'admin', password: 'admin' });
  assert.ok(store.session(token, 'admin')); store.logout(token); assert.equal(store.session(token, 'admin'), null);
});

test('expert saves and admin overview share persistent records and authoritative names', async t => {
  const store = storeFor(t); await store.saveExpert(person());
  const saved = store.saveInspection(record(), person().mobile);
  assert.equal(saved.ownerMobile, person().mobile); assert.equal(saved.vehicle.inspector, person().name);
  assert.notEqual(saved.createdAt, '2000-01-01T00:00:00Z'); assert.equal(saved.version, 1);
  const overview = store.overview();
  assert.equal(overview.experts.length, 1); assert.equal(overview.cases.length, 1);
  assert.equal(overview.cases[0].id, saved.id); assert.equal(D.score(overview.cases[0]), 100);
  assert.equal(overview.cases[0].history[0].action, 'created');
});

test('ownership, version conflicts and invalid conditions cannot overwrite data', async t => {
  const store = storeFor(t); await store.saveExpert(person()); await store.saveExpert(person('09990000002'));
  const saved = store.saveInspection(record(), person().mobile);
  assert.throws(() => store.saveInspection({ ...saved, ownerMobile: '09990000002' }, '09990000002'), { status: 403 });
  assert.equal(store.listInspections('09990000002').length, 0);
  assert.throws(() => store.saveInspection({ ...saved, version: 0 }, person().mobile), { status: 409 });
  const invalid = structuredClone(saved); invalid.items['body.paint'].condition = 'made-up';
  assert.throws(() => store.saveInspection(invalid, person().mobile), { status: 400 });
  assert.equal(store.overview().cases[0].version, 1);
});

test('status history is real and admin reports do not include unsaved note drafts', async t => {
  const store = storeFor(t); await store.saveExpert(person());
  const input = record(); input.items['body.paint'] = { condition: null, note: 'یادداشت تأییدشده', noteDraft: 'متن در حال ویرایش' };
  const first = store.saveInspection(input, person().mobile);
  assert.equal(D.score(first), null); assert.equal(first.items['body.paint'].noteDraft, 'متن در حال ویرایش');
  const published = store.overview().cases[0];
  assert.equal(published.items['body.paint'].noteDraft, undefined); assert.equal(published.items['body.paint'].note, 'یادداشت تأییدشده');
  first.items['body.paint'].condition = 'healthy'; store.saveInspection(first, person().mobile);
  const second = store.overview().cases[0];
  assert.equal(second.history[1].action, 'status_changed'); assert.equal(second.history[1].detail.to, 'complete');
});

test('source provenance and additional notes survive saving and reloading', async t => {
  const store = storeFor(t); await store.saveExpert(person());
  const input = { ...record(), provenance: 'user_description', additionalNotes: ['توضیح خارج از فرم'], sourceHistory: [{ text: 'شرح مالک خودرو', recordedAt: '2026-10-23T10:00:00Z' }] };
  const saved = store.saveInspection(input, person().mobile);
  assert.equal(saved.provenance, 'user_description');
  assert.deepEqual(store.overview().cases[0].additionalNotes, input.additionalNotes);
  assert.deepEqual(store.listInspections(person().mobile, true)[0].sourceHistory, input.sourceHistory);
});

test('deactivation and password changes revoke expert sessions immediately', async t => {
  const store = storeFor(t); const expert = await store.saveExpert(person());
  const { token } = await store.login({ ...person(), role: 'expert' });
  assert.ok(store.session(token, 'expert'));
  await store.saveExpert({ ...expert, password: '', status: 'inactive' }, expert.mobile);
  assert.equal(store.session(token, 'expert'), null);
  await assert.rejects(store.login({ ...person(), role: 'expert' }), { status: 401 });
  await store.saveExpert({ ...expert, password: 'A-new-test-password', status: 'active' }, expert.mobile);
  await assert.rejects(store.login({ ...person(), role: 'expert' }), { status: 401 });
  assert.ok((await store.login({ ...person(), role: 'expert', password: 'A-new-test-password' })).token);
});

test('legacy migration excludes mocks, preserves owners, and never invents expert names', t => {
  const store = storeFor(t); const input = record();
  const result = store.importLegacy({ inspections: [input, { ...input, id: 'demo-1048', demo: true }] }, admin.mobile);
  assert.deepEqual(result, { imported: 1, skipped: 1 });
  assert.equal(store.overview().experts.length, 1); assert.equal(store.getExpert(input.ownerMobile).name, '');
  assert.equal(store.getExpert(input.ownerMobile).status, 'inactive'); assert.equal(store.getExpert(input.ownerMobile).hasLogin, false);
  assert.equal(Date.parse(store.overview().cases[0].createdAt), Date.parse(input.createdAt));
  assert.equal(store.overview().cases[0].vehicle.inspector, '');
  assert.equal(store.importLegacy({ inspections: [input] }, admin.mobile).imported, 0);
  assert.equal(store.overview().cases.length, 1);
});

test('legacy expert import can only claim the authenticated owner and standalone real profiles persist', t => {
  const store = storeFor(t);
  assert.equal(store.importLegacy({ inspections: [record()] }, '09990000002', '09990000002').imported, 0);
  store.importLegacy({ inspections: [], profiles: [{ ...person(), demo: false }, { ...person('09990000003'), demo: true }] }, admin.mobile);
  assert.equal(store.overview().experts.length, 1); assert.equal(store.getExpert(person().mobile).name, person().name);
  assert.equal(store.getExpert(person().mobile).hasLogin, false);
});

test('records and sessions survive closing and reopening the SQLite database', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'autolm-store-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'data.sqlite'); let store = createStore(filename);
  const { token } = await store.login({ role: 'admin', username: 'admin', password: 'admin' }); await store.saveExpert(person()); store.saveInspection(record(), person().mobile); store.close();
  store = createStore(filename); t.after(() => store.close());
  assert.equal(store.overview().cases.length, 1); assert.ok(store.session(token, 'admin'));
});

test('HTTP API enforces auth, roles, same-origin writes, and connects expert writes to admin reads', async t => {
  const store = storeFor(t);
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const api = createApi(store, send);
  const server = http.createServer((req, res) => api(req, res, new URL(req.url, `http://${req.headers.host}`)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, method = 'GET', body = null, cookie = '', origin = base) {
    const response = await fetch(base + url, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] || '', body: await response.json() };
  }
  assert.equal((await request('/api/admin/overview')).status, 401);
  assert.equal((await request('/api/admin/experts', 'POST', person(), '', 'https://wrong.example')).status, 403);
  const owner = await request('/api/auth/login', 'POST', { role: 'admin', username: 'admin', password: 'admin' });
  assert.equal(owner.status, 200); assert.match(owner.cookie, /^autolm_admin_session=/);
  const added = await request('/api/admin/experts', 'POST', person(), owner.cookie); assert.equal(added.status, 201);
  const login = await request('/api/auth/login', 'POST', { role: 'expert', mobile: person().mobile, password: person().password }); assert.equal(login.status, 200);
  assert.equal((await request('/api/admin/overview', 'GET', null, login.cookie)).status, 401);
  assert.equal((await request('/api/expert/inspections/CC-server-test', 'PUT', record(), login.cookie)).status, 200);
  const overview = await request('/api/admin/overview', 'GET', null, owner.cookie);
  assert.equal(overview.body.cases.length, 1); assert.equal(overview.body.cases[0].ownerMobile, person().mobile);
  assert.equal(overview.body.experts[0].name, person().name); assert.equal(JSON.stringify(overview.body).includes('password'), false);
});
