import { dispatch } from "../../lib/mcp.mjs";
import { repository } from "../../lib/repository";
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
type SyncBindings = typeof env & { AUTOLM_ADMIN_SYNC_URL?: string; AUTOLM_ADMIN_SYNC_TOKEN?: string; AUTOLM_DEFAULT_INSPECTOR?: string; AUTOLM_LOCAL_MCP_OWNER?: string; VERCEL_AUTOMATION_BYPASS_SECRET?: string };
function adminSyncFor(bindings: SyncBindings) {
  const endpoint = bindings.AUTOLM_ADMIN_SYNC_URL?.trim(), token = bindings.AUTOLM_ADMIN_SYNC_TOKEN, protectionBypass = bindings.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!endpoint || !token) return undefined;
  return async (record: unknown) => {
    try {
      const target = new URL("/api/mcp/inspections", endpoint);
      if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) return { status: "failed", message: "نشانی پنل مدیریت باید HTTPS باشد." };
      const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(protectionBypass ? { "x-vercel-protection-bypass": protectionBypass } : {}) }, body: JSON.stringify({ inspection: record }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; inspection?: { vehicle?: { inspector?: string } } };
      if (!response.ok) return { status: "failed", message: payload.error || `پنل مدیریت پاسخ ${response.status} داد.` };
      return { status: "synced", inspector: payload.inspection?.vehicle?.inspector || "", message: "پرونده در پنل مدیریت کارشناسان ذخیره شد." };
    } catch {
      return { status: "failed", message: "ارتباط با پنل مدیریت برقرار نشد؛ نشانی و دسترسی شبکه را بررسی کنید." };
    }
  };
}
export async function POST(request:Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return new Response("JSON required",{status:415});
  const reader=request.body?.getReader();
  if(!reader) return new Response("Request body required",{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return new Response("Request too large",{status:413});}chunks.push(value);}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  let message;try{message=JSON.parse(new TextDecoder().decode(body));}catch{return Response.json({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}},{status:400});}
  const bindings=env as SyncBindings;
  const requestUrl=new URL(request.url);
  const localOwner=bindings.AUTOLM_LOCAL_MCP_OWNER?.trim();
  const owner=request.headers.get("oai-authenticated-user-id") || (localOwner && ["localhost","127.0.0.1"].includes(requestUrl.hostname) ? localOwner : null);
  const result=await dispatch(message,{owner,repo:repository,origin:requestUrl.origin,adminSync:adminSyncFor(bindings),defaultInspector:bindings.AUTOLM_DEFAULT_INSPECTOR||""});
  return result===null?new Response(null,{status:202}):Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
}
export function GET(){return new Response("Use POST for stateless MCP",{status:405,headers:{Allow:"POST"}});}
