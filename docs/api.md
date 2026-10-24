# NEXORA IdP — API 与协议

本文件定义 OIDC 行为、业务 API、验证规则和端到端流程。实际协议端点以 Discovery 元数据为准，示例路径须与 `oidc-provider` 配置保持一致。

## 1. 固定 Issuer 与流程

Issuer 固定为 `https://id.nexora-studios.tech`，Discovery 的 `issuer`、ID Token 的 `iss` 和客户端配置必须完全一致，不能由请求头动态构造。

首期支持：

- OpenID Connect Authorization Code Flow。
- PKCE `S256`。
- ID Token、Access Token、Discovery、JWKS、UserInfo。
- Token Revocation、登录会话和用户授权同意。
- Refresh Token：启用并实现轮换、重放检测、过期和撤销，绑定用户、客户端和授权关系。

首期不支持 Implicit、Resource Owner Password Credentials、公开动态客户端注册或未经安全评审的 Token Exchange。

## 2. OIDC 端点

| 端点                                | 方法     | 用途                 |
| ----------------------------------- | -------- | -------------------- |
| `/.well-known/openid-configuration` | GET      | Discovery            |
| `/jwks`                             | GET      | 发布公开签名密钥     |
| `/authorize`                        | GET      | 发起授权             |
| `/token`                            | POST     | 兑换授权码或刷新令牌 |
| `/userinfo`                         | GET/POST | 获取获准声明         |
| `/revoke`                           | POST     | 撤销令牌             |
| `/introspect`                       | POST     | 按需查询令牌状态     |
| `/logout`                           | GET/POST | 登出交互             |
| `/register`                         | 不公开   | 首期不开放动态注册   |

优先评估 RS256 或 ES256。算法必须有白名单；私钥由受控密钥存储保护；密钥轮换时保留旧公钥直到旧令牌验证窗口结束。

Access Token 采用自包含 JWT，初始有效期建议 5–10 分钟，受众必须匹配目标资源服务器。由于 JWT 在有效期内不可服务端即时作废，账户禁用和撤销的即时生效依靠 Refresh Token 撤销、Session 撤销和高风险资源在线状态检查（见 [`data-model.md`](./data-model.md) 第 3 节）。资源服务器必须验证签名、Issuer、Audience、Expiration、权限和令牌上下文，不能只验证 JWT 签名。

若启用 Refresh Token，必须绑定用户、客户端和授权关系，实施轮换、重放检测、过期和撤销。公开客户端不能依赖静态 Client Secret。同一授权关系上的刷新请求串行化（按 authorization 咨询锁或单飞队列）：并发或极近连续的两个携带同一 Refresh Token 的请求，第一个完成轮换，第二个获得与第一个相同的轮换结果（新令牌），不做重放处置；轮换完成后再次使用旧令牌仍判定为重放，撤销整条授权链。

第一版允许的 OIDC 声明包括 `sub`、`iss`、`aud`、`exp`、`iat`、适用时的 `auth_time`/`nonce`，以及获准的 `name`、`email`、`email_verified`。不得把内部字段全部暴露。

## 3. 响应与错误格式

OIDC/OAuth 端点错误遵循 RFC 6749 / OIDC Core：返回 `error`、`error_description`（可选）、`state`（授权请求时），使用规范定义的错误码（`invalid_request`、`invalid_client`、`invalid_grant`、`unauthorized_client`、`unsupported_grant_type`、`invalid_scope` 等）。授权端点错误通过重定向回 `redirect_uri` 返回（`error=access_denied` 等），`redirect_uri` 非法时不得重定向，直接展示错误页。

内部 API（账户 API、管理 API）使用统一 JSON 错误体：

```json
{ "error": { "code": "validation_failed", "message": "请求参数不合法", "request_id": "..." } }
```

- 状态码约定：400 校验失败、401 未认证、403 已认证但无权限、404 资源不存在、409 状态冲突、429 限流。
- 错误响应不能泄露账户或客户端是否存在（统一用 400/401 + 模糊文案）。
- 每个响应携带 `request_id`，与日志和审计记录关联。

限流要求：注册、登录、密码重置发起/提交、邮箱验证等端点必须限流，按 IP 与账户标识双重维度；载体为反向代理或应用内计数器，首期使用 PostgreSQL 计数表即可。初始默认阈值如下，部署配置可覆盖（调整后需重新评审告警基线）：

| 端点               | 维度        | 初始阈值       |
| ------------------ | ----------- | -------------- |
| 登录               | 账户+IP     | 5 次 / 15 分钟 |
| 密码重置发起/提交  | 账户+IP     | 5 次 / 15 分钟 |
| 注册               | IP          | 3 次 / 小时    |
| 邮箱验证提交       | IP          | 10 次 / 小时   |

计数采用滑动窗口，**更新与判定必须原子**：使用单条原子 SQL（如 `INSERT ... ON CONFLICT DO UPDATE SET count = window.count + 1 ... RETURNING count`）或 PostgreSQL 原子操作完成递增+阈值判定，禁止先读后写的检查模式；超窗重置。触发限流返回 429；同一来源持续超阈值产生告警（见 [`deployment.md`](./deployment.md) §5）。阈值上线后结合 Staging 压测与真实误报情况修订。

## 4. 内部账户 API

