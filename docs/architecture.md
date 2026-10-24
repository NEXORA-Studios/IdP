# NEXORA IdP — 架构与实施路线

> 文档状态：Draft — 待技术评审  
> 文档版本：1.0.0  
> 编制日期：2026-10-14

本文件定义 NEXORA Identity Platform 的产品边界、系统边界、模块职责和实施顺序。可执行的数据结构见 [`data-model.md`](./data-model.md)，协议与接口见 [`api.md`](./api.md)，安全控制见 [`threat-model.md`](./threat-model.md)，运行环境见 [`deployment.md`](./deployment.md)。

## 1. 项目定位

NEXORA IdP 是独立的 Identity Provider，同时承担 OpenID Connect Provider 的职责，为 NEXORA 产品提供统一账户认证、授权和身份声明。它管理本地账户、密码凭据、会话、客户端、授权同意、Scope、签名密钥和安全审计。

IdP 不替代业务系统的授权。例如，IdP 只确认用户身份；产品是否允许用户进入服务器、加入白名单或使用管理员命令，仍由产品自身决定。

## 2. 范围

首期必须实现：

- 本地注册、邮箱验证、登录、登出、密码重置和会话管理。
- OIDC Discovery、Authorization Code Flow、PKCE、ID Token、Access Token 和 JWKS。
- 内部客户端登记、Redirect URI 管理、用户授权同意和 Scope 管理。
- 令牌与会话撤销、安全审计、自动化测试、Docker 部署、备份和恢复流程。
- Refresh Token 及其轮换、重放检测、过期和撤销链路。

首期不实现动态公开客户端注册、第三方 OAuth/OIDC、Microsoft 登录、Minecraft 身份关联、SAML、SCIM、设备授权、多租户、多区域高可用、风险评分或自研 MFA 平台。

验收至少需要一个真实内部产品接入，并能验证 `(iss, sub)`、拒绝错误回调地址、错误令牌和授权码重放。

## 3. 设计原则

1. 使用 OAuth 2.0、OpenID Connect 和 RFC 9700 等正式规范。
2. 使用稳定、不可变的内部用户 ID；邮箱不是主键。
3. 默认启用 HTTPS、PKCE、严格 Redirect URI 匹配和短期 Access Token。
4. 初期采用模块化单体：一个仓库、一个 PostgreSQL、清晰的模块边界。
5. Identity Core 与协议库、HTTP 框架解耦，协议库只通过 Adapter 接入。
6. IdP 拥有独立数据库、备份、密钥和部署生命周期。
7. 重要认证、授权、管理和安全操作必须可审计。

## 4. 系统架构

```text
Users / Internet
       |
HTTPS Reverse Proxy
       |
+------+----------------+
|                       |
Accounts Portal       OIDC Provider
(Next.js, 含管理后台)  (Fastify)
|                       |
+----------+------------+
           |
      Internal APIs
           |
   PostgreSQL / Email
           |
 Backup / Audit / Key Store
```

管理后台首期并入 Accounts Portal，作为受独立权限校验保护的 `/admin` 路由区，不单独部署；不建独立的 `apps/admin` 应用。

### 4.1 模块职责

- **Accounts Web Portal**：注册、登录、登出、邮箱验证、密码重置、账户设置、授权同意和错误交互；包含受独立权限校验保护的管理路由区（客户端登记、用户状态、审计查询）；不直接访问数据库或持有签名私钥。
- **OIDC Provider**：协议端点、授权码、PKCE、Token、Discovery、JWKS、客户端验证和协议状态。
- **Identity Core**：用户、凭据、邮箱验证、状态、会话、恢复和账户禁用；不依赖具体 HTTP 框架。
- **Authorization Core**：客户端策略、Scope、用户同意、撤销和资源访问规则。
- **Administration**：内部客户端登记、Redirect URI、Scope 白名单、管理员权限和审计查询；管理员权限独立于普通用户登录。

### 4.2 域名和网络边界

正式 Issuer 为 `https://id.nexora-studios.tech`，账户门户为 `https://accounts.nexora-studios.tech`，管理功能位于门户的 `/admin` 路由区，不使用独立域名。公网只开放 HTTPS，PostgreSQL 和内部端口不得暴露；只信任已配置反向代理的转发头。

Cookie 默认使用 Host-only、`Secure`、`HttpOnly` 和合适的 `SameSite`，登录成功后轮换 Session ID，状态变更请求启用 CSRF 防护，避免跨子域共享 Cookie。

### 4.3 技术栈

Node.js 24 LTS、TypeScript（strict）、pnpm workspace + turborepo、Fastify、`oidc-provider`、Next.js、PostgreSQL、Drizzle ORM、Zod、Argon2id、Pino（`packages/logging` 封装脱敏规则）、Vitest、Playwright、Docker、Docker Compose。协议核心不得自行实现。

邮件发送不绑定具体服务商：`packages/emails` 定义 Sender 接口，本地/CI 用 Mailpit（SMTP），生产接入方式待选型后注入。

签名密钥与运行时秘密使用 HashiCorp Vault，以单实例容器跑在同一主机的 Compose 内（文件存储后端，自动 unseal 脚本），`SIGNING_KEY_REFERENCE` 指向 Vault 路径；备份、unseal 凭据和访问策略见 [`deployment.md`](./deployment.md)。

依赖版本需锁定，提交 `pnpm-lock.yaml`，协议库升级前执行完整 OIDC 回归测试。

## 5. 仓库边界

```text
apps/{idp,accounts}/
packages/{db,identity,authorization,oidc,emails,crypto,config,logging,test-utils}/
infra/{docker,migrations,deploy}/
docs/{architecture,data-model,api,threat-model,deployment}.md
```

`identity` 不依赖 HTTP 框架，`authorization` 不依赖前端，`oidc` 封装 `oidc-provider` 实例及其 Adapter（Adapter 通过 `db` 包访问协议存储，`oidc` 依赖 `db`，`db` 不知道 `oidc` 的存在），`db` 负责数据访问和迁移，`crypto` 封装密码与密钥工具，`logging` 负责结构化日志和脱敏，`test-utils` 提供测试夹具与内存 Adapter。`emails` 集中维护邮件模板、验证/重置链接格式和有效期展示文案，通过依赖注入接收邮件发送器；`identity` 只调用 `emails`，不自行拼接邮件内容。


## 6. 实施顺序

1. 初始化 Workspace、TypeScript、测试、PostgreSQL 和迁移。
2. 实现用户、凭据、邮箱、注册、验证、登录、Session 和账户恢复。
3. 集成 OIDC Provider、固定 Issuer、登录交互、同意页面、PKCE、Discovery、JWKS 和 Adapter。
4. 登记第一个内部客户端，完成端到端令牌验证和撤销测试。
5. 完成安全测试、密钥轮换、监控、备份恢复、HTTPS、Staging 和事件响应手册。
6. 小范围生产发布并接入一到两个内部产品。

后续外部身份联合、Minecraft 关联、第三方应用、MFA 和分布式扩展必须在基础链路稳定后单独评审。

## 7. 参考规范

OAuth 2.0 RFC 6749、OAuth 2.0 Security BCP RFC 9700、RFC 8414、RFC 7636、RFC 7517、RFC 7519、OpenID Connect Core 1.0、OpenID Connect Discovery 1.0、`oidc-provider` 和 OWASP Password Storage Cheat Sheet。
