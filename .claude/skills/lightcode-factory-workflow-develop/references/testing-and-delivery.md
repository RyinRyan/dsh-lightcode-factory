# 测试、打包与交付

验证目标不是“代码能编译”，而是证明被修改组件的公开契约、状态所有权、交互、文档和发布装配一致。Workflow 要证明可被注册、运行、观测、评审、安装和卸载；Backend/Platform 要证明所有现有 Workflow 仍可通过通用契约工作。

## 1. 测试矩阵

### Backend 测试

- 类型、持久化 schema 与 Remote schema 的一致性和 round-trip；
- 合法/非法状态转换、串行 mutation、持久化失败；
- admission、queued/running 取消、晚到结果与终态保护；
- 并发上限、队列补位、Workflow 卸载和 Backend 停止；
- Host 重启与旧持久化记录兼容；
- Browser client 的命令、刷新、错误状态和轮询 disposer。

### Platform 测试

- definition 驱动的表单、默认值、提交中状态与错误反馈；
- 六状态看板、取消/评审动作和详情导航；
- 节点选择与 output/error 切换，未知 JSON 的通用回退；
- observation 只进入轨迹，筛选、搜索、关联与检查器正确；
- 对话框焦点、Escape、ARIA、键盘与非颜色状态表达；
- 节点不溢出/真实溢出、桌面与较窄窗口行为。

### 节点级测试

- 参数到节点输入的转换；
- 业务校验和边界值；
- JSON-safe output 的准确结构；
- observation 的 kind、title、detail、callId/sessionId；
- AbortSignal、超时、工具错误和资源释放；
- 凭据不进入 input/output/observation。

### 真实组合测试

使用当前仓库真实 Backend、存储和 Loader 组合，证明：

- Loader 激活后 definition 出现在 snapshot；
- 参数默认值、必填和未知字段符合当前契约；
- 节点严格按声明顺序执行；
- 每个节点 output/observations 持久化正确；
- Backend 生命周期事件和最终状态正确；
- 正常执行进入当前底座规定的后续状态并可完成评审；
- 至少覆盖失败或取消，晚到结果不能覆盖终态。

### 公开生命周期测试

在最小 Context 中通过公开 `ctx.plugin(...)` 返回的 fiber/disposer 卸载插件，验证 definition 注销和资源释放。不要读取 Loader subtree 或调用私有树 API。

Loader composition 和公开 disposer 是两个不同契约，不要让一个巨型测试同时承担所有职责。

### Platform 契约测试

- 新增 definition 自动出现在新建任务选择中；
- 参数表单按 metadata 生成；
- 点击不同节点后展示对应 output；
- 运行详情不出现工具调用等 observation；
- 切换到轨迹后可查看内部过程；
- output 未命中增强 renderer 时使用通用 JSON 回退；
- 节点较多时仍由通用节点轨道导航，不增加 Workflow 特例；
- 事件时间线保持纵向，并可展开、收起和按 Platform 当前能力移动。

普通 Workflow 若完全复用已有 Platform，可以依赖 Platform 已有通用交互测试，但仍需用该 Workflow 的真实 output fixture 至少验证一次节点切换和 JSON/语义渲染。

## 2. 接线审计

从当前仓库确认并检查：

- 新包 manifest 和公开 exports；
- Backend 依赖版本与 workspace 一致；
- Cordis/宿主 peer 或 dependency 声明正确；
- 根 TypeScript reference；
- build 和 pack 成员；
- Factory dependencies 与 bundleDependencies；
- Factory patch 装配；
- lockfile 与成员版本；
- 最终构建产物存在；
- manifest 和 tarball 内没有不可移植的绝对依赖。

运行仓库审计脚本，并把本次设计传入：

```powershell
node .claude/skills/lightcode-factory-workflow-develop/scripts/audit-lightcode-workflow.mjs . --built --design .design/workflows/<workflow-id>.md
```

Backend/Platform 变更改传 `.design/changes/<change-id>.md`。所有任务都运行 `npm.cmd run audit:ai` 检查仓库文档入口与本地代码/文档变更映射。

## 3. 构建和打包

先从根 manifest 读取实际脚本，再按依赖顺序执行类型检查、测试、构建、审计和打包。不得假设命令或包管理器永远不变。

最终 Bundle 必须检查：

- 外层 tarball 存在且版本正确；
- 业务 Workflow 成员实际包含在 Bundle 中；
- 成员是可安装文件，不是 workspace link；
- patch 会装配该 Workflow；
- 不包含本机绝对路径或敏感配置；
- 文件清单与 manifest 的 `files`/exports 一致。

Windows 环境若 npm cache 因沙箱权限失败，应申请最小必要权限后重跑；不要通过会改变依赖语义的临时 cache/offline 方案掩盖问题。

## 4. 隔离 DSH 验收

使用独立 DSH Home/Profile，避免依赖开发者现有全局配置。验收至少包含：

1. 安装最终 tarball；
2. 检查 Profile/patch 的实际装配；
3. `dump-config` 或等价诊断可解析；
4. 启动真实 DSH 服务；
5. 在统一页面新建该 Workflow；
6. 观察看板状态流转；
7. 打开 run，逐个点击节点并核对对应输出；
8. 打开轨迹，核对模型/工具/进程内部过程；
9. 验证错误或取消；
10. 验证当前底座的评审流程；
11. 重启后检查历史 run；
12. 检查升级和卸载不会破坏其他 Workflow。

`dump-config` 只证明配置可解析，HTTP 200 只证明服务响应；都不能替代创建和运行 Workflow。

## 5. 浏览器验收

必须使用完整桌面浏览器页面，而不是只看组件、窄侧栏或纵向截图。不要固定某个像素作为永久规范；选择当前开发环境中有代表性的桌面窗口，并至少再缩窄一次验证响应式行为。

检查：

- DSH 原生侧栏存在时页面仍对齐；
- 可容纳的节点完整平铺，没有无意义滚动提示；
- 节点真实溢出时可以横向浏览；
- 点击与拖拽不会互相误触；
- 输出和运行信息在同一信息层级，长内容不把其他区域拉出巨大空白；
- 事件时间线在宽屏仍纵向排列；
- 轨迹与运行详情内容不重复；
- loading、empty、error、running、review 和终态至少按任务风险抽查。

浏览器验收发现的问题必须形成自动化回归测试；只修 CSS、不补行为测试，不能视为稳定修复。

## 6. 完成定义

只有以下项目全部满足才可声明完成：

- 设计文档状态为“已实现并验证”，且与源码一致；
- 独立插件注册、执行和卸载均使用公开契约；
- 参数、节点、输出、观测、失败和取消有测试证据；
- 统一页面无业务特例即可创建、查看和操作 run；
- build/test/pack/audit 全部通过；
- 最终 tarball 在隔离 Profile 安装并激活；
- 真实核心交互和页面显示已验证；
- `AGENTS.md`、`docs/architecture.md`、README、设计与相关 Skill reference 已按影响同步，文档审计通过；
- 未验证项和底座限制被明确列出。

Backend/Platform-only 变更不强制虚构 Workflow/tarball 验收；是否需要 pack/隔离安装由装配和运行时风险决定，并在设计中说明。交付报告应提供组件选择、设计与刷新文档路径、公共契约变化、包和版本、适用的 tarball 路径及 hash、验证命令与结果、未验证项和已知限制。
