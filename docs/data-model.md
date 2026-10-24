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
user_id UUID PRIMARY KEY REFERENCES users(id)
password_hash TEXT NOT NULL
password_changed_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

只保存 Argon2id 哈希和算法参数，不保存明文密码，也不以可逆加密替代密码哈希。

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

按明确规则规范化并建立唯一索引。邮箱变更必须重新验证，未验证邮箱不能用于密码恢复，主要邮箱变更须审计。

### `sessions`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ NULL
expires_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ NULL
auth_time TIMESTAMPTZ NULL
```

Session ID 必须不可预测，过期或撤销后不可用，支持单会话和全账号撤销；Session ID 不能使用用户 ID。

### OAuth 客户端

```text
oauth_clients(
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
)
oauth_redirect_uris(
  id UUID PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
)
oauth_client_secrets(
  id UUID PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
)
```

同一客户端的 Redirect URI 去重，授权请求必须严格匹配登记值。Client Secret 仅适用于机密客户端，创建或轮换时只展示一次；存储方式必须符合实际客户端认证方案。

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

根据所选 Adapter 保存 Authorization Code、Access Token 状态、Refresh Token、Grant、Interaction 及其他协议对象。短期对象必须有过期和清理机制；其内部模型不应泄露到 Identity Core。

## 4. 迁移规则

所有 Schema 变更必须有迁移脚本，生产环境禁止手工改 Schema。破坏性迁移需单独评审，优先使用兼容新旧应用的扩展、回填、切换、清理流程。生产迁移前确认备份有效，定期清理过期协议数据。
