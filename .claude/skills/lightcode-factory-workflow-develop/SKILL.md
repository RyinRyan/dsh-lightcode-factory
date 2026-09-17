---
name: lightcode-factory-workflow-develop
description: 在 lightcode-factory 中设计、实现、测试并交付 Workflow、Backend 或 Platform 变更。用于判断应修改哪个组件，开发业务 Workflow，演进调度/状态/持久化/Remote 契约，开发统一看板/运行详情/轨迹，以及同步架构和使用文档；仅做仓库外的普通 DSH 插件时不要使用。
---

# LightCode Factory 三组件开发

本 Skill 的目录名为兼容旧入口保留，但适用范围覆盖 Factory 的三个可开发组件：Workflow、Backend、Platform。目标是让 Agent 先选对层、再按公开契约实现，并在交付前刷新文档和验证证据。

```text
Workflow（业务参数、节点、执行、输出、观测）
      ↓ 公开注册/节点契约
Backend（调度、状态、持久化、取消、评审、Remote）
      ↓ snapshot + command facade
Platform（统一看板、运行详情、轨迹与交互）

Factory Bundle：只负责安装装配，不承载上述逻辑
```

## 必须执行的七个 Gate

### Gate 1：读取当前事实

1. 完整读取仓库根 `AGENTS.md`、`docs/architecture.md` 和 [仓库探索](references/repository-discovery.md)。
2. 检查工作区状态，保护用户已有修改。
3. 从当前源码、测试、manifest、lockfile 和脚本确认版本、接口、限制与接线；不得把 Skill 中的旧快照当事实。

### Gate 2：选择组件

完整读取 [组件选择](references/component-selection.md)，把需求分类为：

- Workflow：只属于一个业务流程，现有底座契约足够；
- Backend：新增或改变共享执行、状态、调度、持久化、schema、Remote 或生命周期语义；
- Platform：新增或改变共享 Browser 展示、交互、renderer、轨迹或响应式行为；
- 跨组件：先改最底层公开契约，再逐层适配；
- Bundle：只在成员、安装或发布装配变化时接线。

若普通 Workflow 无法表达需求，不得在业务包中私建状态机或页面特例；应改判为 Backend/Platform 扩展。

### Gate 3：设计先行

Workflow 完整读取 [设计门禁](references/design-template.md)，维护 `.design/workflows/<workflow-id>.md`：

```powershell
node .claude/skills/lightcode-factory-workflow-develop/scripts/init-workflow-design.mjs <workflow-id> "<工作流名称>" .
```

Backend、Platform 或跨组件变更完整读取 [底座变更设计](references/change-design.md)，维护 `.design/changes/<change-id>.md`：

```powershell
node .claude/skills/lightcode-factory-workflow-develop/scripts/init-factory-change.mjs <change-id> "<变更名称>" <backend|platform|cross-cutting> .
```

设计必须包含文档影响。只有设计自检通过，且关键产品选择、兼容策略与数据迁移没有悬而未决，才能编码。

### Gate 4：按组件实现

- Workflow：完整读取 [Workflow 实现规范](references/workflow-implementation.md) 和 [统一页面契约](references/platform-display-contract.md)。使用独立 Host 包、公开 Backend exports、顺序 `await run.node(...)`、JSON-safe output 和安全 observation。
- Backend：完整读取 [Backend 开发规范](references/backend-development.md)。保持单一状态所有者，协同演进类型、持久化 schema、wire schema、Host 实现和 Browser facade，并处理竞态与兼容。
- Platform：完整读取 [Platform 开发规范](references/platform-development.md) 和 [统一页面契约](references/platform-display-contract.md)。只消费公开 snapshot/commands，保证通用回退、可访问交互和无业务特例。
- 跨组件：按 `Backend contract -> Backend implementation/client -> Platform -> Workflow/Bundle` 的依赖顺序推进；每一步保持可测试。

### Gate 5：同步接线与文档

完整读取 [文档同步](references/documentation-sync.md)。实现中只要契约、状态、数据流、参数、节点、输出、页面语义、限制、命令、安装或包成员变化，就必须先更新对应设计，再同步 `docs/architecture.md`、`README.md` 和相关 Skill reference。

新增包或发布成员时，同步 manifest、TypeScript references、build、pack、Factory dependencies、bundleDependencies、patch、lockfile 与版本。Bundle 只装配，不得吸收业务逻辑。

### Gate 6：分层验证

完整读取 [测试与交付](references/testing-and-delivery.md)。至少运行：

```powershell
npm.cmd run audit:ai
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

Workflow 还要把设计传给审计脚本；Backend/Platform 变更把 `.design/changes/` 文件传入。涉及 Bundle、安装或发布时运行 `npm.cmd run pack`，检查 tarball，并在隔离 DSH Home/Profile 中完成真实核心交互和完整浏览器验收。

### Gate 7：完成与交付

只有设计、代码、测试、文档、接线和适用的安装验收全部通过，才能声明完成。最终必须列出：

- 选择了哪些组件，以及为何没有把职责放到其他层；
- 公开契约、状态/数据流和兼容性变化；
- 设计与刷新过的文档路径；
- 执行过的验证及结果；
- 未验证项、已知限制和需要后续决策的能力。

## 不可绕过的禁止事项

- 不得先写代码、后补设计或文档。
- 不得导入其他包的 `src/*`、Platform 组件或 DSH 深层内部路径。
- 不得让 Workflow 写 run 状态、生命周期事件或自建 durable 状态机。
- 不得让 Platform 直接访问存储或按 Workflow id/包名/节点名称增加特例。
- 不得修改持久化字段却漏改 runtime schema，或修改共享类型却漏改 wire schema/调用方。
- 不得把 credential、完整私有 prompt、无界日志或本机绝对路径写入参数、输出或 observation。
- 不得以类型检查、HTTP 200、`dump-config`、组件快照或窄面板截图代替对应层级的行为验收。
- 不得在代码变化后跳过文档审计；“代码即文档”不是本仓库的完成条件。

旧入口 [workflow-development.md](references/workflow-development.md) 作为完整规范索引保留。
