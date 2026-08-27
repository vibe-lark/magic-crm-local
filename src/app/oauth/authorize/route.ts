import { buildFeishuAuthorizeUrl, FeishuOAuthError } from "@/lib/feishu-oauth";
import { feishuCallbackUrl } from "@/lib/config";
import { createAuthorizationRequest } from "@/lib/oauth";
import { oauthDiagnostic, safeOrigin, shortClientId } from "@/lib/oauth-diagnostics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    oauthDiagnostic("authorize_received","info",{clientId:shortClientId(params.client_id),responseType:params.response_type||"missing",pkceMethod:params.code_challenge_method||"missing",challengeLength:params.code_challenge?.length||0,scope:params.scope||"missing",redirectUri:safeOrigin(params.redirect_uri)});
    const authorization = createAuthorizationRequest(params);
    const state = `${authorization.requestId}.${authorization.csrf}`;
    const target=buildFeishuAuthorizeUrl(state);oauthDiagnostic("feishu_redirect_created","success",{clientId:shortClientId(params.client_id),callback:safeOrigin(feishuCallbackUrl())});return Response.redirect(target, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "授权请求无效";
    oauthDiagnostic("authorize_rejected","error",{reason:error instanceof FeishuOAuthError?error.stage:"invalid_request",message});
    if (error instanceof FeishuOAuthError && error.stage === "configuration") {
      return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>飞书登录尚未配置</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#1f2329}.card{width:min(480px,calc(100% - 32px));padding:34px;border:1px solid #e5e6eb;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(31,35,41,.12)}h1{margin:0 0 12px;font-size:24px}p{margin:0;color:#646a73;line-height:1.7}code{display:block;margin-top:18px;padding:12px;background:#f7f8fa;border-radius:10px;overflow-wrap:anywhere}</style></head><body><main class="card"><h1>飞书登录尚未配置</h1><p>请在本地 .env.local 填写 LARK_APP_ID 和 LARK_APP_SECRET，并在飞书开放平台登记回调地址。</p><code>${feishuCallbackUrl()}</code></main></body></html>`, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "invalid_request", error_description: message }, { status: 400 });
  }
}
