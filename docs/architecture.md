# LightCode Factory 当前架构

本文描述当前 checkout 已实现的架构，使人类和 AI 可以从稳定边界进入代码，而不把系统当作黑盒。具体版本、限制值和字段仍以源码、manifest 与测试为准；本文件记录职责、数据流、状态所有权和修改入口。

## 1. 系统边界

LightCode Factory 是一组安装到 DSH 的进程内 Cordis 插件。它没有修改 DSH 源码，也不是远程 Worker 控制面或恶意插件沙箱。

```text
Factory Bundle（安装与装配）
  ├─ Backend Host ── DSH Storage Domain / Typert Remote
  │      ↑
  │      └── Workflow Host plugins（业务执行）
  ├─ Backend Browser Client ── Remote facade / polling
  │      ↓
  └─ Platform Browser plugin（看板、详情、轨迹）
```

仓库中三个可开发组件是 Workflow、Backend 和 Platform。`packages/factory` 是发布装配层，不是第四个业务组件。

## 2. 组件职责与依赖方向

### 2.1 Workflow：业务执行插件

当前实例位于 `packages/demo` 和 `packages/release-readiness`。Workflow 通过 `lightcode-factory-backend` 的公开 exports 获取 `WorkflowRegistration`、节点定义和节点上下文，并在 Cordis 生命周期内注册完整执行函数。

Workflow 负责：

- 面向用户的名称、版本、描述与文本参数；
- 有序节点及其业务职责；
- 节点内的模型、工具、API、子进程或纯计算；
- JSON-safe 节点输出；
- 安全且有界的 observation；
- 将取消信号传到最底层并释放资源。

Workflow 不负责 run 状态、调度、持久化、生命周期事件、评审或页面。当前 Backend 会校验节点必须按声明顺序逐个 `await`，拒绝并行、跳过节点以及 execute 提前返回。

### 2.2 Backend：控制面与唯一状态写入者

`packages/backend/src/index.ts` 中的 `LightcodeFactoryBackend` 是 Host 服务，负责：

- 注册与卸载 Workflow definition；
- 校验已声明的文本参数并接纳任务；
- 进程内并发队列和顺序节点调度；
- run/node 状态、生命周期事件和 observation；
- 使用 DSH Storage Domain 持久化 run；
- 取消、人工评审、停机 drain 和插件卸载；
- 输出及 observation 的数量/大小限制；
- 通过 Typert 暴露 Browser 命令。

Backend 内部契约分层如下：

| 文件 | 角色 | 变更注意事项 |
| --- | --- | --- |
| `src/types.ts` | Host/Browser 共享的 JSON-safe 领域类型 | 不放函数或 Host-only 对象 |
| `src/runtime-types.ts` | Workflow 与 Backend 的进程内执行契约 | 只通过 package exports 暴露 |
| `src/spec.ts` | 持久化 runtime schema 和 storage domain | 兼容历史数据或设计迁移 |
| `src/remote.ts` | Browser wire schema 与命令描述 | 与共享类型、Host 方法同步 |
| `src/index.ts` | 注册、接纳、调度、状态 mutation 与持久化 | 保持 mutation 串行和状态唯一所有权 |
| `src/client/index.ts` | Browser 侧 snapshot/command facade | 只通过 Remote 通信并管理轮询生命周期 |

Backend 重启时会把遗留的 `queued`/`running` run 标记为 `failed`，不会自动恢复节点。已接纳 run 会捕获其注册实现；Workflow 卸载时注销新 definition，并取消/等待该实现的活动任务。

### 2.3 Platform：统一 Browser 展示与交互

`packages/platform` 的 Host 入口为空壳，主要能力在 Browser Client：

- `src/client/index.ts` 注册 locale、主面板和侧栏入口，并注入 Backend Browser Client；
- `WorkflowPlatformPanel.tsx` 负责工作流选择、参数表单、六状态看板、run 详情入口、取消和评审命令；
- `WorkflowRunOverview.tsx` 负责进度、节点选择、输出、运行信息和生命周期事件；
- `WorkflowTrace.tsx` 将 observation、节点输出与错误组织为可筛选轨迹；
- `WorkflowPlatformPanel.module.css` 负责组件自有样式和响应式布局。

Platform 只读取 `WorkflowPlatformSnapshot` 并调用 `start/cancel/review/refresh`。它不修改 run，不直接访问 storage，也不调用 Workflow。未知 JSON output 必须有通用格式化回退；增强 renderer 只能基于可跨 Workflow 复用的字段语义。

### 2.4 Factory Bundle：安装装配

`packages/factory/package.json` 固定成员依赖和 `bundleDependencies`，`cordis.patch.yml` 按顺序装配 Backend、Workflow 与 Platform，`scripts/pack.mjs` 把成员真实 tarball 安装到临时 staging 后再生成外层 Bundle。

