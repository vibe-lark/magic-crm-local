export type OAuthDiagnosticLevel = "info" | "success" | "error";

export type OAuthDiagnosticEvent = {
  id: number;
  at: string;
  stage: string;
  level: OAuthDiagnosticLevel;
  detail?: Record<string, string | number | boolean | null>;
};

declare global {
  // eslint-disable-next-line no-var
  var __crmOAuthDiagnostics: OAuthDiagnosticEvent[] | undefined;
  // eslint-disable-next-line no-var
  var __crmOAuthDiagnosticSequence: number | undefined;
}

const MAX_EVENTS = 100;
const SENSITIVE_KEYS = /^(code|access_?token|refresh_?token|token|code_verifier|verifier|code_challenge|challenge|client_secret|app_secret|secret)$/i;

function sanitize(detail: OAuthDiagnosticEvent["detail"]): OAuthDiagnosticEvent["detail"] {
  if (!detail) return undefined;
  const result: NonNullable<OAuthDiagnosticEvent["detail"]> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    result[key] = typeof value === "string"
      ? value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(?:crmat|crmrt|crmcode)_[A-Za-z0-9_-]+\b/g, "[redacted]").slice(0, 500)
      : value;
  }
  return result;
}

export function oauthDebugEnabled(): boolean {
  return process.env.OAUTH_DEBUG === "true" || process.env.NODE_ENV === "development";
}

function diagnosticPath(): string {
  const configured = process.env.OAUTH_DEBUG_PATH || "./data/oauth-debug.ndjson";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function persistedEvents(): OAuthDiagnosticEvent[] {
  if (!oauthDebugEnabled()) return [];
  try {
    return fs.readFileSync(diagnosticPath(), "utf8").split("\n").filter(Boolean).slice(-MAX_EVENTS).map((line) => JSON.parse(line) as OAuthDiagnosticEvent);
  } catch {
    return [];
  }
}

export function oauthDiagnostic(
  stage: string,
  level: OAuthDiagnosticLevel = "info",
  detail?: OAuthDiagnosticEvent["detail"],
): void {
  if (!oauthDebugEnabled()) return;
  const events = globalThis.__crmOAuthDiagnostics ??= [];
  const id = globalThis.__crmOAuthDiagnosticSequence = (globalThis.__crmOAuthDiagnosticSequence ?? 0) + 1;
  const event = { id, at: new Date().toISOString(), stage, level, detail: sanitize(detail) };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const filename = diagnosticPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.appendFileSync(filename, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  console.info("[crm-oauth-debug]", event);
}

export function oauthDiagnostics(): OAuthDiagnosticEvent[] {
  const persisted = persistedEvents();
  return persisted.length ? persisted : [...(globalThis.__crmOAuthDiagnostics ?? [])];
}

export function clearOAuthDiagnostics(): void {
  globalThis.__crmOAuthDiagnostics = [];
  if (!oauthDebugEnabled()) return;
  const filename = diagnosticPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, "", { encoding: "utf8", mode: 0o600 });
}

export function shortClientId(value: unknown): string {
  const text = String(value || "");
  return text ? `${text.slice(0, 12)}…` : "missing";
}

export function safeOrigin(value: unknown): string {
  try {
    const url = new URL(String(value || ""));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return value ? "invalid-url" : "missing";
  }
}
import fs from "node:fs";
import path from "node:path";
