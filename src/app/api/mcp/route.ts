import Ajv from "ajv";
import addFormats from "ajv-formats";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { NextRequest, NextResponse } from "next/server";
import { allowedOrigins, appBaseUrl, MCP_NAME, MCP_VERSION } from "@/lib/config";
import { crm } from "@/lib/crm/service";
import { verifyAccessToken } from "@/lib/oauth";
import { tools } from "@/lib/mcp/tools";
import { createSession, deleteSession, validateSession } from "@/lib/mcp/sessions";
import { oauthDiagnostic, shortClientId } from "@/lib/oauth-diagnostics";

export const runtime="nodejs";
const SESSION_HEADER="Mcp-Session-Id";const ajv=new Ajv({allErrors:true,strict:false});addFormats(ajv);

function rpcError(id:unknown,code:number,message:string,status:number,headers?:HeadersInit){return NextResponse.json({jsonrpc:"2.0",id:typeof id==="string"||typeof id==="number"?id:null,error:{code,message}},{status,headers});}
function requestId(body:unknown){return body&&typeof body==="object"&&!Array.isArray(body)?(body as {id?:unknown}).id:null;}
function resourceMetadataUrl(){return `${appBaseUrl()}/.well-known/oauth-protected-resource/api/mcp`;}
function unauthorized(message="Unauthorized"){return rpcError(null,-32004,message,401,{"WWW-Authenticate":`Bearer resource_metadata="${resourceMetadataUrl()}"`});}
function cors(request:NextRequest,response:Response){const origin=request.headers.get("origin");if(origin&&allowedOrigins().includes(origin.replace(/\/+$/,"")))response.headers.set("Access-Control-Allow-Origin",origin);response.headers.set("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");response.headers.set("Access-Control-Allow-Headers",`Authorization,Content-Type,Accept,${SESSION_HEADER},MCP-Protocol-Version`);response.headers.set("Access-Control-Expose-Headers",SESSION_HEADER);response.headers.set("Vary","Origin");}

async function handle(request:NextRequest){
  let body:unknown;
  if(request.method==="POST"){try{body=await request.clone().json();}catch{return rpcError(null,-32700,"Parse error",400);}}
  const authHeader=request.headers.get("authorization")||"";const credential=authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!credential){oauthDiagnostic("mcp_unauthorized","error",{reason:"missing_bearer",method:request.method});return unauthorized();}const token=verifyAccessToken(credential);if(!token){oauthDiagnostic("mcp_unauthorized","error",{reason:"invalid_bearer",method:request.method});return unauthorized("Invalid or revoked credential");}
  const actor=crm.actor(token.user_id);const initialize=request.method==="POST"&&isInitializeRequest(body);const sessionId=request.headers.get(SESSION_HEADER)||"";
  if(!initialize){if(!sessionId)return rpcError(requestId(body),-32000,"Mcp-Session-Id is required",400);if(!validateSession(sessionId,token.user_id,token.client_id))return rpcError(requestId(body),-32001,"Session not found or belongs to another user",404);}
  try{
    const server=new Server({name:MCP_NAME,version:MCP_VERSION},{capabilities:{tools:{listChanged:false}},instructions:"查询和维护明日 CRM。所有操作均受管理员/销售数据权限约束，删除采用软归档。"});
    const validators=new Map(tools.map((tool)=>[tool.name,ajv.compile(tool.inputSchema)]));
    server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema})) as never}));
    server.setRequestHandler(CallToolRequestSchema,async(message)=>{
      const tool=tools.find((item)=>item.name===message.params.name);if(!tool)return {isError:true,content:[{type:"text" as const,text:`Unknown tool: ${message.params.name}`}]};
      const args=(message.params.arguments||{}) as Record<string,unknown>;const validate=validators.get(tool.name)!;
      if(!validate(args))return {isError:true,content:[{type:"text" as const,text:`Invalid arguments: ${ajv.errorsText(validate.errors)}`}]};
      try{const result=await tool.execute(actor,args);return {content:[{type:"text" as const,text:JSON.stringify(result,null,2)}],structuredContent:result as Record<string,unknown>};}
      catch(error){return {isError:true,content:[{type:"text" as const,text:error instanceof Error?error.message:"Tool execution failed"}]};}
    });
    const legacyJson=request.method==="POST"&&!request.headers.get("accept")?.includes("text/event-stream");
    const origins=allowedOrigins();const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:legacyJson,keepAliveMs:15_000,allowedOrigins:origins,allowedHosts:[...new Set(origins.map((origin)=>new URL(origin).host))],enableDnsRebindingProtection:true});
    await server.connect(transport);const headers=new Headers(request.headers);if(!headers.get("host"))headers.set("host",new URL(request.url).host);if(request.method==="POST"&&!headers.get("accept")?.includes("text/event-stream"))headers.set("accept","application/json, text/event-stream");
    const response=await transport.handleRequest(new Request(request.url,{method:request.method,headers}),{parsedBody:body});
    if(initialize&&response.ok){response.headers.set(SESSION_HEADER,createSession(token.user_id,token.client_id));oauthDiagnostic("mcp_initialized","success",{clientId:shortClientId(token.client_id),crmUserId:token.user_id});}
    if(request.method==="DELETE"&&response.ok&&sessionId)deleteSession(sessionId);cors(request,response);return response;
  }catch(error){if(initialize)oauthDiagnostic("mcp_initialize_rejected","error",{message:error instanceof Error?error.message:"Internal error"});return rpcError(requestId(body),-32603,error instanceof Error?error.message:"Internal error",500);}
}

export async function OPTIONS(request:NextRequest){const response=new NextResponse(null,{status:204});cors(request,response);return response;}
export {handle as GET,handle as POST,handle as DELETE};
