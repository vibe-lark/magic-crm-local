import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/crm/error";
import { crm } from "@/lib/crm/service";
import { actorFromRequest } from "@/lib/session";

function inputFromQuery(request: NextRequest): Record<string, unknown> {
  return Object.fromEntries([...request.nextUrl.searchParams.entries()].map(([key,value])=>[
    key,
    key === "pageSize" ? Number(value) : key === "includeArchived" ? value === "true" : value,
  ]));
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const actor=actorFromRequest(request);const {resource}=await context.params;const input=inputFromQuery(request);
    const data=resource==="bootstrap"?crm.bootstrap(actor.id)
      :resource==="summary"?crm.summary(actor)
      :resource==="customers"?(input.id?crm.customerGet(actor,String(input.id)):crm.customerSearch(actor,input))
      :resource==="contacts"?(input.id?crm.contactGet(actor,String(input.id)):crm.contactSearch(actor,input))
      :resource==="activities"?(input.id?crm.activityGet(actor,String(input.id)):crm.activitySearch(actor,input))
      :null;
    if(data===null) return Response.json({ok:false,error:{code:"NOT_FOUND",message:"接口不存在"}},{status:404});
    return Response.json({ok:true,data},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return errorResponse(error);}
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const actor=actorFromRequest(request);const {resource}=await context.params;const input=await request.json();
    const data=resource==="customers"?crm.customerCreate(actor,input)
      :resource==="contacts"?crm.contactCreate(actor,input)
      :resource==="activities"?crm.activityCreate(actor,input)
      :resource==="archive-demo"?crm.archiveDemo(actor):null;
    if(data===null) return Response.json({ok:false,error:{code:"NOT_FOUND",message:"接口不存在"}},{status:404});
    return Response.json({ok:true,data},{status:201});
  } catch(error){return errorResponse(error);}
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const actor=actorFromRequest(request);const {resource}=await context.params;const input=await request.json();
    const data=resource==="customers"?crm.customerUpdate(actor,String(input.id||""),input.patch||{})
      :resource==="contacts"?crm.contactUpdate(actor,String(input.id||""),input.patch||{})
      :resource==="activities"?crm.activityUpdate(actor,String(input.id||""),input.patch||{}):null;
    if(data===null) return Response.json({ok:false,error:{code:"NOT_FOUND",message:"接口不存在"}},{status:404});
    return Response.json({ok:true,data});
  } catch(error){return errorResponse(error);}
}
