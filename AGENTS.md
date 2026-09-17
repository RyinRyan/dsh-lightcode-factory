# LightCode Factory Agent 开发规范

本文件适用于整个仓库。所有 Agent 在修改代码前必须先读本文件、根 `README.md` 和 `docs/architecture.md`；进入具体包后，再读对应源码、测试及 `.claude/skills/lightcode-factory-workflow-develop/` 中的开发规范。当前 checkout 的公开类型、运行时 schema 和测试是事实来源，文档与其冲突时应在同一变更中修正文档。

## 1. 先选择正确的组件

仓库有三个可开发组件，以及一个只负责装配的 Bundle：

| 组件 | 选择条件 | 主要目录 | 不应承载 |
| --- | --- | --- | --- |
| Workflow | 需求只属于一个业务流程，可由现有参数、顺序节点、输出、观测、取消和评审表达 | `packages/<workflow>/` | run 状态机、持久化、共享页面特例 |
| Backend | 多个 Workflow 都需要的新运行语义，或涉及状态、调度、持久化、Remote/Schema、限制与生命周期 | `packages/backend/` | 业务流程特有逻辑、页面布局 |
| Platform | 多个 Workflow 共用的 Browser 交互、看板、详情、轨迹、通用 renderer 或响应式行为 | `packages/platform/` | 业务执行、状态写入、直接存储访问 |
| Factory Bundle | 仅安装清单、成员依赖、Bundle patch 与发布装配 | `packages/factory/` | 业务逻辑、状态逻辑、UI 逻辑 |

需求跨组件时，先修改最底层公开契约，再向上适配。不得为了少改一个包，把 Backend 能力伪造在 Workflow 中，或按 `workflowId` 在 Platform 中增加业务分支。

## 2. 架构不变量

- Backend 是 run、node 状态、生命周期事件和持久化的唯一写入者。
- Workflow 是进程内可信 Host 插件，只声明元数据并顺序执行 `run.node(...)`；节点必须逐个 `await`，错误通过抛出表达，取消使用 Backend 提供的 `AbortSignal`。
- Platform 通过 Backend Browser Client 获取快照并发送命令；不得访问 Backend 私有字段、存储或 DSH 深层实现。
- `node.output` 是用户最终结果，显示在运行详情；observation 是执行过程，显示在轨迹。两者不得混用。
- 参数、输出、观测和事件都可能持久化并发送给 Browser。不得把密码、Token、私钥或完整私有 prompt 写入其中。
- 公共 wire schema、持久化 schema 和 TypeScript 类型必须一起演进；兼容已有持久化数据，或提供明确迁移方案。
- 共享 UI 只按公开数据语义渲染，禁止按 Workflow id、包名、节点 id 或中文名称写特例。
- 当前实现只支持进程内可信插件、文本参数、顺序节点、轮询快照和重启时将 queued/running 标记失败。不要把 DAG、断点续跑、自动重试或远程多租户调度描述成已有能力。

## 3. 开发流程

1. 保护用户已有修改，使用 `git status --short`、`rg --files` 和源码测试确认当前事实。
2. 使用 `.claude/skills/lightcode-factory-workflow-develop/references/component-selection.md` 确定组件边界。
3. Workflow 变更维护 `.design/workflows/<workflow-id>.md`；Backend、Platform 或跨组件变更维护 `.design/changes/<change-id>.md`。没有设计与影响分析，不开始实现。
4. 先改稳定契约和 schema，再改实现、调用方与 UI；保持单一状态所有者。
5. 为行为补测试。修复 Browser 行为时使用用户可观察断言，不以快照或 CSS 数值替代交互测试。
6. 同步相关文档，运行文档审计，然后执行类型检查、测试、构建；涉及装配或发布时还必须打包并检查 tarball。

## 4. 文档完成门禁

每次代码变更必须在同一变更中刷新相关文档：

- Workflow：对应 `.design/workflows/` 设计；公开参数、节点、输出、限制或接线变化时同步 `README.md` 和 `docs/architecture.md` 的相关部分。
- Backend：同步 `docs/architecture.md` 的契约、状态、数据流或限制；同时更新 skill 的 Backend/核心契约说明。
- Platform：同步 `docs/architecture.md` 的 Browser 数据流/页面语义；同时更新 skill 的 Platform/展示契约说明。
- Bundle、安装、版本或命令：同步 `README.md`。
- 若判断无需修改某份文档，必须在设计文档“文档同步”章节写明理由，不能默默跳过。

完成前运行：

```powershell
npm.cmd run audit:ai
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

新增或修改 Workflow 时，把设计文件传给审计脚本；涉及发布装配时再运行 `npm.cmd run pack` 并检查最终 tarball。只有验证结果和未验证项都可追溯时才能声明完成。

## 5. 代码与测试约定

- TypeScript 使用严格类型与公开 package exports；禁止导入其他包的 `src/*` 私有路径。
- 保持 Host 与 Browser 入口分离。Browser 代码不得引入 Node-only 模块，Host 代码不得依赖 React UI。
- 所有 Cordis 注册、定时器和资源都由 `ctx.effect` 或公开 disposer 管理。
- 持久化 mutation 必须串行化；取消、卸载、停止和晚到结果需要覆盖竞态测试。
- JSON 输出必须有界且可序列化；大内容返回 artifact 引用，不返回本机绝对路径。
- 测试分层：纯逻辑/组件行为、真实 Backend+Storage+Loader 组合、公开 disposer、构建与 Bundle、隔离 DSH 安装及完整浏览器验收。
- 不修改相邻 `dsh` 源码来让本仓通过；本项目必须只依赖 manifest 中声明的宿主 API。

