import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { schema } from "../src/lib/db/schema";
import { seed } from "../src/lib/db/seed";
import { CrmService } from "../src/lib/crm/service";
import { resetDb } from "../src/lib/db";
import { approveAuthorization, createAuthorizationRequest, exchangeCode, registerClient } from "../src/lib/oauth";
import { base64urlSha256 } from "../src/lib/ids";
import { POST as mcpPost } from "../src/app/api/mcp/route";

function service(){const db=new Database(":memory:");db.exec(schema);seed(db);return {db,crm:new CrmService(db)};}

describe("CRM business service",()=>{
  test("sales users only see records they own",()=>{const {crm}=service();const alice=crm.actor("user_alice");const bob=crm.actor("user_bob");assert.equal(crm.customerSearch(alice).total,2);assert.equal(crm.customerSearch(bob).total,2);assert.throws(()=>crm.customerGet(alice,"cust_green"),/无权访问/);});
  test("admin can see all records and assign an owner",()=>{const {crm}=service();const admin=crm.actor("user_admin");assert.equal(crm.customerSearch(admin).total,4);const item=crm.customerCreate(admin,{name:"客户演示",ownerId:"user_bob",stage:"意向"});assert.equal(item.ownerId,"user_bob");});
  test("creating an activity updates customer follow-up summary",()=>{const {crm}=service();const alice=crm.actor("user_alice");const occurredAt="2026-08-20T08:00:00.000Z";const nextFollowUpAt="2026-09-01T08:00:00.000Z";crm.activityCreate(alice,{customerId:"cust_acme",contactId:"contact_li",subject:"方案评审",type:"电话",occurredAt,nextFollowUpAt});const customer=crm.customerGet(alice,"cust_acme");assert.equal(customer.lastFollowUpAt,occurredAt);assert.equal(customer.nextFollowUpAt,nextFollowUpAt);});
  test("archiving demo data requires an administrator",()=>{const {crm}=service();assert.throws(()=>crm.archiveDemo(crm.actor("user_alice")),/只有管理员/);assert.ok(crm.archiveDemo(crm.actor("user_admin")).archivedCount>0);assert.equal(crm.customerSearch(crm.actor("user_admin")).total,0);});
});

describe("OAuth 2.1 and MCP",()=>{
  beforeEach(()=>resetDb());

  function tokens(){const verifier="v".repeat(64);const client=registerClient({client_name:"test-client",redirect_uris:["http://127.0.0.1:3456/callback"],token_endpoint_auth_method:"none"});const request=createAuthorizationRequest({response_type:"code",client_id:client.client_id,redirect_uri:client.redirect_uris[0],state:"state-1",scope:"mcp:invoke",code_challenge:base64urlSha256(verifier),code_challenge_method:"S256"});const redirect=new URL(approveAuthorization(request.requestId,request.csrf,"user_alice"));const result=exchangeCode({grant_type:"authorization_code",client_id:client.client_id,redirect_uri:client.redirect_uris[0],code:redirect.searchParams.get("code")!,code_verifier:verifier});return {client,result};}

  test("authorization code is bound to S256 PKCE and cannot be replayed",()=>{const verifier="a".repeat(64);const client=registerClient({redirect_uris:["http://localhost:3333/callback"]});const request=createAuthorizationRequest({response_type:"code",client_id:client.client_id,redirect_uri:client.redirect_uris[0],code_challenge:base64urlSha256(verifier),code_challenge_method:"S256",scope:"mcp:invoke"});const redirect=new URL(approveAuthorization(request.requestId,request.csrf,"user_admin"));const code=redirect.searchParams.get("code")!;assert.throws(()=>exchangeCode({client_id:client.client_id,redirect_uri:client.redirect_uris[0],code,code_verifier:"b".repeat(64)}),/PKCE/);assert.throws(()=>exchangeCode({client_id:client.client_id,redirect_uri:client.redirect_uris[0],code,code_verifier:verifier}),/授权码无效/);});

  test("MCP initializes a session and exposes CRM tools",async()=>{const {result}=tokens();const initialize=new NextRequest("http://localhost:3000/api/mcp",{method:"POST",headers:{authorization:`Bearer ${result.access_token}`,"content-type":"application/json",accept:"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"test",version:"1.0.0"}}})});const initResponse=await mcpPost(initialize);assert.equal(initResponse.status,200);const session=initResponse.headers.get("Mcp-Session-Id");assert.ok(session);const listRequest=new NextRequest("http://localhost:3000/api/mcp",{method:"POST",headers:{authorization:`Bearer ${result.access_token}`,"Mcp-Session-Id":session!,"content-type":"application/json",accept:"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list",params:{}})});const listResponse=await mcpPost(listRequest);assert.equal(listResponse.status,200);const payload=await listResponse.json();assert.equal(payload.result.tools.length,11);assert.ok(payload.result.tools.map((tool:{name:string})=>tool.name).includes("crm_summary_get"));});
});
