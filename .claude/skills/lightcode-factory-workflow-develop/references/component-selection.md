# 组件选择：把需求放到正确的层

先选择职责所有者，再考虑文件。一个需求可以跨组件，但同一种状态或语义只能有一个权威来源。

## 1. 快速决策

依次回答：

1. 能否仅通过一个业务 Workflow 的参数、顺序节点、output、observation、取消和评审实现？能则选择 Workflow。
2. 是否改变多个 Workflow 共用的接纳、调度、状态、持久化、限制、恢复、Remote 或生命周期？是则选择 Backend。
3. 是否只改变多个 Workflow 共用的 Browser 信息架构、交互、通用 renderer、轨迹或响应式行为？是则选择 Platform。
4. 是否新增 Backend 字段/命令并需要展示？选择 Backend + Platform，先定义 Backend 契约。
5. 是否只增加安装成员、Bundle patch 或发布产物？这属于 Factory 接线，不应产生业务实现。

## 2. 选择 Workflow

适合：业务特定的输入、节点拆分、Agent/tool/API/脚本调用、确定性计算、业务结果与领域 observation。

前提：

- 输入可由当前字符串参数表达；
- 执行可由固定顺序节点表达；
- 结果可用有界 JSON 或 artifact 引用表达；
- 状态、取消、失败和评审可以完全复用 Backend；
- 页面可通过通用 output 回退和轨迹表达。

出现 DAG、重试、checkpoint、复杂/敏感输入、新状态、新命令或专属交互时，退出普通 Workflow 路径，重新分类。

## 3. 选择 Backend

适合：

- 共享参数类型或校验时机；
- 新 run/node 状态和状态转换；
- 队列、公平性、并发、幂等、重试、恢复、超时；
- 持久化字段、索引、迁移与历史兼容；
- output/observation 限制和公共 artifact 语义；
- 新 Browser 命令、snapshot 字段或安全/权限规则；
- 插件注册、卸载、停机 drain 和竞态语义。

Backend 是唯一 durable 状态写入者。业务特例不能进入 Backend；应抽象成所有 Workflow 都能理解的公开契约。

## 4. 选择 Platform

适合：

- 工作流选择、参数表单、看板、详情、评审动作；
- 通用 output renderer 与 JSON fallback；
- observation 分类、搜索、筛选、关联和检查器；
- 可访问性、键盘交互、loading/empty/error 状态；
- 节点溢出、响应式布局和跨 Workflow 的视觉语义。

Platform 不拥有业务状态或执行。若 UI 需要一个 Backend 未公开的事实，先扩展 Backend 契约，不从私有存储或对象偷取。

## 5. 跨组件与反例

| 需求 | 正确路径 | 错误路径 |
| --- | --- | --- |
| 新增 artifact 元数据并可预览 | Backend 定义/持久化/Remote，Platform 通用展示，Workflow 产出 | 每个 Workflow 自建页面 |
| 新增失败自动重试 | Backend 设计 attempt、幂等、状态与持久化，Platform 展示 | Workflow catch 后静默循环 |
| 某业务增加风险评分 | Workflow | Backend 根据 workflowId 分支 |
| 页面识别通用代码输出 | Platform 设计跨 Workflow 字段语义 | 按 demo 节点名判断 |
| 新增一个 Workflow 随产品安装 | Workflow + Bundle 接线 | 把业务逻辑写进 factory package |

最终设计必须写明“选择的组件”“不选择其他组件的理由”和“跨层契约顺序”。

