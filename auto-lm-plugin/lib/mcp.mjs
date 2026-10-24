import { ITEMS, LABELS, INSTRUCTIONS, InputError, makeRecord, summary, markdownReport, object, validateInput } from "./domain.mjs";
const string = (maxLength=250) => ({type:"string",maxLength});
const schema = (properties, required=[])=>({type:"object",properties,required,additionalProperties:false});
const vehicle = schema(Object.fromEntries(["model","year","mileage","plate","inspector","color","vin"].map(k=>[k,string()])));
const observations = {type:"array",maxItems:16,items:schema({item_key:{type:"string",enum:ITEMS.map(i=>i.key)},condition:{type:"string",enum:Object.keys(LABELS)},note:string(),evidence:{...string(500),minLength:1}},["item_key","condition","evidence"])};
const common = {vehicle,source_text:{...string(6000),minLength:1},observations,additional_notes:{type:"array",maxItems:20,items:string(500)},remaining_healthy_evidence:{...string(500),description:"فقط اگر کاربر صریحاً گفته سایر موارد سالم‌اند؛ نقل قول عین source_text. در غیر این صورت حذف شود."}};
const annotations = readOnlyHint=>({readOnlyHint,destructiveHint:false,idempotentHint:readOnlyHint,openWorldHint:false});
export const TOOLS = [
  {name:"get_inspection_catalog",description:"قرارداد فرم ۱۶ موردی اتو ال‌ام، کلیدها، وضعیت‌ها و شیوه تهیه گزارش فارسی را بخوان.",inputSchema:schema({}),annotations:annotations(true)},
  {name:"prepare_inspection",description:"از مشخصات خودرو و یافته‌های گفته‌شده توسط کاربر یک پرونده و گزارش مقدماتی/تکمیل‌شده ذخیره کن. موارد ناگفته بررسی‌نشده می‌مانند. برای هر یافته evidence عین source_text بده. کل توضیح کاربر را در source_text و موارد خارج از فرم را در additional_notes حفظ کن. برای تلاش مجدد همان request_id را بفرست.",inputSchema:schema({...common,vehicle:{...vehicle,required:["model"]},request_id:{type:"string",pattern:"^[a-zA-Z0-9_-]{8,80}$"}},["vehicle","request_id","source_text","observations"]),annotations:{...annotations(false),idempotentHint:true}},
  {name:"update_inspection",description:"یافته‌ها یا مشخصات پرونده موجود را اصلاح کن. ابتدا get_inspection_report را برای revision فعلی بخوان. فقط موارد ورودی تغییر می‌کنند؛ additional_notes در صورت ارسال جایگزین می‌شود و در غیر این صورت حفظ می‌شود. سابقه گفته‌های کاربر حفظ می‌شود.",inputSchema:schema({...common,inspection_id:string(80),expected_revision:{type:"integer",minimum:1}},["inspection_id","expected_revision","source_text","observations"]),annotations:annotations(false)},
  {name:"get_inspection_report",description:"گزارش فارسی، نسخه فعلی، موارد بررسی‌نشده، هشدار ساختاری و لینک خصوصی چاپ/ذخیره PDF و خروجی سازگار با اپ اتو ال‌ام را بخوان.",inputSchema:schema({inspection_id:string(80)},["inspection_id"]),annotations:annotations(true)},
  {name:"list_inspections",description:"پرونده‌های همین کاربر را با نام خودرو، پلاک یا شناسه جست‌وجو کن؛ آخرین گزارش‌ها را نشان بده.",inputSchema:schema({query:string(250),limit:{type:"integer",minimum:1,maximum:50}}),annotations:annotations(true)},
  {name:"sync_inspection_to_admin",description:"یک پرونده موجود را به‌صورت امن به پنل مدیریت کارشناسان اتو ال‌ام همگام کن؛ برای تلاش مجدد پس از خطای اتصال استفاده کن.",inputSchema:schema({inspection_id:string(80)},["inspection_id"]),annotations:annotations(false)},
];
async function fingerprint(value) {
  const sorted = v => Array.isArray(v)?v.map(sorted):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(sorted(value))));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function report(record, origin, adminSync) {
  const path = `/reports/${encodeURIComponent(record.id)}`;
  return { ...summary(record), report_url:`${origin}${path}`, export_url:`${origin}${path}/export`, report:markdownReport(record), additional_notes:record.additionalNotes, source_history:record.sourceHistory, ...(adminSync ? { admin_sync:adminSync } : {}) };
}
const result = value=>({content:[{type:"text",text:JSON.stringify(value)}]});
async function syncRecord(record, adminSync) {
  if (!adminSync) return { status:"not_configured", message:"اتصال MCP به پنل مدیریت هنوز پیکربندی نشده است." };
  try { return await adminSync(record); }
  catch { return { status:"failed", message:"ذخیره در MCP انجام شد، اما همگام‌سازی پنل مدیریت ناموفق بود؛ sync_inspection_to_admin را پس از بررسی اتصال دوباره اجرا کنید." }; }
}
async function runTool(name,args,owner,repo,origin,adminSync,defaultInspector) {
  if (!owner) throw new InputError("ورود به حساب ChatGPT لازم است.");
  if (name==="get_inspection_catalog") { object(args,[],"ورودی");return {items:ITEMS,conditions:LABELS,instructions:INSTRUCTIONS,weights:{body:30,engine:35,interior:20,tires:15},notes_max_length:250}; }
  if (name==="list_inspections") {
    object(args,["query","limit"],"ورودی");
    if (args.query!==undefined && (typeof args.query!=="string" || args.query.length>250)) throw new InputError("جست‌وجو معتبر نیست.");
    const limit=args.limit===undefined?20:args.limit;
    if (!Number.isInteger(limit)||limit<1||limit>50) throw new InputError("تعداد باید بین ۱ تا ۵۰ باشد.");
    return {inspections:(await repo.list(owner,args.query||"",limit)).map(r=>({...summary(r),report_url:`${origin}/reports/${encodeURIComponent(r.id)}`})),limit};
  }
  if(name==="prepare_inspection") {
    validateInput(args);
    const effective={...args,vehicle:{...args.vehicle,inspector:args.vehicle.inspector||defaultInspector||""}};
    const record=makeRecord(effective);
    const saved=await repo.create(owner,args.request_id,await fingerprint(effective),record);
    return report(saved,origin,await syncRecord(saved,adminSync));
  }
  if(name==="get_inspection_report" || name==="update_inspection" || name==="sync_inspection_to_admin") {
    if(name==="get_inspection_report" || name==="sync_inspection_to_admin") object(args,["inspection_id"],"ورودی"); else validateInput(args,true);
    if(typeof args.inspection_id!=="string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(args.inspection_id)) throw new InputError("شناسه پرونده معتبر نیست.");
    const record=await repo.get(owner,args.inspection_id);
    if(!record) throw new InputError("پرونده یافت نشد یا متعلق به این حساب نیست.");
    if(name==="get_inspection_report") return report(record,origin);
    if(name==="sync_inspection_to_admin") return report(record,origin,await syncRecord(record,adminSync));
    if(record.revision!==args.expected_revision) throw new Error("REVISION_CONFLICT");
    const saved=await repo.update(owner,args.expected_revision,makeRecord(args,record));
    return report(saved,origin,await syncRecord(saved,adminSync));
  }
  throw new InputError("ابزار یافت نشد.");
}
export async function dispatch(message,{owner,repo,origin,adminSync,defaultInspector}) {
  const id=message?.id??null;
  const error=(code,message)=>({jsonrpc:"2.0",id,error:{code,message}});
  if(!message || typeof message!=="object" || Array.isArray(message)||message.jsonrpc!=="2.0" || typeof message.method!=="string" || ("id" in message && message.id!==null && typeof message.id!=="string" && typeof message.id!=="number")) return error(-32600,"Invalid Request");
  if(message.method.startsWith("notifications/") && !("id" in message)) return null;
  if(!("id" in message)) return error(-32600,"Request id required");
  const ok=value=>({jsonrpc:"2.0",id,result:value});
  if(message.method==="server/discover") return ok({serverInfo:{name:"auto-lm",version:"1.0.0"},supportedVersions:["2026-07-28"],capabilities:{tools:{}},instructions:INSTRUCTIONS});
  if(message.method==="initialize") return ok({protocolVersion:["2025-03-26","2025-06-18","2025-11-25","2026-07-28"].includes(message.params?.protocolVersion)?message.params.protocolVersion:"2025-11-25",serverInfo:{name:"auto-lm",version:"1.0.0"},capabilities:{tools:{}},instructions:INSTRUCTIONS});
  if(message.method==="ping") return ok({});
  if(message.method==="tools/list") return ok({tools:TOOLS});
  if(message.method!=="tools/call") return error(-32601,"Method not found");
  if(!message.params || typeof message.params.name!=="string") return error(-32602,"Tool name required");
  try{return ok(result(await runTool(message.params.name,message.params.arguments??{},owner,repo,origin,adminSync,defaultInspector)));}
  catch(e){const text=e instanceof InputError?e.message:e.message==="REVISION_CONFLICT"?"پرونده تغییر کرده؛ گزارش را دوباره بخوانید و با revision تازه اصلاح کنید.":e.message==="REQUEST_CONFLICT"?"request_id با محتوای دیگری استفاده شده است؛ برای پرونده تازه شناسه تازه بدهید.":"ذخیره یا خواندن گزارش انجام نشد؛ دوباره تلاش کنید.";return ok({content:[{type:"text",text}],isError:true});}
}
