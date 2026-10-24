# NEXORA IdP — 部署与运维

本文件定义环境、基础设施、配置、备份、监控、发布和回滚要求。架构边界见 [`architecture.md`](./architecture.md)，数据迁移见 [`data-model.md`](./data-model.md)。

## 1. 环境隔离

| 环境       | 用途                 |
| ---------- | -------------------- |
| Local      | 本地开发             |
| Staging    | 发布前集成和安全测试 |
| Production | 正式服务             |

每个环境必须使用独立数据库、客户端凭据、签名密钥、邮件凭据、应用配置、日志和监控。正式 Issuer 为 `https://id.nexora-studios.tech`。

## 2. 运行组件

本地 Docker Compose 至少运行 IdP、Accounts、PostgreSQL，必要时加入邮件测试服务。生产入口通过 Caddy 或托管负载均衡器提供 TLS；应用内部端口和 PostgreSQL 不直接暴露公网，不能照搬开发环境默认端口和凭据。

建议部署结构：

```text
HTTPS Load Balancer / Reverse Proxy
       |                    |
  IdP process         Accounts process
       |                    |
       +------ PostgreSQL
       +------ Email Provider
       +------ Secret Manager
```

## 3. 配置与秘密

```dotenv
NODE_ENV=production
PUBLIC_ISSUER=https://id.nexora-studios.tech
ACCOUNTS_BASE_URL=https://accounts.nexora-studios.tech
DATABASE_URL=
SESSION_SECRET=
SIGNING_KEY_REFERENCE=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
```

示例只表示配置类别。真实密码、生产密钥和令牌不得写入仓库、示例文件或构建日志。`SESSION_SECRET` 使用密码学安全随机值；`SIGNING_KEY_REFERENCE` 指向受控密钥存储，而不是任意文件路径。签名私钥不提交 Git、不打包进前端或桌面客户端。

## 4. 数据库与恢复

数据库使用独立用户和最小权限，限制网络访问，监控连接数和存储空间。所有变更通过迁移脚本；生产迁移前确认备份。

至少提供定期自动备份、保留期限、加密备份、恢复演练、数据库损坏处理、密钥备份/恢复和恢复后的一致性测试。恢复演练必须验证用户登录、令牌签发、JWKS 验证、会话和令牌状态，而不只是数据库能启动。

## 5. 日志、指标与告警

记录登录成功/失败、授权码兑换、密码和授权操作、客户端变更、密钥轮换及异常请求，但按 [`threat-model.md`](./threat-model.md) 脱敏。监控登录成功率/失败率、Token Endpoint 错误率、邮件成功率、连接池、延迟、可用性、限流、异常客户端请求、密钥轮换和存储。

至少对大量登录失败、密码重置洪峰、授权码兑换异常、数据库连接故障、邮件中断、签名密钥异常、生产配置缺失、备份失败以及日志/审计系统失效告警。

## 6. 发布流程

发布前检查版本和迁移状态、备份、密钥、Discovery、JWKS、TLS、邮件、告警和回滚版本。数据库优先采用兼容新旧应用的扩展、部署、回填、切换、清理流程；应用回滚不等同于 Schema 回滚。

### 6.1 密钥轮换

发布新签名密钥并更新 JWKS，使用新密钥签发，保留旧公钥直到旧令牌过期且满足安全策略，再退役旧密钥。发现私钥泄露时立即执行紧急处置和轮换，不为兼容性继续信任泄露密钥。

### 6.2 回滚条件

核心登录不可用、Token Endpoint 大量失败、Discovery/JWKS 错误、迁移导致关键数据不可用、严重安全漏洞或无法验证已有令牌时，应停止发布并回滚应用。回滚后再次验证 Discovery、JWKS、登录、令牌和数据库兼容性。

## 7. 生产门槛

- [ ] Local、Staging、Production 已隔离。
- [ ] TLS、固定 Issuer、Discovery 和 JWKS 正确。
- [ ] 生产签名密钥和开发密钥分离。
- [ ] 备份、恢复演练和密钥恢复通过。
- [ ] 迁移、发布和回滚流程已验证。
- [ ] 日志、监控、告警和审计可用。
- [ ] 至少一个内部产品完成端到端集成。
