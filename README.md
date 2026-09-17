# LightCode Factory

独立的 DSH 插件项目。四个成员插件由 `lightcode-factory` 安装入口装配，不修改 DSH 原生源码。

首次参与开发或交给 Agent 修改前，请先读 [仓库开发规范](AGENTS.md) 和 [当前架构](docs/architecture.md)。前者定义组件选择、质量门禁和文档同步要求，后者从当前代码说明 Workflow、Backend、Platform 与 Bundle 的职责、依赖、状态所有权和数据流。

## 插件开发教学站

本仓库附带一套基于本项目真实开发过程整理的交互式教学站和分册文档，覆盖 Cordis 基础、DSH 插件类型、Web 前台、后台服务、打包、依赖、调测与踩坑：

```powershell
npm run docs:serve
```

打开终端显示的本地地址。适合人类逐章学习的入口是 `docs/plugin-development/site/index.html`；适合开发者或 Agent 按任务读取的入口是 `docs/plugin-development/README.md`。

已验证：Windows、Node 24.11.0、官方 DSH CLI **0.1.5-rc.1**（宿主 SDK **0.1.5-rc.2**）、Web 界面。其他 DSH 版本需要重新做接口兼容验证，不能直接假定兼容相邻源码目录中的 0.1.6。

原先源码版保留在相邻的 `dsh` 目录，独立项目的构建不能依赖该目录。

## 安装与启动

使用官方 DSH CLI，而不是原先源码目录的启动脚本。推荐创建一个独立 profile（仍使用正常 DSH home 中的模型设置）：

```powershell
dsh --profile lightcode --from-default-profile web --dump-config
dsh plugin --profile lightcode add "D:\develop\dsh-workflow\lightcode-factory\dist\lightcode-factory-0.1.7.tgz" --ignore-scripts
dsh --profile lightcode --no-open --host 127.0.0.1 --port 3892
```

打开终端打印的带 token 地址。如果 3892 已被使用，换一个空闲端口。安装后侧栏出现 **LightCode Factory**，新建任务可选择工作流。无需修改 DSH 源码，也无需在启动时传入产品 patch。已有同名 profile 时不要重复初始化。

包已生成在 `dist/lightcode-factory-0.1.7.tgz`，内含四个成员插件及所需普通依赖。尚未发布 npm，也未确认公共包名归属。正式发布前应选择组织 scope/私有 registry，并更新版本；不要覆盖同版本 tarball 来升级，包管理器可能复用缓存。

停止服务使用终端 Ctrl+C。卸载：

```powershell
dsh plugin --profile lightcode remove lightcode-factory
```

卸载移除插件及 profile 装配，不删除历史。当前 JSON 存储位置是 DSH home 下 `storages/workflow_platform.json`；脚本位于 `lightcode-factory/artifacts/<runId>/`。同一个 DSH home 的这些数据不是按 profile 隔离的。

## 插件职责与扩展

| 包 | 职责 | 依赖 |
| --- | --- | --- |
| lightcode-factory-platform | 看板、新建任务、节点输出和内部事件 | backend 客户端服务、DSH UI 插槽 |
| lightcode-factory-backend | 工作流注册、顺序调度、状态、存储、评审及通信 | DSH 存储、API gateway、Typert |
| lightcode-workflow-demo | 问候 → 当前模型生成脚本 → 执行脚本 | backend 注册协议、DSH Agent 和执行服务 |
| lightcode-workflow-release-readiness | 规范化输入 → 确定性风险评分 → 发布检查清单 | backend 注册协议 |
| lightcode-factory | 只负责安装装配，不包含业务逻辑 | 上述四个包 |

新工作流新增一个 DSH 插件，通过后端的 `WorkflowRegistration` 注册完整执行函数；无需修改看板或 backend。最小示例：

```typescript
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'lightcode-factory-backend'
export const inject = ['lightcodeFactoryBackend']
export function apply(ctx: Context) {
  const node = { id: 'hello', name: '问候' }
  ctx.effect(() => ctx.lightcodeFactoryBackend.registerWorkflow({
    id: 'my-workflow', version: '1.0.0', name: '我的工作流',
    description: '最小示例', parameters: [], nodes: [node],
    async execute(run) {
      await run.node(node, async context => {
        context.signal.throwIfAborted()
        await context.log('开始执行')
        return { message: '你好' }
      })
    },
  }), 'register my workflow')
}
```

发布时声明后端兼容版本，构建自己的 host 入口，并提供 DSH bundle patch 装配该插件。使用 `ctx.effect` 注销注册、逐个 `await run.node`、传递取消信号；节点输出必须可 JSON 序列化。细节见 `packages/backend/src/runtime-types.ts` 和 Demo。前后端共享严格 wire schema 位于 `packages/backend/src/remote.ts`，不需要更改 DSH 内建 remotes。

新增或修改 Workflow、Backend、Platform 时统一使用 Skill：[lightcode-factory-workflow-develop](.claude/skills/lightcode-factory-workflow-develop/SKILL.md)。该路径为兼容历史名称保留；Skill 会先进行组件选择，再路由到 Workflow、Backend 或 Platform 的开发规范，并强制在完成前同步相关文档。规范索引见 [workflow-development.md](.claude/skills/lightcode-factory-workflow-develop/references/workflow-development.md)。

## 开发与验证

```powershell
cd D:\develop\dsh-workflow\lightcode-factory
npm ci
npm run audit:ai
npm run build
npm test
npm run pack
```

构建依赖已锁定在 package-lock.json。运行时共享宿主 Cordis、React 和 DSH 能力，不内嵌第二套宿主。安装包只包含产物，测试模型和测试配置不打包。

0.1.5 已验证原版宿主本地安装、看板/新建任务、原生 Agent 工具调用及结果、脚本进程输出 `{"sum":28}`、评审、重启保留历史、卸载。本次 0.1.7 已完成 typecheck、全部测试、build、静态审计、真实 tarball 打包和隔离 DSH Profile 的宽屏交互复核。`release-readiness` 通过 Loader composition 与公开 Cordis lifecycle 测试验证了参数校验、三个顺序节点、结构化输出、失败路径、评审与插件卸载注销。workflow 文本参数会原样持久化并显示，因此不得输入 credential；节点输出脱敏不能替代输入边界。模型使用测试专用确定性 adapter，工具与脚本是真实执行；**未调用你的火山 AI 网关，未验证真实模型返回质量**。测试 adapter 特别区分后台会话标题生成，避免消耗工作流响应。

运行详情采用 DSH 原生“轨迹”页的观测语言：顶部按输入、模型、工具显示时序概览，账本按 Workflow 节点分组并区分请求、推理、响应、工具调用、工具结果、进程和节点输出；支持节点范围、时长、调用 ID、搜索以及右侧完整记录检查器。它消费 Factory 的公开 observation 协议，没有复制或修改 DSH Session 内部数据。

产品使用 DSH 当前默认模型及权限策略，不替换你的设置。测试 fixture 仅在隔离 DSH_HOME 下启用完整执行权限以运行已知脚本，不可把 `.verification/fixture.patch.yml` 当生产启动配置。

## 当前边界

当前是可信、进程内插件，不是恶意插件沙箱或插件市场权限系统。仅支持顺序节点；无 DAG 并行、断点续跑、自动重试和多进程调度。存储是 DSH JSON storage，不是独立数据库服务。平台通过轮询更新，尚非事件推送。只有脚本生成节点调用模型，问候与名言是本地生成/固定文本。生成代码有风险，请使用合适的宿主沙箱策略并审查代码；不应为真实模型沿用测试用的全权限配置。
