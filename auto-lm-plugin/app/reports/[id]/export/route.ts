import { repository } from "../../../../lib/repository";
import { legacyExport } from "../../../../lib/domain.mjs";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  const owner=request.headers.get("oai-authenticated-user-id");
  if(!owner)return new Response("ورود لازم است.",{status:401});
  const {id}=await context.params;
  const record=await repository.get(owner,id);
  if(!record)return new Response("پرونده یافت نشد.",{status:404});
  return Response.json(legacyExport(record),{headers:{"Cache-Control":"private, no-store","Content-Disposition":`attachment; filename="auto-lm-${record.id}.json"`,"X-Content-Type-Options":"nosniff"}});
}
