# NEXORA IdP — API 与协议

本文件定义 OIDC 行为、业务 API、验证规则和端到端流程。实际协议端点以 Discovery 元数据为准，示例路径须与 `oidc-provider` 配置保持一致。

## 1. 固定 Issuer 与流程

Issuer 固定为 `https://id.nexora-studios.tech`，Discovery 的 `issuer`、ID Token 的 `iss` 和客户端配置必须完全一致，不能由请求头动态构造。

首期支持：

- OpenID Connect Authorization Code Flow。
- PKCE `S256`。
- ID Token、Access Token、Discovery、JWKS、UserInfo。
- Token Revocation、登录会话和用户授权同意。

首期不支持 Implicit、Resource Owner Password Credentials、公开动态客户端注册或未经安全评审的 Token Exchange。Refresh Token 仅在确有长期授权需求时启用。

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

Access Token 初始有效期建议 5–10 分钟，受众必须匹配目标资源服务器。资源服务器必须验证签名、Issuer、Audience、Expiration、权限和令牌上下文，不能只验证 JWT 签名。

若启用 Refresh Token，必须绑定用户、客户端和授权关系，实施轮换、重放检测、过期和撤销。公开客户端不能依赖静态 Client Secret。

第一版允许的 OIDC 声明包括 `sub`、`iss`、`aud`、`exp`、`iat`、适用时的 `auth_time`/`nonce`，以及获准的 `name`、`email`、`email_verified`。不得把内部字段全部暴露。

## 3. 内部账户 API

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

## 4. 管理 API

内部管理接口提供客户端创建与查询、Redirect URI 管理、启停客户端、凭据轮换、Scope 策略、用户状态管理、授权撤销和审计查询。管理员操作必须记录主体、目标、结果和时间；管理接口应使用最小权限、额外 MFA 或网络访问控制。

## 5. 授权流程

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

## 6. 登出与撤销

登出结束 IdP 会话、按策略撤销服务端 Session、清除 Cookie，并明确说明不一定结束业务产品自己的本地会话。账户禁用、密码变更和授权撤销不能只依赖浏览器登出；应结合短期 Access Token、Session 撤销、Refresh Token 撤销和高风险资源的状态检查。

## 7. 客户端验收用例

必须覆盖 Discovery/Issuer/JWKS、成功授权码流程、PKCE、错误回调地址、错误 Audience、过期令牌、错误签名、授权码重放、无效 Client ID、无效 Scope 和未经授权声明不返回。完整安全场景见 [`threat-model.md`](./threat-model.md)。
