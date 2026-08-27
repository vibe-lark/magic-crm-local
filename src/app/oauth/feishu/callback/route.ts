import { crm } from "@/lib/crm/service";
import { exchangeFeishuCode, FeishuOAuthError } from "@/lib/feishu-oauth";
import { approveAuthorization, validateAuthorizationRequest } from "@/lib/oauth";
import { oauthDiagnostic } from "@/lib/oauth-diagnostics";

export const runtime = "nodejs";

type ErrorStage = "configuration" | "denied" | "callback" | "state" | "token_exchange" | "user_info" | "identity";

const stageCopy: Record<ErrorStage, { title: string; description: string }> = {
  configuration: { title: "飞书登录尚未配置", description: "请检查本地环境中的飞书应用 ID、密钥和回调地址。" },
  denied: { title: "你取消了飞书授权", description: "没有产生任何 CRM 授权。可以返回豆包后重新连接。" },
  callback: { title: "飞书回调信息不完整", description: "回调缺少必要参数，请从豆包重新发起连接。" },
  state: { title: "授权请求已经失效", description: "为保护账号安全，请返回豆包重新发起连接。" },
  token_exchange: { title: "飞书登录凭证交换失败", description: "请确认飞书应用配置和回调地址完全一致后重试。" },
  user_info: { title: "无法读取飞书用户身份", description: "请确认飞书应用已开通用户基础信息权限。" },
  identity: { title: "无法绑定 CRM 身份", description: "当前飞书账号无法绑定到可用的 CRM 演示账号。" },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function errorPage(stage: ErrorStage, detail?: string, status = 400): Response {
  const copy = stageCopy[stage];
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${copy.title}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(145deg,#f4f7ff,#eef1f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#1f2329}.card{width:min(480px,calc(100% - 32px));background:#fff;border:1px solid #e5e6eb;border-radius:22px;padding:34px;box-shadow:0 24px 70px rgba(31,35,41,.12)}.icon{width:56px;height:56px;display:grid;place-items:center;border-radius:17px;background:#fff1f0;color:#d4380d;font-size:28px;margin-bottom:22px}h1{font-size:24px;margin:0 0 12px}p{color:#646a73;line-height:1.7;margin:0}.detail{margin-top:18px;padding:12px 14px;border-radius:10px;background:#f7f8fa;font-size:13px;overflow-wrap:anywhere}.hint{margin-top:22px;font-size:13px;color:#8f959e}</style></head><body><main class="card"><div class="icon">!</div><h1>${copy.title}</h1><p>${copy.description}</p>${detail ? `<p class="detail">${escapeHtml(detail)}</p>` : ""}<p class="hint">这里不会显示飞书密钥、Token 或其他敏感信息。</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function logFailure(stage: ErrorStage, error: unknown): void {
  oauthDiagnostic("feishu_callback_rejected", "error", { stage, message: error instanceof Error ? error.message : String(error) });
  console.warn("[crm-feishu-oauth] authorization failed", { stage, name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  oauthDiagnostic("feishu_callback_received", "info", { codePresent: Boolean(params.get("code")), statePresent: Boolean(params.get("state")), denied: Boolean(params.get("error")) });
  const denied = params.get("error");
  if (denied) {
    const detail = params.get("error_description") || denied;
    logFailure("denied", new Error(detail));
    return errorPage("denied", detail, 403);
  }
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  if (!code || !state) { logFailure("callback", new Error("缺少 code 或 state")); return errorPage("callback", "缺少 code 或 state"); }
  const separator = state.indexOf(".");
  if (separator <= 0 || separator === state.length - 1) { logFailure("state", new Error("state 格式无效")); return errorPage("state", "state 格式无效"); }
  const requestId = state.slice(0, separator);
  const csrf = state.slice(separator + 1);

  try {
    validateAuthorizationRequest(requestId, csrf);
  } catch (error) {
    logFailure("state", error);
    return errorPage("state", error instanceof Error ? error.message : undefined);
  }

  try {
    const profile = await exchangeFeishuCode(code);
    oauthDiagnostic("feishu_identity_received", "success", { openIdPresent: Boolean(profile.openId), profileNamePresent: Boolean(profile.name) });
    let actor;
    try {
      actor = crm.actorByFeishu(profile);
    } catch (error) {
      logFailure("identity", error);
      return errorPage("identity", error instanceof Error ? error.message : undefined, 403);
    }
    const target=approveAuthorization(requestId, csrf, actor.id, profile.openId);oauthDiagnostic("crm_authorization_code_created", "success", { role: actor.role, crmUserId: actor.id });return Response.redirect(target, 302);
  } catch (error) {
    const stage: ErrorStage = error instanceof FeishuOAuthError ? error.stage : "state";
    logFailure(stage, error);
    return errorPage(stage, error instanceof Error ? error.message : undefined);
  }
}
