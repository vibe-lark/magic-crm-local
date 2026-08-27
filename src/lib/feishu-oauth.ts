import { feishuCallbackUrl } from "@/lib/config";

const AUTHORIZE_ENDPOINT = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const TOKEN_ENDPOINT = "https://open.larkoffice.com/open-apis/authen/v2/oauth/token";
const USER_INFO_ENDPOINT = "https://open.larkoffice.com/open-apis/authen/v1/user_info";

export type FeishuProfile = { openId: string; name?: string; avatarUrl?: string };

export class FeishuOAuthError extends Error {
  constructor(public readonly stage: "configuration" | "token_exchange" | "user_info", message: string) {
    super(message);
    this.name = "FeishuOAuthError";
  }
}

function credentials(): { appId: string; appSecret: string } {
  const appId = process.env.LARK_APP_ID?.trim() || "";
  const appSecret = process.env.LARK_APP_SECRET?.trim() || "";
  if (!appId || !appSecret) throw new FeishuOAuthError("configuration", "缺少 LARK_APP_ID 或 LARK_APP_SECRET");
  return { appId, appSecret };
}

export function buildFeishuAuthorizeUrl(state: string): string {
  const { appId } = credentials();
  const target = new URL(AUTHORIZE_ENDPOINT);
  target.searchParams.set("client_id", appId);
  target.searchParams.set("redirect_uri", feishuCallbackUrl());
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", "contact:user.base:readonly");
  target.searchParams.set("state", state);
  return target.toString();
}

export async function exchangeFeishuCode(code: string): Promise<FeishuProfile> {
  const { appId, appSecret } = credentials();
  let tokenPayload: Record<string, unknown>;
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: appId, client_secret: appSecret, code, redirect_uri: feishuCallbackUrl() }),
    });
    tokenPayload = await response.json() as Record<string, unknown>;
    if (!response.ok || tokenPayload.error || (tokenPayload.code !== undefined && Number(tokenPayload.code) !== 0)) {
      throw new Error(String(tokenPayload.error_description || tokenPayload.msg || tokenPayload.error || `HTTP ${response.status}`));
    }
  } catch (error) {
    throw new FeishuOAuthError("token_exchange", error instanceof Error ? error.message : "飞书令牌交换失败");
  }

  const tokenData = (tokenPayload.data && typeof tokenPayload.data === "object" ? tokenPayload.data : tokenPayload) as Record<string, unknown>;
  const accessToken = String(tokenData.access_token || "").trim();
  const tokenOpenId = String(tokenData.open_id || "").trim();
  if (!accessToken) throw new FeishuOAuthError("token_exchange", "飞书响应缺少 access_token");

  try {
    const response = await fetch(USER_INFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok || Number(payload.code) !== 0) throw new Error(String(payload.msg || payload.error_description || `HTTP ${response.status}`));
    const user = (payload.data || {}) as Record<string, unknown>;
    const openId = String(user.open_id || tokenOpenId).trim();
    if (!openId) throw new Error("飞书响应缺少 open_id");
    return {
      openId,
      name: String(user.name || user.en_name || "").trim() || undefined,
      avatarUrl: String(user.avatar_url || user.avatar_thumb || "").trim() || undefined,
    };
  } catch (error) {
    if (tokenOpenId) return { openId: tokenOpenId };
    throw new FeishuOAuthError("user_info", error instanceof Error ? error.message : "获取飞书用户信息失败");
  }
}
