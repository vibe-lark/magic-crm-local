import { getDb } from "@/lib/db";
import { appBaseUrl, MCP_SCOPE } from "@/lib/config";
import { base64urlSha256, id, sha256 } from "@/lib/ids";
import { crm } from "@/lib/crm/service";
import { CrmError } from "@/lib/crm/error";

const CODE_TTL = 5 * 60_000;
const ACCESS_TTL = 60 * 60_000;
const REFRESH_TTL = 30 * 24 * 60 * 60_000;

type Client = { client_id: string; client_name: string; redirect_uris: string[]; token_endpoint_auth_method: "none" };
type TokenRecord = { client_id: string; user_id: string; scope: string; expires_at: number };

function validRedirectUri(raw: string): string {
  const url = new URL(raw);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new CrmError("invalid_client_metadata", "redirect_uri 必须使用 HTTPS；仅本机回环地址可使用 HTTP");
  }
  if (url.hash) throw new CrmError("invalid_client_metadata", "redirect_uri 不支持 fragment");
  return url.toString();
}

export function registerClient(input: Record<string, unknown>): Client {
  const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map((item) => validRedirectUri(String(item))) : [];
  if (!redirectUris.length || redirectUris.length > 10) throw new CrmError("invalid_client_metadata", "redirect_uris 必须包含 1-10 项");
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") throw new CrmError("invalid_client_metadata", "仅支持公开客户端");
  const client: Client = {
    client_id: id("crmclient"),
    client_name: String(input.client_name || "MCP Client").slice(0, 128),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
  };
  getDb().prepare("INSERT INTO oauth_clients (client_id,client_name,redirect_uris,created_at) VALUES (?,?,?,?)")
    .run(client.client_id, client.client_name, JSON.stringify(client.redirect_uris), Date.now());
  return client;
}

export function getClient(clientId: string): Client | null {
  const row = getDb().prepare("SELECT * FROM oauth_clients WHERE client_id=?").get(clientId) as Record<string, unknown> | undefined;
  return row ? { client_id:String(row.client_id),client_name:String(row.client_name),redirect_uris:JSON.parse(String(row.redirect_uris)),token_endpoint_auth_method:"none" } : null;
}

