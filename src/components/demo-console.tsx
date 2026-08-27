"use client";

import { useEffect, useState } from "react";

type Props = { baseUrl: string; callbackUrl: string; initialFeishuConfigured: boolean };
type Health = "loading" | "ok" | "error";
type DiagnosticEvent = { id:number; at:string; stage:string; level:"info"|"success"|"error"; detail?:Record<string,string|number|boolean|null> };

export function DemoConsole({ baseUrl, callbackUrl, initialFeishuConfigured }: Props) {
  const [health, setHealth] = useState<Health>("loading");
  const [feishuConfigured, setFeishuConfigured] = useState(initialFeishuConfigured);
  const [copied, setCopied] = useState("");
  const [diagnostics,setDiagnostics]=useState<DiagnosticEvent[]>([]);
  const endpoints = [
    { label: "豆包 MCP 连接器地址", value: `${baseUrl}/api/mcp` },
    { label: "OAuth 授权端点（豆包自动发现）", value: `${baseUrl}/oauth/authorize` },
    { label: "飞书开放平台回调地址（必须精确登记）", value: callbackUrl },
  ];

  useEffect(() => {
    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as { data?: { feishuOauthConfigured?: boolean } };
        setFeishuConfigured(Boolean(payload.data?.feishuOauthConfigured));
        setHealth("ok");
      })
      .catch(() => setHealth("error"));
    const load=()=>fetch("/api/debug/oauth").then((response)=>response.ok?response.json():null).then((payload)=>{if(payload?.events)setDiagnostics(payload.events);}).catch(()=>undefined);
    void load();const timer=window.setInterval(()=>void load(),2000);return()=>window.clearInterval(timer);
  }, []);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function clearDiagnostics(){await fetch("/api/debug/oauth",{method:"DELETE"});setDiagnostics([]);}

  return <main className="demoPage">
    <header className="demoHero"><a href="/">← 返回 CRM</a><span className={`health ${health}`}>{health === "loading" ? "检测中" : health === "ok" ? "服务正常" : "服务异常"}</span><h1>MCP 演示控制台</h1><p>确认本地 CRM、飞书登录、OAuth 2.1 和 MCP 服务状态。</p></header>
    <section className="demoSection"><div className="stepTitle"><span>1</span><div><h2>配置飞书登录</h2><p>创建飞书开放平台应用，将回调地址逐字登记，然后把应用凭证写入本地环境。</p></div></div><div className={`warning ${feishuConfigured ? "configured" : ""}`}>飞书 OAuth：{feishuConfigured ? "已配置" : "未配置 LARK_APP_ID / LARK_APP_SECRET"}</div><div className="endpoint"><div><small>飞书开放平台重定向 URL</small><code>{callbackUrl}</code></div><button onClick={() => void copy(callbackUrl, "callback")}>{copied === "callback" ? "已复制" : "复制"}</button></div><p className="note">使用 localhost 回调，让飞书授权浏览器直接回到当前电脑上的服务。</p></section>
    <section className="demoSection"><div className="stepTitle"><span>2</span><div><h2>使用豆包本地 MCP 注入</h2><p>本地注入助手可直接访问电脑上的 Next.js 服务，不需要公网隧道。</p></div></div><pre><code>{baseUrl}/api/mcp</code></pre><p className="note">保持本地服务运行，并在豆包工作中注入以上地址。助手会在本机随机端口接收 OAuth 回调。</p></section>
    <section className="demoSection"><div className="stepTitle"><span>3</span><div><h2>复制连接器地址</h2><p>在豆包工作创建自定义 MCP 连接器时使用第一项。</p></div></div><div className="endpointList">{endpoints.map((item) => <div className="endpoint" key={item.label}><div><small>{item.label}</small><code>{item.value}</code></div><button onClick={() => void copy(item.value, item.label)}>{copied === item.label ? "已复制" : "复制"}</button></div>)}</div></section>
    <section className="demoSection"><div className="stepTitle"><span>4</span><div><h2>完成双层 OAuth</h2><p>豆包建立 PKCE 请求；本服务再跳转飞书确认真实用户身份。</p></div></div><ol className="flow"><li>本地注入助手读取 OAuth 元数据并动态注册</li><li>浏览器跳到飞书登录与授权</li><li>飞书回调本机，首次用户成为管理员，后续用户绑定销售账号</li><li>本机把 CRM 授权码交给助手的随机回调端口</li><li>助手换取 Token 并初始化 MCP</li></ol><div className="warning">CRM 网页右上角仍可切换内置演示账号；该功能只用于页面演示，不会改变 MCP Token 绑定的飞书身份。</div></section>
    <section className="demoSection"><div className="stepTitle"><span>5</span><div><h2>OAuth 实时诊断</h2><p>重新注入后，这里会自动显示请求经过的阶段和第一个失败原因。</p></div></div><div style={{display:"flex",justifyContent:"flex-end",margin:"12px 0"}}><button onClick={()=>void clearDiagnostics()}>清空诊断</button></div><div style={{display:"grid",gap:8}}>{diagnostics.length===0?<p className="note">暂无诊断事件，请重新执行一次 MCP 注入。</p>:diagnostics.slice().reverse().map((event)=><div key={event.id} style={{border:"1px solid #e5e6eb",borderLeft:`4px solid ${event.level==="error"?"#d4380d":event.level==="success"?"#31a24c":"#3370ff"}`,borderRadius:9,padding:"10px 12px",fontSize:13}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{event.stage}</strong><span style={{color:"#8f959e"}}>{new Date(event.at).toLocaleTimeString()}</span></div>{event.detail&&<code style={{display:"block",marginTop:7,overflowWrap:"anywhere",color:"#4e5969"}}>{JSON.stringify(event.detail)}</code>}</div>)}</div></section>
    <section className="demoSection"><div className="stepTitle"><span>6</span><div><h2>推荐演示问题</h2><p>连接成功后，在豆包工作中测试权限、查询和写入。</p></div></div><div className="prompts"><button onClick={() => void copy("汇总当前账号能看到的客户和最近 30 天跟进情况。", "prompt1")}>汇总我的 CRM 数据</button><button onClick={() => void copy("搜索所有处于意向阶段的客户，并告诉我下一步应该优先跟进谁。", "prompt2")}>分析意向客户</button><button onClick={() => void copy("为远景科技新增一条电话跟进：已确认下周进行方案评审。", "prompt3")}>新增跟进记录</button></div></section>
  </main>;
}
