# NEXORA IdP — 设计文档索引

> 本文件是文档入口，不再承载具体实现规范。各主题可以独立推进和评审，修改时应更新对应主题文档及必要的交叉引用。

## 文档分工

| 文档                                   | 负责内容                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| [`architecture.md`](./architecture.md) | 项目定位、范围、模块边界、域名网络、技术栈、仓库结构和实施顺序 |
| [`data-model.md`](./data-model.md)     | 身份与权限模型、业务表、协议库存储和数据库迁移规则             |
| [`api.md`](./api.md)                   | OAuth/OIDC 流程、端点、账户 API、管理 API、令牌和验证要求      |
| [`threat-model.md`](./threat-model.md) | 信任边界、威胁、密码/Web/OAuth 安全控制、审计和安全测试        |
| [`deployment.md`](./deployment.md)     | 环境、Docker、配置秘密、数据库备份恢复、监控、发布和回滚       |

## 推荐阅读顺序

1. [`architecture.md`](./architecture.md)：确认范围和模块边界。
2. [`data-model.md`](./data-model.md)：确认身份、授权和持久化模型。
3. [`api.md`](./api.md)：实现协议与业务接口。
4. [`threat-model.md`](./threat-model.md)：在实现和发布前逐项验证安全控制。
5. [`deployment.md`](./deployment.md)：准备环境、运维和生产发布。

## 维护规则

- 新增内容放入唯一负责该主题的文档，不在本索引重复记录实现细节。
- 跨文档约束使用相对链接引用，避免复制同一段规范。
- 数据库字段和迁移规则只维护在 `data-model.md`。
- 端点、参数和令牌行为只维护在 `api.md`。
- 安全控制和威胁处置只维护在 `threat-model.md`。
- 环境变量、备份、监控、发布和回滚只维护在 `deployment.md`。
- 发生跨主题变更时，同时检查索引和相关文档的交叉引用。
