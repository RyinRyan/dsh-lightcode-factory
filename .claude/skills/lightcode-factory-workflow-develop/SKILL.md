---
name: lightcode-factory-workflow-develop
description: 在 lightcode-factory 中依据原始业务需求，先设计、再实现、接线、测试、打包并验收独立可插拔的业务 Workflow。适用于新增或修改 WorkflowRegistration、顺序节点、节点输出与观测、Factory Bundle 集成；开发其他 DSH 插件或仅修改通用平台时不要使用。
---

# LightCode Factory Workflow 开发

目标：让能力有限的 Agent 也能把原始需求可靠地实现为独立、可安装、可卸载的 Workflow 插件，同时完全复用 Factory 的调度、状态、持久化、看板、运行详情、轨迹、取消和评审能力。

核心模型只有两层：

```text
LightCode Factory 底座
  ├─ backend：注册、调度、状态、持久化和接口
  └─ platform：统一看板、运行详情和轨迹
          ↑ 公开契约
独立 Workflow 插件：参数、节点、业务执行、输出和观测
```

普通 Workflow 开发不得修改底座。只有需求无法由公开契约表达，并且用户明确授权平台演进时，才允许扩大范围。

## 必须执行的六个 Gate

### Gate 1：识别任务边界

1. 完整读取 [核心契约](references/core-contract.md)。
2. 按 [仓库探索](references/repository-discovery.md) 检查当前源码，不能相信本文中的历史版本或旧快照。
3. 判断需求属于：
   - 普通 Workflow：现有参数、顺序节点、输出、观测和统一页面可以表达；
   - 平台能力扩展：需要 DAG、恢复、重试、非文本参数、新状态、新 Remote 字段、专属交互或其他协议变化。
4. 普通 Workflow 继续；平台能力扩展必须在设计文档中列出缺口。若用户未授权底座改造，暂停实现并请求决定，不得在业务包中绕过。

### Gate 2：设计先行

1. 完整读取 [设计门禁](references/design-template.md)。
2. 在 `.design/workflows/<workflow-id>.md` 创建设计文档。优先运行：

```powershell
node .claude/skills/lightcode-factory-workflow-develop/scripts/init-workflow-design.mjs <workflow-id> "<工作流名称>" .
```

3. 设计必须覆盖参数、节点、输入输出、观测、取消、失败、页面映射、安全、接线和验收。
4. 运行设计审计：

```powershell
node .claude/skills/lightcode-factory-workflow-develop/scripts/audit-lightcode-workflow.mjs . --design .design/workflows/<workflow-id>.md
```

5. 用户只要求设计时，在交付设计文档后停止。用户要求实现时，设计自检通过即可继续；只有存在关键产品选择或平台协议扩展时才暂停等待用户。

没有设计文档或设计审计未通过，不得开始写业务代码。

### Gate 3：实现独立插件

1. 完整读取 [Workflow 实现规范](references/workflow-implementation.md) 和 [统一页面契约](references/platform-display-contract.md)。
2. 创建独立 `packages/<workflow>` Host 插件，仅依赖 backend 公开 exports。
3. 每个声明节点实现为独立可测函数，并严格按声明顺序 `await run.node(...)`。
4. `node.output` 只保存节点结果；`node.log()`/`node.report()` 只保存节点内部过程。
5. 注册放入 `ctx.effect`；凭据不进入参数、输出、观测或 Browser snapshot。
6. 默认不创建 `./client`，不修改 backend/platform，不写 `workflowId` 页面特例。

### Gate 4：同步接线和设计

同时完成 manifest、TypeScript reference、build、pack、Factory dependencies、bundleDependencies、patch 和 lockfile。包或契约变化时按仓库现行版本策略升级版本。

实现过程中若节点、参数、输出结构、观测或失败语义变化，必须先同步 `.design/workflows/<workflow-id>.md`，再继续编码。设计不是一次性草稿。

### Gate 5：验证

完整读取 [测试与交付](references/testing-and-delivery.md)，至少验证：

- 真实 backend/存储/Loader 装配；
- 公开 Cordis disposer 注销；
- 参数安全、节点顺序、输出、观测、事件、评审和失败/取消；
- 点击节点切换对应输出，内部过程只出现在轨迹；
- Bundle 接线和最终 tarball 内容；
- 隔离 DSH Home/Profile 中的安装、启动和真实核心交互；
- 完整桌面浏览器与较窄窗口下的统一页面表现。

按当前仓库实际脚本执行，不得把文档示例当作唯一真相。通常包括：

```powershell
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
npm.cmd run pack
node .claude/skills/lightcode-factory-workflow-develop/scripts/audit-lightcode-workflow.mjs . --built --design .design/workflows/<workflow-id>.md
```

### Gate 6：完成与交付

只有设计、代码、测试、接线、审计、构建、真实 tarball 和隔离环境验收全部通过，才能声明完成。最终必须列出：

- Workflow id、包名和从当前仓库读取的实际版本；
- 参数、节点及各节点输出形状；
- 页面复用方式与观测语义；
- 设计文档和 tarball 路径；
- 执行过的验证及结果；
- 未验证项、已知限制和底座暂不支持的能力。

## 不可绕过的禁止事项

- 不得先写代码、后补设计。
- 不得复制文档中的版本号、依赖版本、CSS 像素或断点作为当前事实。
- 不得导入 `packages/backend/src/*`、平台组件或 DSH 深层内部路径。
- 不得在 Workflow 内私建 run 状态机、生命周期事件或 detached work。
- 不得用 `workflowId`、包名或节点名称给共享页面增加特例。
- 不得把工具调用、模型过程等 observation 重复显示在运行详情。
- 不得把 credential 设计为 Workflow 参数，或写入 output/observation。
- 不得以 `dump-config`、HTTP 200、单元测试截图或窄面板截图代替真实交互验收。

旧入口 [workflow-development.md](references/workflow-development.md) 仅作为文档索引保留，不再承载易漂移的完整规范。
