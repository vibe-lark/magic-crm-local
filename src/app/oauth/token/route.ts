import { CrmError } from "@/lib/crm/error";
import { exchangeCode, refreshAccessToken } from "@/lib/oauth";
import { oauthDiagnostic, shortClientId } from "@/lib/oauth-diagnostics";

export async function POST(request:Request){
  try{
    const contentType=request.headers.get("content-type")||"";const input=contentType.includes("application/json")?await request.json():Object.fromEntries(await request.formData()) as Record<string,string>;
    oauthDiagnostic("token_request_received","info",{grantType:input.grant_type||"missing",clientId:shortClientId(input.client_id),codePresent:Boolean(input.code),verifierLength:String(input.code_verifier||"").length});
    const result=input.grant_type==="authorization_code"?exchangeCode(input):input.grant_type==="refresh_token"?refreshAccessToken(input):null;
    if(!result) throw new CrmError("unsupported_grant_type","不支持的授权类型");
    oauthDiagnostic("token_issued","success",{grantType:input.grant_type,clientId:shortClientId(input.client_id)});return Response.json(result,{headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
  }catch(error){const e=error instanceof CrmError?error:new CrmError("invalid_request","Token 请求无效");oauthDiagnostic("token_request_rejected","error",{reason:e.code,message:e.message});return Response.json({error:e.code,error_description:e.message},{status:400,headers:{"Cache-Control":"no-store"}});}
}
