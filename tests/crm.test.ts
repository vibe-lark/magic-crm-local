import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { GET as authorizeGet } from "../src/app/oauth/authorize/route";
import { GET as feishuCallbackGet } from "../src/app/oauth/feishu/callback/route";
import { POST as mcpPost } from "../src/app/api/mcp/route";
import { GET as diagnosticsGet } from "../src/app/api/debug/oauth/route";
import { CrmService, crm } from "../src/lib/crm/service";
import { getDb, resetDb } from "../src/lib/db";
import { migrateSchema, schema } from "../src/lib/db/schema";
import { seed } from "../src/lib/db/seed";
import { base64urlSha256 } from "../src/lib/ids";
import { approveAuthorization, createAuthorizationRequest, exchangeCode, registerClient, verifyAccessToken } from "../src/lib/oauth";
import { clearOAuthDiagnostics, oauthDiagnostic } from "../src/lib/oauth-diagnostics";

function makeService() {
  const db = new Database(":memory:");
  db.exec(schema);
  migrateSchema(db);
  seed(db);
  return { db, crm: new CrmService(db) };
}

function bind(service: CrmService, openId: string, name = openId) {
  return service.actorByFeishu({ openId, name });
}

describe("CRM business service", () => {
  test("sales users only see records they own", () => {
    const { crm: service } = makeService();
    const alice = service.actor("user_alice");
    assert.equal(service.customerSearch(alice).total, 2);
    assert.throws(() => service.customerGet(alice, "cust_green"), /无权访问/);
  });

  test("admin can see all records and assign an owner", () => {
    const { crm: service } = makeService();
    const admin = service.actor("user_admin");
    assert.equal(service.customerSearch(admin).total, 4);
    assert.equal(service.customerCreate(admin, { name: "客户演示", ownerId: "user_bob", stage: "意向" }).ownerId, "user_bob");
  });

  test("creating an activity updates customer follow-up summary", () => {
    const { crm: service } = makeService();
    const occurredAt = "2026-08-20T08:00:00.000Z";
    const nextFollowUpAt = "2026-09-01T08:00:00.000Z";
    service.activityCreate(service.actor("user_alice"), { customerId: "cust_acme", contactId: "contact_li", subject: "方案评审", type: "电话", occurredAt, nextFollowUpAt });
    const customer = service.customerGet(service.actor("user_alice"), "cust_acme");
    assert.equal(customer.lastFollowUpAt, occurredAt);
    assert.equal(customer.nextFollowUpAt, nextFollowUpAt);
  });

  test("archiving demo data requires an administrator", () => {
    const { crm: service } = makeService();
    assert.throws(() => service.archiveDemo(service.actor("user_alice")), /只有管理员/);
    assert.ok(service.archiveDemo(service.actor("user_admin")).archivedCount > 0);
  });
});

describe("Feishu identity binding", () => {
  test("first user becomes admin and following users bind seeded sales accounts", () => {
    const { crm: service } = makeService();
    assert.equal(bind(service, "ou_admin").id, "user_admin");
    assert.equal(bind(service, "ou_alice").id, "user_alice");
    assert.equal(bind(service, "ou_bob").id, "user_bob");
  });

  test("repeated login keeps identity while updating profile", () => {
    const { crm: service } = makeService();
    const first = service.actorByFeishu({ openId: "ou_repeat", name: "旧名字" });
    const again = service.actorByFeishu({ openId: "ou_repeat", name: "新名字", avatarUrl: "https://example.com/avatar.png" });
    assert.equal(again.id, first.id);
    assert.equal(again.name, "新名字");
    assert.equal(again.avatarUrl, "https://example.com/avatar.png");
  });

  test("disabled bound user is rejected", () => {
    const { db, crm: service } = makeService();
    const actor = bind(service, "ou_disabled");
    db.prepare("UPDATE users SET active=0 WHERE id=?").run(actor.id);
    assert.throws(() => bind(service, "ou_disabled"), /已停用/);
  });
});

describe("OAuth diagnostics",()=>{
  test("only localhost can read diagnostics and credentials are stripped",async()=>{
    process.env.OAUTH_DEBUG="true";process.env.OAUTH_DEBUG_PATH=`/tmp/magic-crm-oauth-test-${process.pid}.ndjson`;clearOAuthDiagnostics();oauthDiagnostic("security_test","info",{code:"secret-code",token:"secret-token",message:"Bearer private-token",challengeLength:43});
    const local=await diagnosticsGet(new Request("http://localhost:3000/api/debug/oauth"));const payload=await local.json();
    assert.equal(local.status,200);assert.equal(payload.events[0].detail.code,undefined);assert.equal(payload.events[0].detail.token,undefined);assert.equal(payload.events[0].detail.message,"Bearer [redacted]");assert.equal(payload.events[0].detail.challengeLength,43);
    const remote=await diagnosticsGet(new Request("https://example.com/api/debug/oauth"));assert.equal(remote.status,404);delete process.env.OAUTH_DEBUG;delete process.env.OAUTH_DEBUG_PATH;
  });
});

