import { CrmError } from "@/lib/crm/error";
import { registerClient } from "@/lib/oauth";

export async function POST(request:Request){
  try{return Response.json(registerClient(await request.json()),{status:201,headers:{"Cache-Control":"no-store"}});}
  catch(error){const e=error instanceof CrmError?error:new CrmError("invalid_client_metadata","客户端元数据无效");return Response.json({error:e.code,error_description:e.message},{status:400});}
}
