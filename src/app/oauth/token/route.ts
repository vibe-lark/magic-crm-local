import { CrmError } from "@/lib/crm/error";
import { exchangeCode, refreshAccessToken } from "@/lib/oauth";

export async function POST(request:Request){
  try{
    const contentType=request.headers.get("content-type")||"";const input=contentType.includes("application/json")?await request.json():Object.fromEntries(await request.formData()) as Record<string,string>;
    const result=input.grant_type==="authorization_code"?exchangeCode(input):input.grant_type==="refresh_token"?refreshAccessToken(input):null;
    if(!result) throw new CrmError("unsupported_grant_type","不支持的授权类型");
    return Response.json(result,{headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
  }catch(error){const e=error instanceof CrmError?error:new CrmError("invalid_request","Token 请求无效");return Response.json({error:e.code,error_description:e.message},{status:400,headers:{"Cache-Control":"no-store"}});}
}
