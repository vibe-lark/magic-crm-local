# MCP 服务与工具

## 端点

```text
POST   /api/mcp     初始化、通知与工具调用
GET    /api/mcp     SSE 接收通道
DELETE /api/mcp     结束 Session
OPTIONS /api/mcp    CORS 预检
```

除初始化请求外，客户端必须同时携带：

```http
Authorization: Bearer <OAuthAccessToken>
Mcp-Session-Id: <initialize 响应返回的 session id>
```

没有 Token 时返回 HTTP 401，并通过 `WWW-Authenticate` 指向 Protected Resource Metadata。

## 工具清单

| 工具 | 用途 | 关键参数 |
| --- | --- | --- |
| `crm_summary_get` | 汇总客户、线索、联系人、近期及待跟进 | 无 |
| `crm_customer_search` | 搜索客户 | `query`、`stage`、`ownerId`、分页 |
| `crm_customer_get` | 客户详情 | `customerId` |
| `crm_customer_create` | 创建客户 | `name`，其他客户字段可选 |
| `crm_customer_update` | 更新或归档客户 | `customerId`、`patch` |
| `crm_contact_search` | 搜索联系人 | `query`、`customerId`、分页 |
| `crm_contact_create` | 创建联系人 | `name`、`customerId` |
| `crm_contact_update` | 更新或归档联系人 | `contactId`、`patch` |
| `crm_activity_search` | 搜索跟进 | `query`、`customerId`、`contactId`、`type` |
| `crm_activity_add` | 新增跟进并同步客户汇总 | `subject`、`customerId`、`type` |
| `crm_activity_update` | 更新或归档跟进 | `activityId`、`patch` |

所有搜索工具支持：

```json
{
  "query": "关键词",
  "includeArchived": false,
  "pageSize": 50,
  "pageToken": "0"
}
```

响应包含 `items`、`total` 和 `nextPageToken`。工具结果同时写入 MCP `structuredContent` 和 JSON 文本，兼容支持或不支持结构化结果的客户端。

## 权限行为

- 管理员搜索结果包含所有销售的数据。
- 销售搜索结果自动限制为本人负责的数据。
- 销售不能通过参数读取、编辑或关联其他销售的记录。
- 创建联系人和跟进时，负责人继承关联客户。
- 所有“删除”操作使用 `{ "archived": true }`。

## MCP 初始化示例

获得 OAuth Token 后：

```bash
curl -i http://localhost:3000/api/mcp \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-06-18",
      "capabilities":{},
      "clientInfo":{"name":"demo","version":"1.0.0"}
    }
  }'
```

保存响应头 `Mcp-Session-Id`，后续调用：

```bash
curl http://localhost:3000/api/mcp \
  -H 'Authorization: Bearer <token>' \
  -H 'Mcp-Session-Id: <session>' \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"crm_summary_get","arguments":{}}}'
```

正常客户端会自动完成这些协议操作，不需要人工拼请求。

## 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 豆包无法访问地址 | 使用了 localhost 或隧道已失效 | 重建隧道并更新 `APP_BASE_URL` |
| `invalid_client` | 旧连接器的回调与新动态注册不一致 | 删除连接器后重新注册 |
| PKCE 校验失败 | 授权码、verifier 或回调地址不匹配 | 重新发起完整授权，不复用旧 code |
| HTTP 401 | Token 缺失、过期或撤销 | 重新授权或刷新 Token |
| Session 404 | 服务重启或 Session 属于其他账号 | 重新执行 MCP initialize |
| 工具返回无权限 | 销售访问了其他负责人的数据 | 切换管理员或使用本人记录 |
