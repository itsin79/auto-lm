const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createStore } = require('../backend/store.js');
const { createApi } = require('../backend/api.js');
const D = require('../admin/domain.js');
test('MCP import endpoint requires its bearer secret and returns the assigned admin case', async t => {
  const store=createStore(':memory:'); t.after(()=>store.close());
  await store.saveExpert({mobile:'09990000019',name:'سفیدگری',password:'Test-mcp-endpoint-password-42',status:'active',city:'',specialty:'',nationalCode:'',email:'',address:''});
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const api=createApi(store,send,{mcpSyncToken:'local-test-secret',defaultInspector:'سفیدگری'});
  const inspection={id:'mcp-api-case-001',revision:1,vehicle:{model:'پراید'},step:'body',items:Object.fromEntries(D.itemKeys.map(key=>[key,{condition:null,note:''}]))};
  async function request(authorization='') {
    const req=Readable.from([JSON.stringify({inspection})]); req.method='POST'; req.headers={'content-type':'application/json',...(authorization?{authorization}:{})};
    const res={headersSent:false,writeHead(status){this.status=status;},end(value){this.payload=JSON.parse(value);}};
    await api(req,res,new URL('http://localhost/api/mcp/inspections')); return res;
  }
  const denied=await request(); assert.equal(denied.status,401);
  const accepted=await request('Bearer local-test-secret'); assert.equal(accepted.status,200); assert.equal(accepted.payload.inspection.vehicle.inspector,'سفیدگری'); assert.equal(store.overview().cases[0].vehicle.model,'پراید');
});
test('MCP reports appear in the admin overview and update idempotently under the matched expert', async t => {
  const store = createStore(':memory:'); t.after(()=>store.close());
  const owner = '09990000018';
  await store.saveExpert({mobile:owner,name:'سفیدگری',password:'Test-mcp-sync-password-42',status:'active',city:'',specialty:'',nationalCode:'',email:'',address:''});
  const source = {id:'mcp-admin-sync-001',revision:1,createdAt:'2026-10-24T07:00:00.000Z',updatedAt:'2026-10-24T07:01:00.000Z',vehicle:{model:'پراید',inspector:'سفیدگری'},step:'body',items:Object.fromEntries(D.itemKeys.map(key=>[key,{condition:null,note:'',evidence:''}])),provenance:'user_description',additionalNotes:['لاستیک خراب است'],sourceHistory:[{text:'پراید؛ لاستیک خراب است',recordedAt:'2026-10-24T07:01:00.000Z'}]};
  source.items['interior.dashboard'].condition='healthy';
  const imported=store.importMcp(source);
  assert.equal(imported.vehicle.inspector,'سفیدگری'); assert.equal(imported.ownerMobile,owner); assert.equal(imported.imported,true);
  assert.equal(store.overview().cases[0].provenance,'user_description'); assert.equal(store.overview().cases[0].additionalNotes[0],'لاستیک خراب است');
  assert.equal(store.importMcp(source).version,1);
  const updated=structuredClone(source); updated.revision=2; updated.updatedAt='2026-10-24T07:02:00.000Z'; updated.items['body.paint'].condition='faulty';
  assert.equal(store.importMcp(updated).version,2); assert.equal(store.overview().cases[0].items['body.paint'].condition,'faulty');
  assert.deepEqual(store.overview().cases[0].history.map(event=>event.action),['mcp_imported','mcp_updated']);
});
test('imported ChatGPT provenance and outside-form notes survive server saves and admin reads', async t => {
  const store = createStore(':memory:'); t.after(()=>store.close());
  const mobile='09990000008';
  await store.saveExpert({mobile,name:'کارشناس آزمون',password:'Test-import-password-42',status:'active',city:'',specialty:'',nationalCode:'',email:'',address:''});
  const input={id:'gpt-import-backend-01',version:0,ownerMobile:mobile,vehicle:{model:'پژو ۲۰۶'},step:'body',items:Object.fromEntries(D.itemKeys.map(k=>[k,{condition:null,note:''}])),provenance:'user_description',additionalNotes:['ترمز صدا دارد'],sourceHistory:[{text:'موتور صدا دارد؛ ترمز صدا دارد',recordedAt:'2026-10-23T10:00:00Z'}]};
  input.items['engine.noise'].condition='review';
  const saved=store.saveInspection(input,mobile);
  assert.equal(saved.provenance,'user_description');
  assert.equal(saved.additionalNotes[0],'ترمز صدا دارد');
  assert.equal(saved.items['body.paint'].condition,null);
  assert.equal(D.score(saved),null);
  const read=store.overview().cases[0];
  assert.equal(read.sourceHistory[0].text,input.sourceHistory[0].text);
  store.saveInspection({...saved,vehicle:{...saved.vehicle,year:'1400'}},mobile);
  assert.equal(store.listInspections(mobile)[0].provenance,'user_description');
  assert.equal(store.listInspections('09990000007').length,0);
});
