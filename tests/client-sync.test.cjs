const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('// The server is authoritative.');
const syncSource = source.slice(start, source.lastIndexOf('restoreActiveView(); renderApp();'));
function harness(request) {
  const storage = new Map(), fixture = { id: 'CC-sync', ownerMobile: '09990000001', vehicle: { model: 'نسخه اول' }, items: {}, version: 0 };
  const context = vm.createContext({ window: { AutoLMApi: { request } }, auth: { mobile: fixture.ownerMobile, name: 'کارشناس' }, database: { inspections: [fixture] }, STORAGE_KEY: 'carcheck_inspections_v2', JSON, Map, Promise, setTimeout: () => 1, clearTimeout() {}, document: { getElementById: () => null }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, fixture });
  vm.runInContext(syncSource, context);
  return { evaluate: code => vm.runInContext(code, context), pending: () => JSON.parse(storage.get('carcheck_server_pending_v1') || '[]'), context };
}
test('page close during an in-flight request retains a recovery copy', async () => {
  let resolveRequest;
  const h = harness(() => new Promise(resolve => { resolveRequest = resolve; }));
  h.evaluate('queueServerSave(fixture)'); const saving = h.evaluate('flushServerSaves()');
  h.evaluate('cachePending()'); assert.equal(h.pending().length, 1);
  resolveRequest({ inspection: { version: 1, createdAt: '2026-10-24T00:00:00Z' } });
  await saving; assert.equal(h.pending().length, 0);
});
test('new edits during an in-flight save use the newly acknowledged version', async () => {
  let firstResolve; const calls = [];
  const h = harness((url, options) => {
    const record = JSON.parse(options.body); calls.push(record);
    if (calls.length === 1) return new Promise(resolve => { firstResolve = resolve; });
    return Promise.resolve({ inspection: { version: 2, createdAt: '2026-10-24T00:00:00Z' } });
  });
  h.evaluate('queueServerSave(fixture)'); const saving = h.evaluate('flushServerSaves()');
  h.evaluate('fixture.vehicle.model = "نسخه جدید"; queueServerSave(fixture)');
  firstResolve({ inspection: { version: 1, createdAt: '2026-10-24T00:00:00Z' } });
  await saving;
  assert.equal(calls.length, 2); assert.equal(calls[1].version, 1); assert.equal(calls[1].vehicle.model, 'نسخه جدید'); assert.equal(h.pending().length, 0);
});
test('failed requests retain unsaved edits and retry without manufacturing a version', async () => {
  let failing = true; const calls = [];
  const h = harness(async (url, options) => { calls.push(JSON.parse(options.body)); if (failing) throw new Error('offline'); return { inspection: { version: 1, createdAt: '2026-10-24T00:00:00Z' } }; });
  h.evaluate('queueServerSave(fixture)'); await h.evaluate('flushServerSaves()'); assert.equal(h.pending().length, 1); assert.equal(h.pending()[0].version, 0);
  failing = false; await h.evaluate('flushServerSaves()'); assert.equal(h.pending().length, 0); assert.equal(calls[1].version, 0);
});
test('legacy migration excludes live pending writes, server records and mock data', () => {
  const records = [{ id: 'CC-legacy' }, { id: 'CC-pending' }, { id: 'CC-server', version: 3 }, { id: 'demo-1048', demo: true }];
  const storage = new Map([['carcheck_inspections_v2', JSON.stringify({ schemaVersion: 2, inspections: records })], ['carcheck_server_pending_v1', JSON.stringify([records[1]])]]);
  const context = vm.createContext({ window: {}, Set, JSON, localStorage: { getItem: key => storage.get(key) ?? null } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.AutoLMApi.legacyRecords())), [records[0]]);
});
