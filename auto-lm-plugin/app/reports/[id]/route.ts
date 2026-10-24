import { repository } from "../../../lib/repository";
import { reportHtml } from "../../../lib/report.mjs";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  const owner=request.headers.get("oai-authenticated-user-id");
  if(!owner) return new Response("برای مشاهده گزارش وارد حساب شوید.",{status:401});
  const {id}=await context.params;
  const record=await repository.get(owner,id);
  if(!record)return new Response("پرونده یافت نشد.",{status:404});
  return new Response(reportHtml(record),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com"}});
}
