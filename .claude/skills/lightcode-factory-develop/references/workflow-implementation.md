# Workflow 实现规范

开始前必须已有审计通过的 `.design/workflows/<workflow-id>.md`。本文件给出稳定实现模式；准确类型和字段以 Contracts 公开 exports 为准。

## 1. 包结构与依赖

普通 Workflow 使用纯 Host 包：

```text
packages/<workflow>/
├─ package.json
├─ tsconfig.json
├─ src/index.ts
└─ tests/
```

依赖方向：

```text
业务 Workflow --公开注册契约--> Factory Runtime
Factory Web --Remote Page/Detail--> Factory Runtime
```

要求：

- 包名、版本、exports、files 和模块格式跟随当前 workspace；
- Contracts 使用正式 package dependency，Cordis 按当前仓库约定声明；
- 不使用绝对 `file:` 依赖，不深层导入其他包源码；
- 默认没有 `dsh.client` 和 `./client`；
- 需要其他 Host 服务时显式声明 inject，并在设计中说明用途与缺失行为。

## 2. 注册模式

从 `lightcode-factory-contracts/workflow` 导入注册和节点上下文类型。实现应遵循以下形状：

```ts
const workflow = {
  id: 'stable-kebab-id',
  version: '从当前版本策略确定',
  name: '面向用户的名称',
  description: '用户将得到什么',
  parameters: [],
  nodes: [firstNode, secondNode],
  async execute(run) {
    const first = await run.node(firstNode, node => executeFirst(run.input, node))
    await run.node(secondNode, node => executeSecond(first, node))
  },
} satisfies WorkflowRegistration

export const inject = ['lightcodeFactoryRuntime']

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.lightcodeFactoryRuntime.registerWorkflow(workflow),
    'register stable-kebab-id workflow',
  )
}
```

规则：

- id 发布后保持稳定；
- version 描述节点和输出语义，按当前仓库策略升级；
- name/description 面向用户；
- parameters 只使用当前公开契约支持的类型；
- nodes 的顺序就是执行和页面顺序，id 唯一；
- execute 必须执行全部声明节点并逐个 await。

注册放在 `ctx.effect`，使卸载可以注销 definition，并由 Runtime 处理已接纳任务。不要直接写服务注册表。

## 3. 输入和业务校验

- 参数只承载允许持久化和展示的业务输入。
- 未知字段、必填和默认值由 Runtime 处理；格式、范围、跨字段等业务校验在节点中完成。
- Runtime 先创建 run 再执行首节点时，业务校验失败是可审计 failed run，不能声称“创建前拒绝”。
- credential 由 Host service、宿主设置或安全引用获取；参数最多保存非敏感资源 id。
- 产品必须在创建 run 前完成复杂校验时，这是 Contracts/Runtime 扩展，不在单个 Workflow 中伪造。

## 4. 节点实现

每个节点拆成独立可测函数：

```ts
async function executeNode(input: Input, node: WorkflowNodeContext): Promise<Output> {
  node.signal.throwIfAborted()
  await node.log('开始执行用户可理解的动作')

  const result = await doWork(input, { signal: node.signal })

  node.signal.throwIfAborted()
  await node.report({
    kind: 'domain.result',
    title: '结果摘要',
    detail: JSON.stringify(safeSummary(result)),
  })
  return toJsonSafeOutput(result)
}
```

通用要求：

- 昂贵步骤前后检查取消信号；
- 信号传到模型、工具、fetch、定时器和子进程最底层；
- 设置合理超时并释放 handle、监听器、临时文件和进程；
- 错误直接抛出，不吞错，不自行修改 run/node 状态；
- 不启动 detached promise 或在 `run.node()` 返回后继续写结果。

按节点类型检查：

| 类型 | 必须处理 |
| --- | --- |
| 纯转换/校验 | 纯函数、确定性输入、清楚的业务错误 |
| 模型/Agent | 当前宿主默认模型策略、超时、session 关联、工具观测、资源释放 |
| Tool/API | 运行时输入校验、AbortSignal、超时、安全错误、Host 凭据 |
| 子进程 | 正式 sandbox/subprocess 服务、参数数组、stdout/stderr 上限、等待退出 |
| 文件产物 | run 专属目录、路径约束、避免覆盖、返回 artifact 标识和 hash/大小 |

## 5. 输出契约

节点 output 必须是当前公开 JSON 类型允许的值：null、boolean、有限 number、string、数组或普通对象。不要返回 `Date`、`Error`、`Map`、`Buffer`、class 实例、函数、`undefined`、`NaN` 或 `Infinity`。

输出应满足：

- 只包含用户需要保留和查看的节点结果；
- 结构稳定、字段命名清楚、测试可断言；
- 在当前 Runtime 大小限制内；
- 大正文、二进制或大量日志改为 artifact 引用；
- 不包含绝对路径、凭据或无关内部信息；
- 页面不认识结构时，格式化 JSON 仍然可读。

不要用类型断言掩盖不可序列化数据。命名输出类型应与当前 SDK JSON 类型兼容。

## 6. Observation 契约

`node.log()` 和 `node.report()` 描述节点内部如何工作，不是 run 生命周期事件。kind 应复用当前 Web 已识别的模型、工具、进程和上下文类别；新增领域事实使用稳定的 `<domain>.<fact>` 命名。

要求：

- title 短、稳定、可扫描；detail 有界且安全；
- 同一次工具调用使用同一个 callId；同一 Agent 过程使用同一个 sessionId；
- 提交 observation 要 await，保证顺序并传播存储失败；
- 高频 token 或流式日志先聚合再上报，不逐 token 持久化；
- 不复制 output 全文，不记录 secret、完整私有 prompt 或内部 stack。

具体 kind 和限制值必须从当前 Web/Runtime 源码确认。

## 7. 状态和生命周期

Workflow 只发起节点工作。排队、开始、节点状态、评审、完成、取消、失败和重启恢复语义由 Runtime 产生。节点作者只负责：

- 在节点开始后完成、抛错或响应取消；
- 不让晚到结果覆盖终态；
- 不伪造生命周期事件；
- 不在 Workflow 内建立 durable 状态机。

设计和测试必须以当前 Runtime 实际状态图为准。

## 8. Workspace 与 Bundle 接线

新增包后从当前仓库确认并同步所有入口，通常包括：

1. 新包 manifest 和 tsconfig；
2. 根 TypeScript project references；
3. Host build 成员；
4. pack 成员；
5. Factory dependencies 和 bundleDependencies；
6. Factory patch 中的稳定 id/name 和非敏感配置；
7. lockfile；
8. 所有受影响成员版本。

完成后按目录名和包名反向 `rg`，确认每个接线点都存在。最终 tarball 中必须是实际文件，不能残留 workspace link 或本机绝对依赖。

## 9. 文档同步

Workflow 设计是持续契约。参数、节点、output、observation、失败/取消、安全、依赖或接线变化时，先更新 `.design/workflows/<workflow-id>.md`。若变更影响公开能力、包成员、安装方式、组件边界或已知限制，同时更新根 `README.md` 与 `docs/architecture.md`；开发规则变化还要更新本 Skill 的对应 reference。