| 方法   | 路径                                   | 用途               |
| ------ | -------------------------------------- | ------------------ |
| POST   | `/api/v1/accounts/register`            | 创建账户           |
| POST   | `/api/v1/accounts/verify-email`        | 验证邮箱           |
| POST   | `/api/v1/accounts/password/forgot`     | 发起重置           |
| POST   | `/api/v1/accounts/password/reset`      | 提交重置           |
| POST   | `/api/v1/accounts/password/change`     | 修改密码           |
| GET    | `/api/v1/accounts/me`                  | 当前用户资料       |
| PATCH  | `/api/v1/accounts/me`                  | 更新允许修改的资料 |
| GET    | `/api/v1/accounts/sessions`            | 查询会话           |
| DELETE | `/api/v1/accounts/sessions/:id`        | 撤销指定会话       |
| POST   | `/api/v1/accounts/sessions/revoke-all` | 撤销全部会话       |

所有账户 API 必须执行认证、输入校验、速率限制、CSRF（适用时）和对象级权限检查。错误响应不能泄露账户是否存在。

## 5. 管理 API

管理功能首期并入 Accounts Portal 的 `/admin` 路由区，API 路径前缀 `/api/v1/admin`。每次请求校验有效（未过期、未撤销）的 `admin_grants` 授权，要求再次认证或 MFA，并写入审计。

| 方法   | 路径                                        | 用途                     |
| ------ | ------------------------------------------- | ------------------------ |
| POST   | `/api/v1/admin/clients`                     | 创建客户端               |
| GET    | `/api/v1/admin/clients`                     | 客户端列表               |
| GET    | `/api/v1/admin/clients/:client_id`          | 客户端详情               |
| PATCH  | `/api/v1/admin/clients/:client_id`          | 更新名称/状态/Scope 白名单 |
| POST   | `/api/v1/admin/clients/:client_id/redirect-uris`    | 新增 Redirect URI |
| DELETE | `/api/v1/admin/clients/:client_id/redirect-uris/:uri_id` | 删除 Redirect URI |
| POST   | `/api/v1/admin/clients/:client_id/secret-rotation`  | 轮换机密客户端凭据（仅展示一次） |
| GET    | `/api/v1/admin/users`                       | 用户查询                 |
| PATCH  | `/api/v1/admin/users/:id/status`            | 用户状态变更（禁用/恢复） |
| GET    | `/api/v1/admin/users/:id/authorizations`    | 用户授权关系查询         |
| DELETE | `/api/v1/admin/users/:id/authorizations/:client_id` | 撤销用户对指定客户端的授权 |
| GET    | `/api/v1/admin/audit-events`                | 审计查询分页、按主体/类型/时间过滤   |
| POST   | `/api/v1/admin/grants`                      | 授予管理员角色（写入审计）           |
| DELETE | `/api/v1/admin/grants/:grant_id`            | 撤销管理员授权（写入审计）           |
| GET    | `/api/v1/admin/grants`                      | 管理员授权列表（含历史）             |

授权与撤销 API 仅限已持有相应管理角色且通过再次认证/MFA 的调用方；所有管理员授权变更（含首次引导）写入审计。

**首个管理员引导：**不存在任何有效 `admin_grants` 行时，通过一次性引导令牌创建首管：在部署主机上以运维命令（如 `pnpm --filter @nexora/idp admin:bootstrap --user <uuid>`）直接写入首条 `admin_grants`，命令本身要求主机级访问（操作者已越过应用边界），令牌仅存在于该主机会话，不经过 HTTP API；引导成功写审计事件（`actor_user_id` 为空、`metadata.bootstrap = true`）。此后一切变更走 API。

管理员操作必须记录主体、目标、结果和时间；管理接口应使用最小权限、额外 MFA 或网络访问控制。

## 6. 授权流程

```text
Client -> /authorize (client_id, redirect_uri, state, nonce, PKCE)
       -> Accounts Portal login/session check
       -> consent and policy decision
       -> registered redirect_uri + one-time code
Client -> /token (code + code_verifier)
       -> ID Token + Access Token
Client -> validate token and identify (iss, sub)
```

授权请求按适用规范校验 `client_id`、`redirect_uri`、`response_type`、`scope`、`state`、OIDC 请求中的 `nonce`、`code_challenge` 和 `code_challenge_method`。所有第一方客户端使用 PKCE。

授权码必须短时有效、一次性使用，并绑定客户端、Redirect URI 和 PKCE challenge；兑换成功后立即失效，重放必须失败。

客户端通过 Discovery/JWKS 验证 ID Token 的算法、签名、`iss`、`aud`、`exp`、`iat`、合理时钟窗口和请求中的 `nonce`。

## 7. 登出与撤销

`/logout` 契约：

1. 结束 IdP 登录会话：撤销服务端 Session 记录（设 `revoked_at`），清除会话 Cookie（Host-only、`Secure`、`HttpOnly`、过期时间置过去）。
2. 撤销该会话关联的协议状态（oidc-provider interaction/grant 绑定）。
3. RP-Initiated Logout：接受 `id_token_hint` 与 `post_logout_redirect_uri`，后者必须在客户端登记的登出回调白名单内且校验通过后才跳转；未提供 `id_token_hint` 时需用户确认。
4. 边界声明：登出仅结束 IdP 侧会话，不自动结束业务产品自己的本地会话，也不一定撤销其 Access Token；产品应自行处理本地登出。

账户禁用、密码变更和授权撤销不能只依赖浏览器登出；应结合短期 Access Token、Session 撤销、Refresh Token 撤销和高风险资源的状态检查。首期不实现 Front/Back-Channel Logout，后续需要时单独评审。

## 8. 客户端验收用例

必须覆盖 Discovery/Issuer/JWKS、成功授权码流程、PKCE、错误回调地址、错误 Audience、过期令牌、错误签名、授权码重放、无效 Client ID、无效 Scope、未经授权声明不返回，以及 Refresh Token 轮换与重放检测（重用已轮换的 Refresh Token 必须失败并撤销对应授权链）。完整安全场景见 [`threat-model.md`](./threat-model.md)。
