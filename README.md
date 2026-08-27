# 妙笔 CRM 独立演示项目

这是一个可完全在本地运行的 CRM + MCP 客户演示项目。它从原妙笔 CRM 中提取了客户、联系人、跟进和权限业务，不依赖妙笔 FaaS、飞书登录、飞书多维表格、Redis 或任何私有平台运行时。

一个 Next.js 进程同时提供：

- 响应式 CRM 网页
- SQLite 本地数据库
- 管理员/销售演示身份和数据隔离
- CRM REST API
- MCP Streamable HTTP 服务
- OAuth 2.1、动态客户端注册和 S256 PKCE
- 豆包工作接入与诊断控制台

## 快速开始

环境要求：Node.js 20+、Bun 1.3+。首次启动执行：

```bash
cp .env.example .env.local
bun install
bun run db:init
bun run dev
```

打开：

- CRM：<http://localhost:3000>
- MCP 演示控制台：<http://localhost:3000/demo>
- 健康检查：<http://localhost:3000/api/health>

项目会自动创建 `data/crm.sqlite` 并写入示例数据。需要恢复演示初始状态时执行：

```bash
bun run db:reset
```

## CRM 功能

- 总览：客户数、线索与意向、联系人数、近 30 天跟进和待跟进客户。
- 客户：搜索、阶段筛选、创建、编辑、详情和归档。
- 联系人：按姓名、职位、客户和联系方式搜索，创建、编辑、详情和归档。
- 跟进：按主题、客户、内容和类型搜索，创建、编辑、详情和归档。
- 权限：管理员查看全部数据；销售只能查看和维护本人负责的数据。
- 身份切换：右上角直接切换内置账号，便于演示权限差异。

归档是软删除。页面默认不展示已归档记录，数据库仍保留它们。

## 在豆包工作中连接本地 MCP

豆包工作不能访问你电脑上的 `localhost`。本项目仍在本机运行，只使用 HTTPS 隧道让豆包访问它。

### 1. 启动本地服务

```bash
bun run dev
```

### 2. 建立 HTTPS 隧道

安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)，然后执行：

```bash
cloudflared tunnel --url http://localhost:3000
```

终端会返回类似 `https://example.trycloudflare.com` 的临时地址。

### 3. 更新公开根地址

编辑 `.env.local`：

```dotenv
APP_BASE_URL=https://example.trycloudflare.com
```

重启 `bun run dev`，再打开 `/demo` 确认控制台显示的是 HTTPS 地址。

### 4. 注册连接器

在豆包工作添加自定义 MCP，填写：

```text
https://example.trycloudflare.com/api/mcp
```

豆包会自动：

1. 读取 Protected Resource Metadata。
2. 读取 OAuth Authorization Server Metadata。
3. 动态注册豆包自己的 `redirect_uri`。
4. 打开本项目的授权页。
5. 使用 S256 PKCE 交换 Token。
6. 初始化 MCP Session 并读取工具列表。

授权页选择管理员或销售账号即可。最终 OAuth 完成页面由豆包展示，因为授权码必须交回豆包后，豆包才能完成 Token 交换。

> 临时隧道地址每次可能变化。变化后需要更新 `APP_BASE_URL`、重启服务，并在豆包中重新创建或更新连接器。

## 本地 MCP 调试

推荐先用 MCP Inspector 验证本地服务，再接入豆包。由于 MCP 端点强制 OAuth，可使用 Inspector 的 OAuth 流程连接：

```text
http://localhost:3000/api/mcp
```

标准发现端点：

```text
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource/api/mcp
/oauth/register
/oauth/authorize
/oauth/token
/oauth/revoke
```

完整协议、工具参数和手工 PKCE 调试方式见 [docs/mcp.md](docs/mcp.md) 与 [docs/oauth.md](docs/oauth.md)。

## 常用命令

```bash
bun run dev          # 本地开发
bun run build        # 生产构建
bun run start        # 启动生产构建
bun run typecheck    # TypeScript 检查
bun test             # 自动化测试
bun run db:init      # 初始化数据库
bun run db:reset     # 重置为演示数据
```

## 项目结构

```text
src/
├── app/                 # 页面、REST、OAuth、MCP 路由
├── components/          # CRM 页面与演示控制台
└── lib/
    ├── crm/             # 纯业务模型、校验、权限和 Service
    ├── db/              # SQLite schema、连接与演示数据
    ├── mcp/             # MCP 工具定义与 Session
    └── oauth.ts         # OAuth 2.1/PKCE 实现
docs/                    # 架构、OAuth、MCP 与客户演示说明
scripts/                 # 数据库初始化脚本
tests/                   # 业务、OAuth 与 MCP 测试
```

## 安全边界

本项目用于本地客户演示，不是生产身份系统：

- 网页账号切换是刻意提供的演示能力，浏览器 Cookie 不代表企业 SSO。
- OAuth 授权页只能选择数据库中的启用账号。
- 授权码一次性使用，Access/Refresh Token 只以 SHA-256 摘要保存在 SQLite。
- OAuth 只接受精确登记的 `redirect_uri`，并强制 S256 PKCE。
- MCP Session 只保存在当前进程；重启后客户端需要重新初始化。
- 公网演示请使用临时隧道，不要将数据库文件提交或长期暴露。

## 延伸阅读

- [技术架构](docs/architecture.md)
- [OAuth 2.1 与 PKCE](docs/oauth.md)
- [MCP 接口与工具](docs/mcp.md)
- [客户演示脚本](docs/demo-guide.md)
