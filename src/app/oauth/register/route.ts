import { CrmError } from "@/lib/crm/error";
import { registerClient } from "@/lib/oauth";
import { oauthDiagnostic, safeOrigin, shortClientId } from "@/lib/oauth-diagnostics";

export async function POST(request:Request){
  let input:Record<string,unknown>={};
  try{input=await request.json();const client=registerClient(input);oauthDiagnostic("client_registered","success",{clientId:shortClientId(client.client_id),clientName:client.client_name,redirectCount:client.redirect_uris.length,redirectUri:safeOrigin(client.redirect_uris[0])});return Response.json(client,{status:201,headers:{"Cache-Control":"no-store"}});}
  catch(error){const e=error instanceof CrmError?error:new CrmError("invalid_client_metadata","客户端元数据无效");oauthDiagnostic("client_registration_rejected","error",{reason:e.code,message:e.message,redirectCount:Array.isArray(input.redirect_uris)?input.redirect_uris.length:0});return Response.json({error:e.code,error_description:e.message},{status:400});}
}
