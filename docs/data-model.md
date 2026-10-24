# NEXORA IdP — 数据模型

本文件定义业务身份模型、授权关系和数据库约束。协议库内部对象由 Adapter 管理，不能直接当作业务模型。系统使用 PostgreSQL，业务表由 Drizzle ORM 和迁移脚本管理。

## 1. 身份模型

每个用户拥有不可变的 UUID（推荐 UUIDv7）。用户状态为 `pending_verification`、`active`、`suspended`、`disabled` 或 `deleted`，所有状态转换都必须经过业务服务并产生审计记录。

OIDC 客户端通过 `(iss, sub)` 识别用户，不能只依赖邮箱。第一方客户端可使用稳定 Subject；未来若启用 Pairwise Subject，需单独评估跨客户端身份隔离。

客户端分为：

- **Public**：SPA、Tauri、原生应用，必须使用 Authorization Code + PKCE，不能内置 Client Secret。
- **Confidential**：服务端应用，使用受支持的客户端认证，凭据可轮换和撤销。

首期 Scope 为 `openid`、`profile`、`email` 和按策略授予的 `offline_access`。业务 Scope（如 `nexora:profile:read`）由对应资源服务器执行对象级权限检查。

## 2. 核心表

### `users`

```text
id UUID PRIMARY KEY
status TEXT NOT NULL
display_name TEXT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

`id` 创建后不可变，`status` 限制为合法枚举，删除必须是有审计的业务流程。

### `user_credentials`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
credential_type TEXT NOT NULL
secret_hash TEXT NOT NULL
params JSONB NOT NULL DEFAULT '{}'
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
changed_at TIMESTAMPTZ NULL
UNIQUE (user_id, credential_type)
```

首期 `credential_type` 仅有 `password`，`secret_hash` 保存 Argon2id 哈希与算法参数（写入 `params`），`changed_at` 即密码变更时间；不保存明文密码，也不以可逆加密替代密码哈希。表结构必须可容纳未来的 TOTP、Passkey 等凭据类型，不允许为新增凭据类型修改主键或重建表。

### `user_emails`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
email TEXT NOT NULL
email_normalized TEXT NOT NULL
verified_at TIMESTAMPTZ NULL
is_primary BOOLEAN NOT NULL DEFAULT FALSE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

对 `email_normalized` 建立全局唯一索引（部分唯一索引：仅约束 `verified_at IS NOT NULL` 的记录），并对 `user_id` 建立普通索引。邮箱变更必须重新验证，未验证邮箱不能用于密码恢复，主要邮箱变更须审计。账户软删除或删除流程必须释放其已验证邮箱（移除或标记对应 `user_emails` 记录），否则该邮箱无法重新注册。

### `sessions`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ NULL
expires_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ NULL
auth_time TIMESTAMPTZ NULL
user_agent TEXT NULL
ip TEXT NULL
```

Session ID 必须不可预测，过期或撤销后不可用，支持单会话和全账号撤销；Session ID 不能使用用户 ID。`user_agent` 和 `ip` 用于“查询会话”功能展示和异常登录排查，属于个人信息，展示时脱敏；过期会话定期清理（见 §3.1）。

### 一次性令牌

邮箱验证令牌和密码重置令牌是核心业务对象，必须持久化并支持审计、撤销和清理：

```text
one_time_tokens(
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL
)
```

只保存令牌哈希；令牌单次使用、有时效，按用途（`email_verification`、`password_reset` 等）区分；签发同用途新令牌必须使同用户的旧令牌失效。

### OAuth 客户端

```text
oauth_clients(
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL,
  secret_hash TEXT NULL,
  secret_created_at TIMESTAMPTZ NULL,
  secret_rotated_at TIMESTAMPTZ NULL,
  allowed_scopes TEXT NOT NULL,
  post_logout_redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)
oauth_redirect_uris(
  id UUID PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (client_id, uri)
)
```

`token_endpoint_auth_method` 取值遵循 OAuth 2.0 客户端认证规范（如 `client_secret_basic`、`client_secret_post`、`none`）；`allowed_scopes` 是该客户端可请求的 Scope 白名单，授权请求的 Scope 必须是其子集。授权请求必须严格匹配登记的 Redirect URI。Client Secret 仅适用于机密客户端，仅存哈希（与密码同等强度存储），创建或轮换时只展示一次；轮换支持新旧 Secret 短暂并行验证，旧 Secret 在过渡期后失效。`post_logout_redirect_uris` 为 RP-Initiated Logout 回调白名单（见 [`api.md`](./api.md) §7）。

### 授权关系

```text
authorizations(
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  granted_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
)
authorization_scopes(
  authorization_id UUID NOT NULL REFERENCES authorizations(id),
  scope TEXT NOT NULL,
  PRIMARY KEY (authorization_id, scope)
)
```

授权撤销必须能影响后续授权决策和 Refresh Token 策略。

### `oidc_identities`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
issuer TEXT NOT NULL
subject TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

对 `(issuer, subject)` 建立唯一约束。外部身份绑定应与本地账户模型分离，不能仅凭相同邮箱自动合并。

### 管理员授权

管理员权限独立于普通用户会话，必须显式授予、可撤销、可审计：

```text
admin_grants(
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, role)
)
```

管理 API 在每次请求时校验有效（未过期、未撤销）的授权，并要求再次认证或 MFA；授权与撤销操作必须写入审计。

### `audit_events`

```text
id UUID PRIMARY KEY
actor_user_id UUID NULL
client_id TEXT NULL
event_type TEXT NOT NULL
result TEXT NOT NULL
request_id TEXT NULL
created_at TIMESTAMPTZ NOT NULL
metadata JSONB NULL
```

采用追加式写入。`metadata` 不得包含密码、完整令牌、授权码、Cookie、Client Secret、私钥或其他认证秘密。

## 3. 协议库存储

协议库 Adapter 位于 `packages/oidc`（见 [`architecture.md`](./architecture.md) §5），通过 `db` 包访问协议存储表。根据所选 Adapter 保存 Authorization Code、Access Token 状态、Refresh Token、Grant、Interaction 及其他协议对象。短期对象必须有过期和清理机制；其内部模型不应泄露到 Identity Core。

### 3.1 定期清理任务

过期数据的清理由应用内定时任务执行（单机部署，IdP 进程内简单间隔任务即可，不引入独立调度基础设施）：

- 过期/撤销 Session、一次性令牌：每日清理。
- 协议库短期对象（授权码、Interaction、过期 Grant/Token 记录）：利用 `oidc-provider` Adapter 的 TTL 支持批量清理，每日执行。
- 审计事件不自动清理，按保留策略归档。

清理任务执行结果写入日志，失败时告警（见 [`deployment.md`](./deployment.md) §5）。

Access Token 采用自包含 JWT（资源服务器离线验证签名）。因此撤销语义为：JWT 在有效期内不可服务端即时作废（`/introspect` 仅用于需要更强即时性的内部高价值资源，按需启用）；账户禁用、密码变更和授权撤销的即时生效依靠 Refresh Token 撤销、Session 撤销和高风险资源在线状态检查，而不是 Access Token 撤销。协议库中的 Access Token 状态记录仅用于刷新与撤销联动，不作为资源服务器的验证依据。

## 4. 迁移规则

所有 Schema 变更必须有迁移脚本，生产环境禁止手工改 Schema。破坏性迁移需单独评审，优先使用兼容新旧应用的扩展、回填、切换、清理流程。生产迁移前确认备份有效，定期清理过期协议数据。
