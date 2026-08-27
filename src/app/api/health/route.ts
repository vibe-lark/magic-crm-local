import { appBaseUrl, feishuCallbackUrl, feishuOauthConfigured, MCP_NAME, MCP_VERSION } from "@/lib/config";
import { getDb } from "@/lib/db";

export async function GET() {
  const db=getDb();const customerCount=(db.prepare("SELECT COUNT(*) AS count FROM customers").get() as {count:number}).count;
  return Response.json({ok:true,data:{name:MCP_NAME,version:MCP_VERSION,baseUrl:appBaseUrl(),database:"sqlite",customerCount,
    feishuOauthConfigured:feishuOauthConfigured(),feishuCallbackUrl:feishuCallbackUrl()}});
}
