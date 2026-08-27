import { clearOAuthDiagnostics, oauthDebugEnabled, oauthDiagnostics } from "@/lib/oauth-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowed(request: Request): boolean {
  if (!oauthDebugEnabled()) return false;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, events: oauthDiagnostics() }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!allowed(request)) return Response.json({ error: "not_found" }, { status: 404 });
  clearOAuthDiagnostics();
  return new Response(null, { status: 204 });
}
