import path from "node:path";

export const APP_NAME = "妙笔 CRM";
export const MCP_NAME = "magic-crm-mcp";
export const MCP_VERSION = "1.0.0";
export const MCP_SCOPE = "mcp:invoke";

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "https://localhost:3000").replace(/\/+$/, "");
}

export function feishuCallbackUrl(): string {
  return (process.env.FEISHU_OAUTH_REDIRECT_URI || "https://localhost:3000/oauth/feishu/callback").trim();
}

export function feishuOauthConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID?.trim() && process.env.LARK_APP_SECRET?.trim());
}

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH || "./data/crm.sqlite";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

export function allowedOrigins(): string[] {
  const configured = String(process.env.MCP_ALLOWED_ORIGINS || "")
    .split(/[\s,]+/)
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set([appBaseUrl(), "https://localhost:3000", "https://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:3000", ...configured])];
}
