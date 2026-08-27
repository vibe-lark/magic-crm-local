# 本地 HTTPS 一键部署

## Table of Contents

- [为什么 localhost 也需要 HTTPS](#为什么-localhost-也需要-https)
- [一键启动](#一键启动)
- [脚本做了什么](#脚本做了什么)
- [macOS 与 Linux 差异](#macos-与-linux-差异)
- [地址与证书关系](#地址与证书关系)
- [手动配置](#手动配置)
- [日常使用与更新](#日常使用与更新)
- [故障排查](#故障排查)
- [安全边界](#安全边界)

## 为什么 localhost 也需要 HTTPS

豆包本地 MCP 注入助手能直接请求 `localhost`，所以不需要公网隧道。但助手在打开 OAuth 浏览器前会校验 `authorization_endpoint`，HTTP 地址会被拒绝：

```text
INVALID_AUTHORIZATION_URL
reason=invalid_https_url
```

因此 MCP、OAuth discovery、authorization、token 和飞书 callback 都统一使用 `https://localhost:3000`。HTTPS 只在当前电脑上终止，不会把 CRM 数据上传到公网。

## 一键启动

未安装 Bun 时直接运行：

```bash
bash scripts/local-demo.sh
```

已安装 Bun 时运行：

```bash
bun run local
```

首次运行可能要求系统密码或 sudo，这是 macOS Keychain 或 Linux 系统证书库信任本地 CA 的正常安全步骤。脚本不会读取或保存系统密码。

首次输入飞书 App ID/Secret 后，脚本会自动复制 callback，并打开该应用的飞书开放平台“安全设置”页面：

```text
https://open.feishu.cn/app/<LARK_APP_ID>/safe
```

在“重定向 URL”中粘贴并保存后，回到终端按回车继续。已有凭证时脚本会询问是否重新打开；也可随时运行 `bun run local -- --open-feishu`。

脚本完成后会输出三个固定地址：

```text
CRM:             https://localhost:3000
MCP connector:   https://localhost:3000/api/mcp
Feishu callback: https://localhost:3000/oauth/feishu/callback
```

必须把最后一项逐字登记到飞书开放平台，再用 MCP connector 地址创建豆包本地连接器。旧 HTTP 连接器缓存了错误的 OAuth metadata，需要删除后重建。

## 脚本做了什么

`scripts/local-demo.sh` 按顺序执行：

1. 检测 macOS/Linux、Bun、curl、OpenSSL 和 mkcert。
2. 缺少工具时通过 Homebrew、apt/dnf 或官方安装器补齐。
3. 安装 mkcert 本地 CA 到操作系统和浏览器信任库。
4. 生成包含 `localhost`、`127.0.0.1`、`::1` 的证书。
5. 将私钥权限设为 `0600`，证书剩余不足 30 天时自动重建。
6. 创建或保留 `.env.local`，只交互补充缺失的飞书 App ID/Secret。
7. 首次配置时复制 callback、打开当前应用的 `/safe` 安全设置，并等待用户保存确认。
8. 强制统一 HTTPS base URL、飞书 callback 和允许的 Origin。
9. 安装依赖并执行幂等数据库初始化。
10. 检查 3000 端口，启动 Next.js，验证证书、health 和 OAuth metadata。

脚本不会覆盖已有飞书凭证，不会自动重置 CRM 数据，也不会杀死占用 3000 端口的未知进程。

## macOS 与 Linux 差异

### macOS

- 依赖 Homebrew 安装 mkcert。
- CA 由 mkcert 加入 macOS Keychain，Doubao/Chromium 会读取系统信任。
- 第一次安装 CA 可能请求管理员密码。

### Linux

- 支持 apt 和 dnf；自动安装 `ca-certificates`、OpenSSL 与 NSS 工具。
- mkcert 固定下载 `v1.4.4`，支持 x86_64 与 arm64。
- `mkcert -install` 会更新系统 CA 和可发现的 NSS 浏览器证书库，通常需要 sudo。
- 其他包管理器需手动安装 mkcert/NSS 后再运行脚本。

## 地址与证书关系

| 地址 | 用途 | 谁访问 |
| --- | --- | --- |
| `https://localhost:3000/api/mcp` | Streamable HTTP MCP | 豆包本地助手 |
| `https://localhost:3000/oauth/authorize` | CRM OAuth 授权入口 | 豆包打开的浏览器 |
| `https://localhost:3000/oauth/feishu/callback` | 飞书授权回调 | 用户浏览器 |
| `http://127.0.0.1:<随机端口>` | CRM code 返回豆包助手 | 用户浏览器/本地助手 |

最后一项由豆包动态注册，HTTP loopback callback 符合 OAuth 原生应用规则；它不是飞书开放平台 callback，也不需要写入环境变量。

## 手动配置

脚本不可用时，可手动执行：

```bash
mkcert -install
mkdir -p .cert
mkcert -cert-file .cert/localhost.pem \
  -key-file .cert/localhost-key.pem \
  localhost 127.0.0.1 ::1
chmod 600 .cert/localhost-key.pem
cp .env.example .env.local
bun install
bun run db:init
bun run dev
```

`.env.local` 的关键配置：

```dotenv
APP_BASE_URL=https://localhost:3000
FEISHU_OAUTH_REDIRECT_URI=https://localhost:3000/oauth/feishu/callback
MCP_ALLOWED_ORIGINS=https://localhost:3000,https://127.0.0.1:3000
```

## 日常使用与更新

```bash
bun run local                 # 日常启动；配置步骤幂等
bun run local:setup           # 只准备环境，适合演示前预装
bun run local:check           # 服务运行时执行只读检查
bun run local -- --open-feishu # 重新复制 callback 并打开安全设置
bun run local -- --reset-db   # 明确丢弃本地演示修改并重置
```

`.cert/`、`.env.local`、SQLite 和 OAuth 诊断文件均被 Git 忽略。复制项目到另一台电脑时必须重新安装本地 CA 和生成证书，不能复制私钥。

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `invalid_https_url` | 使用了旧 HTTP 连接器 | 删除旧连接器，用 HTTPS 地址重建 |
| `certificate authority invalid` | CA 未被系统或豆包信任 | 重新运行 `mkcert -install`，彻底退出并重开豆包 |
| 飞书 `redirect_uri` 错误 | 平台仍登记 HTTP callback | 改为精确的 HTTPS callback |
| 未自动打开安全设置 | 系统缺少 `open`/`xdg-open` 或没有桌面环境 | 使用终端打印的 `/safe` 链接手动打开；callback 也会完整打印 |
| `Port 3000 is already in use` | 已有服务或其他程序占用 | 停止对应进程，不要让脚本自动杀进程 |
| health 成功但授权不弹窗 | 连接器缓存旧 metadata | 删除连接器并重新注入 |
| Linux 浏览器仍不信任 | NSS 库未更新或浏览器未重启 | 安装 NSS 工具，重跑 `mkcert -install` 并重启客户端 |

可打开 `https://localhost:3000/demo` 查看脱敏 OAuth 诊断，或运行：

```bash
bun run local:check
```

## 安全边界

- 本地 CA 只用于开发演示，不替代互联网生产证书。
- `.cert/localhost-key.pem` 和 `.env.local` 权限为 `0600`，不得分享或提交。
- OAuth 诊断不记录 authorization code、Token、PKCE 原文或飞书密钥。
- 脚本只监听本机服务，不创建公网隧道，不上传数据库。
- 不再使用本项目时，可按 mkcert 输出的 CAROOT 删除本地 CA，并从系统信任库移除对应证书。