export function createAuthorizationRequest(input: Record<string, string>): { requestId: string; csrf: string; client: Client } {
  if (input.response_type !== "code" || input.code_challenge_method !== "S256") throw new CrmError("invalid_request", "仅支持 authorization_code + S256 PKCE");
  const client = getClient(input.client_id);
  if (!client || !client.redirect_uris.includes(new URL(input.redirect_uri).toString())) throw new CrmError("invalid_client", "客户端或回调地址无效");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.code_challenge)) throw new CrmError("invalid_request", "code_challenge 无效");
  if ((input.scope || MCP_SCOPE) !== MCP_SCOPE) throw new CrmError("invalid_scope", "scope 无效");
  const requestId=id("authreq");const csrf=id("csrf");
  getDb().prepare(`INSERT INTO oauth_requests (id,client_id,redirect_uri,client_state,code_challenge,scope,csrf,expires_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(requestId,client.client_id,new URL(input.redirect_uri).toString(),input.state||null,input.code_challenge,MCP_SCOPE,csrf,Date.now()+CODE_TTL);
  return {requestId,csrf,client};
}

export function approveAuthorization(requestId:string,csrf:string,userId:string):string {
  const db=getDb();const row=db.prepare("SELECT * FROM oauth_requests WHERE id=?").get(requestId) as Record<string,unknown>|undefined;
  if(!row||Number(row.expires_at)<=Date.now()||String(row.csrf)!==csrf) throw new CrmError("invalid_request","授权请求已失效");
  const actor=crm.actor(userId);const rawCode=id("crmcode",32);
  db.transaction(()=>{
    db.prepare("DELETE FROM oauth_requests WHERE id=?").run(requestId);
    db.prepare(`INSERT INTO oauth_codes (code_hash,client_id,redirect_uri,code_challenge,scope,user_id,expires_at) VALUES (?,?,?,?,?,?,?)`)
      .run(sha256(rawCode),row.client_id,row.redirect_uri,row.code_challenge,row.scope,actor.id,Date.now()+CODE_TTL);
  })();
  const target=new URL(String(row.redirect_uri));target.searchParams.set("code",rawCode);if(row.client_state)target.searchParams.set("state",String(row.client_state));
  return target.toString();
}

function issueTokens(record:TokenRecord) {
  const accessToken=id("crmat",32);const refreshToken=id("crmrt",32);const db=getDb();
  db.prepare("INSERT INTO oauth_access_tokens (token_hash,client_id,user_id,scope,expires_at) VALUES (?,?,?,?,?)")
    .run(sha256(accessToken),record.client_id,record.user_id,record.scope,Date.now()+ACCESS_TTL);
  db.prepare("INSERT INTO oauth_refresh_tokens (token_hash,client_id,user_id,scope,expires_at) VALUES (?,?,?,?,?)")
    .run(sha256(refreshToken),record.client_id,record.user_id,record.scope,Date.now()+REFRESH_TTL);
  return {access_token:accessToken,token_type:"Bearer",expires_in:ACCESS_TTL/1000,refresh_token:refreshToken,scope:record.scope};
}

export function exchangeCode(input:Record<string,string>) {
  const db=getDb();const codeHash=sha256(input.code||"");const row=db.prepare("SELECT * FROM oauth_codes WHERE code_hash=?").get(codeHash) as TokenRecord&{redirect_uri:string;code_challenge:string}|undefined;
  if(!row) throw new CrmError("invalid_grant","授权码无效");
  db.prepare("DELETE FROM oauth_codes WHERE code_hash=?").run(codeHash);
  if(row.expires_at<=Date.now()||row.client_id!==input.client_id||row.redirect_uri!==new URL(input.redirect_uri).toString()||base64urlSha256(input.code_verifier||"")!==row.code_challenge){
    throw new CrmError("invalid_grant","授权码、回调地址或 PKCE 校验失败");
  }
  return issueTokens(row);
}

export function refreshAccessToken(input:Record<string,string>) {
  const db=getDb();const hash=sha256(input.refresh_token||"");const row=db.prepare("SELECT * FROM oauth_refresh_tokens WHERE token_hash=?").get(hash) as TokenRecord|undefined;
  if(!row||row.expires_at<=Date.now()||row.client_id!==input.client_id) throw new CrmError("invalid_grant","Refresh Token 无效");
  db.prepare("DELETE FROM oauth_refresh_tokens WHERE token_hash=?").run(hash);
  crm.actor(row.user_id);
  return issueTokens(row);
}

export function verifyAccessToken(rawToken:string):TokenRecord|null {
  const row=getDb().prepare("SELECT client_id,user_id,scope,expires_at FROM oauth_access_tokens WHERE token_hash=?").get(sha256(rawToken)) as TokenRecord|undefined;
  if(!row||row.expires_at<=Date.now()) return null;
  try{crm.actor(row.user_id);return row;}catch{return null;}
}

export function revokeToken(rawToken:string):void {
  const hash=sha256(rawToken);const db=getDb();db.prepare("DELETE FROM oauth_access_tokens WHERE token_hash=?").run(hash);db.prepare("DELETE FROM oauth_refresh_tokens WHERE token_hash=?").run(hash);
}

export function authorizationServerMetadata() {
  const base=appBaseUrl();return {issuer:base,authorization_endpoint:`${base}/oauth/authorize`,token_endpoint:`${base}/oauth/token`,
    registration_endpoint:`${base}/oauth/register`,revocation_endpoint:`${base}/oauth/revoke`,response_types_supported:["code"],
    grant_types_supported:["authorization_code","refresh_token"],code_challenge_methods_supported:["S256"],
    token_endpoint_auth_methods_supported:["none"],scopes_supported:[MCP_SCOPE]};
}
