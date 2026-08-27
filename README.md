# 妙笔 CRM 独立演示项目

这是一个可完全在本地运行的 CRM + MCP 客户演示项目，包含客户、联系人、跟进和权限业务，并通过真实飞书 OAuth 登录完成 MCP 授权。

一个 Next.js 进程同时提供：

- 响应式 CRM 网页
- SQLite 本地数据库
- 管理员/销售演示身份和数据隔离
- CRM REST API
- MCP Streamable HTTP 服务
- OAuth 2.1、动态客户端注册和 S256 PKCE
- 飞书 OAuth 用户登录与 CRM 账号绑定
- 豆包工作接入与诊断控制台

## 快速开始

macOS 或 Linux 首次启动直接执行：

```bash
bash scripts/local-demo.sh
```

脚本会检查并安装 Bun、mkcert 和系统证书工具，安全读取缺失的飞书凭证，生成本机可信证书、初始化 SQLite，再启动 HTTPS 服务。首次输入飞书凭证后，脚本会复制 callback、打开当前应用的飞书安全设置页；粘贴保存重定向 URL 后按回车即可继续。首次信任本地 CA 时，操作系统会正常要求密码或 sudo。

已安装 Bun 时也可使用：

```bash
bun run local          # 配置并启动
bun run local:setup    # 只配置，不启动
bun run local:check    # 只读检查当前部署
bun run local -- --open-feishu  # 重新打开飞书安全设置
```

启动后还需在飞书开放平台精确登记 `https://localhost:3000/oauth/feishu/callback`。完整原理、手动安装、Linux 差异和故障排查见[本地 HTTPS 部署](docs/local-https.md)。

打开：

- CRM：<https://localhost:3000>
- MCP 演示控制台：<https://localhost:3000/demo>
- 健康检查：<https://localhost:3000/api/health>

项目会自动创建 `data/crm.sqlite` 并写入示例数据。种子数据中的姓名、公司、电话、邮箱、微信号和业务记录均为虚构内容，不代表任何真实个人或组织。需要恢复演示初始状态时执行：

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

豆包工作的本地 MCP 注入助手会直接访问你电脑上的 `localhost`，并在本机随机端口接收 OAuth 回调，不需要公网隧道。

### 1. 启动本地服务

```bash
bun run local
```

### 2. 确认本地根地址

`.env.local` 保持：

```dotenv
APP_BASE_URL=https://localhost:3000
```

打开 `/demo` 确认服务与飞书 OAuth 均已配置。

### 3. 注入连接器

在豆包工作添加自定义 MCP，填写：

```text
https://localhost:3000/api/mcp
```

豆包会自动：

1. 读取 Protected Resource Metadata。
2. 读取 OAuth Authorization Server Metadata。
3. 动态注册豆包自己的 `redirect_uri`。
4. 经本项目跳转飞书登录。
5. 飞书回调本机服务，本机再把 CRM 授权码交回豆包。
6. 使用 S256 PKCE 交换 Token。
7. 初始化 MCP Session 并读取工具列表。

首次成功登录的飞书用户绑定管理员，第二、第三位用户依次绑定两个内置销售账号；之后的新用户获得新的销售账号。CRM 网页仍保留内置账号切换，便于演示。

若授权失败，打开 `/demo` 的“OAuth 实时诊断”，清空后重新注入一次；日志不会记录 code、Token、PKCE 原文或飞书密钥。

## 本地 MCP 调试

推荐先用 MCP Inspector 验证本地服务，再接入豆包。由于 MCP 端点强制 OAuth，可使用 Inspector 的 OAuth 流程连接：

```text
https://localhost:3000/api/mcp
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
bun run local          # 一键配置并启动 HTTPS 演示
bun run local:setup    # 只配置依赖、环境、证书和数据库
bun run local:check    # 只读检查证书、配置和运行端点
bun run local -- --open-feishu  # 复制 callback 并打开飞书安全设置
bun run local -- --reset-db  # 重置演示数据后启动
bun run dev            # 使用已有证书启动 HTTPS 开发服务
bun run dev:http       # 仅网页调试；不能用于豆包 OAuth
bun run build          # 生产构建验证
bun run public:check   # 对外发布安全检查
bun run typecheck      # TypeScript 检查
bun run test           # 自动化测试（使用 Node 加载原生 SQLite）
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
    ├── feishu-oauth.ts  # 飞书登录与用户信息
    └── oauth.ts         # OAuth 2.1/PKCE 实现
docs/                    # 架构、OAuth、MCP 与客户演示说明
scripts/                 # 本地部署、数据库初始化和发布检查
tests/                   # 业务、OAuth 与 MCP 测试
```

## 安全边界

本项目用于本地客户演示，不是生产身份系统：

- 网页账号切换是刻意提供的演示能力，浏览器 Cookie 不代表企业 SSO。
- MCP 身份来自飞书登录；网页账号切换仅用于本地 UI 演示。
- 授权码一次性使用，Access/Refresh Token 只以 SHA-256 摘要保存在 SQLite。
- OAuth 只接受精确登记的 `redirect_uri`，并强制 S256 PKCE。
- MCP Session 只保存在当前进程；重启后客户端需要重新初始化。
- 本地注入只需监听 localhost；不要将数据库文件、应用密钥或诊断信息提交到代码仓库。

## 对外发布

公开源码前先轮换曾用于开发或演示的飞书 App Secret，并运行：

```bash
bun run public:check
```

该检查会拒绝被 Git 跟踪的环境文件、证书、私钥、数据库、日志、构建缓存、内部域名、本机路径和明显凭据。系统已安装 [Gitleaks](https://github.com/gitleaks/gitleaks) 时，还会扫描当前跟踪文件与完整 Git 历史。

不要直接压缩开发工作目录：其中可能存在被 Git 正确忽略、但仍然真实存在的 `.env.local`、`.cert/` 和本地数据库。应从干净 clone 发布，或只导出 Git 跟踪内容：

```bash
git archive --format=zip --output=magic-crm-demo.zip HEAD
```

项目以 [MIT License](LICENSE) 开源。`package.json` 保持 `private: true`，表示当前交付物是源码项目，不是待发布到 npm 的应用包。

## 延伸阅读

- [技术架构](docs/architecture.md)
- [本地 HTTPS 一键部署](docs/local-https.md)
- [OAuth 2.1 与 PKCE](docs/oauth.md)
- [MCP 接口与工具](docs/mcp.md)
- [客户演示脚本](docs/demo-guide.md)
