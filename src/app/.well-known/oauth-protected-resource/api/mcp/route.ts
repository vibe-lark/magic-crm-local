import { appBaseUrl, MCP_SCOPE } from "@/lib/config";
export async function GET(){const base=appBaseUrl();return Response.json({resource:`${base}/api/mcp`,authorization_servers:[base],scopes_supported:[MCP_SCOPE],bearer_methods_supported:["header"]},{headers:{"Cache-Control":"no-store"}});}