Bundle 不包含运行逻辑。新增包时需要同步 TypeScript references、build/pack 成员、Factory dependencies、bundleDependencies、patch、lockfile 和版本。

## 3. 关键数据流

### 3.1 注册与发现

1. Bundle 装配 Backend 与各 Workflow。
2. Workflow 在 `ctx.effect` 中调用 `registerWorkflow(registration)`。
3. Backend 保存带 execute 函数的进程内 registration；对 snapshot 只暴露可序列化 metadata。
4. Backend Browser Client 通过 Remote 拉取 snapshot；Platform 从 definitions 生成工作流选择和参数表单。

### 3.2 创建与执行

1. Platform 调用 Browser Client 的 `start(workflowId, input)`。
2. Remote 进入 Backend；Backend 拒绝未知字段、补默认值、校验必填文本并先持久化 `queued` run。
3. 内存队列按 `maxConcurrentRuns` 调度，run 进入 `running`。
4. Workflow 按声明顺序调用 `run.node()`；Backend 在每个节点前后写入状态和事件。
5. 节点可通过 `log/report` 写入 observation；返回值经 JSON schema 和大小限制检查后成为 `node.output`。
6. 全部节点完成后 run 进入 `review`；人工通过后为 `completed`，人工拒绝复用取消路径。

### 3.3 取消、失败与停止

- 取消先持久化 `cancelled`，再 abort 对应 controller，防止晚到结果覆盖终态。
- 节点抛错时 Backend abort 执行上下文，等待活动节点结束，再把运行节点和 run 标记为 `failed`。
- Backend 停止时停止接纳、等待 admission、abort 活动执行、等待 mutation 和 task，再关闭 storage domain。
- 所有同一 run 的 mutation 经 promise 链串行化，避免 observation、状态和命令并发覆盖。

### 3.4 展示与观测

- Backend Browser Client 当前定时轮询完整 snapshot，并在命令完成后立即 refresh。
- 运行详情只消费 node output/error 与 Backend 生命周期事件。
- 轨迹消费 node observations，并附带节点输出/错误作为上下文记录；`callId` 用于关联工具活动，`sessionId` 目前在共享协议中保留。
- 页面永远以公开数据结构为输入，Workflow 不提供自己的 Browser Client。

## 4. 状态模型

```text
queued -> running -> review -> completed
   |         |          |
   +---------+----------+-> cancelled
             |
             +--------------> failed
```

节点状态为 `pending | running | completed | cancelled | failed`。状态转换只能由 Backend 完成。Workflow 的职责只有完成节点、抛出错误或响应取消；Platform 的职责只有发送用户命令并显示结果。

## 5. 如何选择修改位置

| 需求例子 | 首选组件 | 原因 |
| --- | --- | --- |
| 新增一个发布评估或代码生成流程 | Workflow | 业务参数、节点与结果只属于该流程 |
| 新增参数类型、重试、checkpoint、DAG 或新 run 状态 | Backend，并可能联动 Platform | 改变所有 Workflow 的执行/协议语义 |
| 新增通用 artifact 展示、轨迹过滤或可访问性交互 | Platform | 只改变共享 Browser 呈现 |
| 新字段既要持久化又要展示 | Backend -> Platform | 先定义类型/schema/Remote，再消费 |
| 新增 Workflow 包并随 Bundle 安装 | Workflow + Factory 接线 | Bundle 只装配，不实现业务 |

跨组件变更必须保持依赖单向：Workflow 不依赖 Platform；Platform 不导入 Backend 私有源码；Backend 不依赖具体 Workflow。

## 6. 当前能力边界

当前已实现：可信进程内插件、字符串参数、顺序节点、有界 JSON 输出与 observation、进程内并发队列、取消、人工评审、JSON storage、Remote 命令、轮询看板、统一详情和轨迹。

当前未实现：非文本参数/安全凭据输入、DAG/并行/循环/动态节点、自动重试、checkpoint/断点续跑、幂等启动键、事件推送、跨进程 Worker、多租户隔离、恶意插件沙箱、独立数据库服务。引入这些能力应先做 Backend/Platform 设计，不得在单个 Workflow 中私建替代品。

## 7. 代码导航与验证

开发入口：

- 仓库规范：`AGENTS.md`
- Agent Skill：`.claude/skills/lightcode-factory-workflow-develop/SKILL.md`
- Backend 行为：`packages/backend/src/` 与 `packages/backend/tests/backend.spec.ts`
- Platform 行为：`packages/platform/src/client/` 与 `packages/platform/tests/panel.spec.tsx`
- Workflow 范例：`packages/release-readiness/`
- 构建/打包：`scripts/build.mjs`、`scripts/pack.mjs`

基础验证：

```powershell
npm.cmd run audit:ai
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

涉及 Bundle 或安装行为时再运行 `npm.cmd run pack`，并在隔离 DSH Home/Profile 中完成真实安装、运行和浏览器验收。
