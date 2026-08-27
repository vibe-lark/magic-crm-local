import { CrmError } from "@/lib/crm/error";
import { crm } from "@/lib/crm/service";
import { approveAuthorization, createAuthorizationRequest } from "@/lib/oauth";

export const runtime="nodejs";

function esc(value:unknown){return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));}
function page(content:string,status=200){return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>授权妙笔 CRM</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(145deg,#f4f7ff,#eef1f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#1f2329}.card{width:min(460px,calc(100% - 32px));background:#fff;border:1px solid #e5e6eb;border-radius:20px;padding:32px;box-shadow:0 24px 70px rgba(31,35,41,.12)}.logo{width:54px;height:54px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,#3370ff,#7f3bf5);color:#fff;font-size:25px;margin-bottom:22px}h1{font-size:24px;margin:0 0 10px}p{color:#646a73;line-height:1.65;margin:0 0 24px}.scope{background:#f5f7ff;border-radius:12px;padding:14px;margin:18px 0}.scope b{display:block;margin-bottom:5px}label{display:grid;gap:7px;font-weight:600;margin:18px 0 24px}select{padding:11px 12px;border:1px solid #c9cdd4;border-radius:9px;background:#fff;font:inherit}.actions{display:flex;gap:10px}.btn{flex:1;border:0;border-radius:10px;padding:12px;font:inherit;font-weight:650;cursor:pointer}.primary{background:#3370ff;color:#fff}.secondary{background:#f2f3f5;color:#4e5969}.error{color:#c93532;background:#fff1f0;padding:12px;border-radius:9px}</style></head><body>${content}</body></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});}

export async function GET(request:Request){
  try{
    const params=Object.fromEntries(new URL(request.url).searchParams.entries());const auth=createAuthorizationRequest(params);
    const options=crm.users().map((user)=>`<option value="${esc(user.id)}">${esc(user.name)} · ${user.isAdmin?"管理员":"销售"}</option>`).join("");
    return page(`<main class="card"><div class="logo">✦</div><h1>授权访问妙笔 CRM</h1><p><strong>${esc(auth.client.client_name)}</strong> 希望连接本地 CRM 演示服务。</p><div class="scope"><b>允许执行 CRM 操作</b><span>根据所选账号的权限查询和维护客户、联系人及跟进记录。</span></div><form method="post"><input type="hidden" name="request_id" value="${esc(auth.requestId)}"><input type="hidden" name="csrf" value="${esc(auth.csrf)}"><label>以哪个演示账号授权？<select name="user_id">${options}</select></label><div class="actions"><button class="btn secondary" type="button" onclick="window.close()">取消</button><button class="btn primary" type="submit">确认授权</button></div></form></main>`);
  }catch(error){const message=error instanceof Error?error.message:"授权请求无效";return page(`<main class="card"><div class="logo">!</div><h1>无法开始授权</h1><p class="error">${esc(message)}</p></main>`,400);}
}

export async function POST(request:Request){
  try{const form=await request.formData();const target=approveAuthorization(String(form.get("request_id")||""),String(form.get("csrf")||""),String(form.get("user_id")||""));return Response.redirect(target,302);}
  catch(error){const message=error instanceof Error?error.message:"授权失败";return page(`<main class="card"><div class="logo">!</div><h1>授权失败</h1><p class="error">${esc(message)}</p></main>`,400);}
}