describe("OAuth 2.1, Feishu callback and MCP", () => {
  beforeEach(() => {
    resetDb();
    process.env.LARK_APP_ID = "cli_test";
    process.env.LARK_APP_SECRET = "test_secret";
    process.env.FEISHU_OAUTH_REDIRECT_URI = "https://localhost:3000/oauth/feishu/callback";
  });

  function tokens() {
    bind(crm, "ou_admin", "Admin");
    const alice = bind(crm, "ou_alice", "Alice");
    const verifier = "v".repeat(64);
    const client = registerClient({ client_name: "test-client", redirect_uris: ["http://127.0.0.1:3456/callback"], token_endpoint_auth_method: "none" });
    const request = createAuthorizationRequest({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], state: "state-1", scope: "mcp:invoke", code_challenge: base64urlSha256(verifier), code_challenge_method: "S256" });
    const redirect = new URL(approveAuthorization(request.requestId, request.csrf, alice.id, "ou_alice"));
    const result = exchangeCode({ grant_type: "authorization_code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], code: redirect.searchParams.get("code")!, code_verifier: verifier });
    return { client, result };
  }

  test("authorize redirects to Feishu instead of an account selector", async () => {
    const client = registerClient({ redirect_uris: ["https://www.doubao.com/oauth/callback"] });
    const url = new URL("https://localhost:3000/oauth/authorize");
    url.search = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_challenge: base64urlSha256("x".repeat(64)), code_challenge_method: "S256", scope: "mcp:invoke" }).toString();
    const response = await authorizeGet(new Request(url));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.hostname, "accounts.feishu.cn");
    assert.equal(location.searchParams.get("redirect_uri"), "https://localhost:3000/oauth/feishu/callback");
    assert.match(location.searchParams.get("state")!, /^authreq_.+\.csrf_.+$/);
  });

  test("complete Feishu login returns a CRM code that passes PKCE exchange", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/oauth/token")) return Response.json({ code: 0, access_token: "feishu_token", open_id: "ou_first" });
      if (url.includes("/user_info")) return Response.json({ code: 0, data: { open_id: "ou_first", name: "飞书管理员", avatar_url: "https://example.com/a.png" } });
      throw new Error(`unexpected fetch: ${url}`);
    };
    try {
      const verifier = "z".repeat(64);
      const client = registerClient({ redirect_uris: ["https://www.doubao.com/oauth/callback"] });
      const authorizeUrl = new URL("https://localhost:3000/oauth/authorize");
      authorizeUrl.search = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], state: "doubao-state", code_challenge: base64urlSha256(verifier), code_challenge_method: "S256", scope: "mcp:invoke" }).toString();
      const authorize = await authorizeGet(new Request(authorizeUrl));
      const feishu = new URL(authorize.headers.get("location")!);
      const callback = await feishuCallbackGet(new Request(`https://localhost:3000/oauth/feishu/callback?code=feishu_code&state=${encodeURIComponent(feishu.searchParams.get("state")!)}`));
      assert.equal(callback.status, 302);
      const doubao = new URL(callback.headers.get("location")!);
      assert.equal(doubao.searchParams.get("state"), "doubao-state");
      const token = exchangeCode({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], code: doubao.searchParams.get("code")!, code_verifier: verifier });
      assert.equal(verifyAccessToken(token.access_token)?.user_id, "user_admin");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("denial and expired state render friendly errors", async () => {
    const denied = await feishuCallbackGet(new Request("https://localhost:3000/oauth/feishu/callback?error=access_denied&error_description=no"));
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /取消了飞书授权/);

    const client = registerClient({ redirect_uris: ["https://www.doubao.com/oauth/callback"] });
    const request = createAuthorizationRequest({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_challenge: base64urlSha256("q".repeat(64)), code_challenge_method: "S256", scope: "mcp:invoke" });
    getDb().prepare("UPDATE oauth_requests SET expires_at=0 WHERE id=?").run(request.requestId);
    const expired = await feishuCallbackGet(new Request(`https://localhost:3000/oauth/feishu/callback?code=x&state=${request.requestId}.${request.csrf}`));
    assert.match(await expired.text(), /授权请求已经失效/);
  });

  test("authorization code is bound to S256 PKCE and cannot be replayed", () => {
    const actor = bind(crm, "ou_pkce");
    const verifier = "a".repeat(64);
    const client = registerClient({ redirect_uris: ["http://localhost:3333/callback"] });
    const request = createAuthorizationRequest({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_challenge: base64urlSha256(verifier), code_challenge_method: "S256", scope: "mcp:invoke" });
    const redirect = new URL(approveAuthorization(request.requestId, request.csrf, actor.id, "ou_pkce"));
    const code = redirect.searchParams.get("code")!;
    assert.throws(() => exchangeCode({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], code, code_verifier: "b".repeat(64) }), /PKCE/);
    assert.throws(() => exchangeCode({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], code, code_verifier: verifier }), /授权码无效/);
  });

  test("token stops working when Feishu binding changes or user is disabled", () => {
    const { result } = tokens();
    assert.ok(verifyAccessToken(result.access_token));
    getDb().prepare("UPDATE users SET feishu_open_id='ou_changed' WHERE id='user_alice'").run();
    assert.equal(verifyAccessToken(result.access_token), null);

    const next = tokens();
    const nextRecord = verifyAccessToken(next.result.access_token)!;
    getDb().prepare("UPDATE users SET active=0 WHERE id=?").run(nextRecord.user_id);
    assert.equal(verifyAccessToken(next.result.access_token), null);
  });

  test("MCP uses the CRM actor bound to the Feishu identity", async () => {
    const { result } = tokens();
    const initialize = new NextRequest("http://localhost:3000/api/mcp", { method: "POST", headers: { authorization: `Bearer ${result.access_token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } }) });
    const initResponse = await mcpPost(initialize);
    assert.equal(initResponse.status, 200);
    const session = initResponse.headers.get("Mcp-Session-Id");
    const call = new NextRequest("http://localhost:3000/api/mcp", { method: "POST", headers: { authorization: `Bearer ${result.access_token}`, "Mcp-Session-Id": session!, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "crm_summary_get", arguments: {} } }) });
    const response = await mcpPost(call);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.structuredContent.customerCount, 2);
  });
});
