# Backend 开发规范

Backend 承载 Factory 的控制面：共享契约、任务接纳、调度、状态、持久化、取消、评审和 Browser Remote。任何 Backend 变更都可能影响所有 Workflow、已有持久化 run 和 Platform，必须先完成 `.design/changes/<change-id>.md`。

## 1. 修改入口

从当前源码确认文件位置；当前职责通常是：

| 层 | 职责 | 规则 |
| --- | --- | --- |
| 共享领域类型 | JSON-safe definition/run/node/event/request | Host 与 Browser 都可安全消费 |
| Workflow runtime 类型 | registration、execution/node context | 只包含进程内能力，不跨 wire |
| 持久化 schema | storage domain 与历史数据解析 | 类型变化必须有 schema 与兼容策略 |
| Remote schema | snapshot/command 的严格 wire 校验 | 与共享类型和 Host 方法同源演进 |
| Host service | 注册、接纳、队列、执行、mutation、持久化 | 唯一状态写入者 |
| Browser client | observable snapshot、命令 facade、轮询 | 不复制状态机 |

不要把同一字段分别定义成互相漂移的 TypeScript、storage 和 Remote 三套真相。当前技术约束下必须重复表达时，在同一变更中一起修改并用 round-trip/行为测试锁定。

## 2. 状态与并发

- 先画出合法状态转换、命令前置条件和终态；拒绝非法转换。
- 同一 run 的 mutation 必须串行，所有 durable 写入成功后才能对外宣称状态完成。
- 取消要先建立终态，再通知执行侧；节点晚到 output/observation 不得覆盖 cancelled/failed。
- 并发队列必须处理取消的 queued item、插件卸载、admission 写入中卸载、Backend 停止和 task finally 补位。
- 新重试/恢复能力必须显式设计 attempt、幂等、副作用边界和重启行为；不要只在内存中加循环。
- 注册 disposer 必须阻止新 run，并取消/等待已捕获该 implementation 的活动 run。

## 3. 持久化与兼容

新增或改变 durable 字段时：

1. 更新共享类型和 runtime schema；
2. 判断旧记录缺少字段时的默认/optional 行为；
3. 判断 schema/domain 版本是否需要升级或迁移；
4. 覆盖旧记录加载、重启恢复和异常数据拒绝；
5. 更新 snapshot/wire schema 与 Platform 消费；
6. 在 `docs/architecture.md` 记录新的权威语义和边界。

不能仅靠 TypeScript 可选字段声称兼容；必须由运行时 schema 与测试证明。

## 4. 公共契约设计

- 只把可序列化数据放进共享/wire 类型；AbortSignal、函数、service 等只存在 runtime 类型。
- 命令使用显式 request/result，不通过隐式全局状态传参。
- 错误信息面向调用者、安全且稳定；不要把内部 stack 或 secret 发送给 Browser。
- 限制配置有合理默认值和上下界，并覆盖边界测试。
- 新能力应面向所有 Workflow；若命名或行为只解释得通某个业务，应退回 Workflow。
- 改动已有字段、状态或命令时写清兼容/迁移策略，不以“当前只有 demo”作为破坏兼容的理由。

## 5. 测试要求

至少覆盖受影响的：

- registration 元数据校验、重复注册与 disposer；
- 参数接纳、默认值、未知字段与安全边界；
- 正常状态路径和所有命令的非法状态；
- 节点顺序、提前返回、并行、跳过、JSON-safe/大小限制；
- observation 截断、保留上限、顺序与写入失败；
- 取消与晚到结果、持久化 mutation 竞态；
- 插件卸载、Backend 停止和 Host 重启；
- storage schema 与 Remote schema 的 round-trip；
- Browser client 的成功、错误、refresh 和 interval disposer。

使用真实 Storage Domain、Typert 与公开 Cordis 生命周期做组合测试。不要通过调用私有字段来制造状态。

## 6. 完成检查

- 没有第二个状态写入者或只在内存成立的 durable 语义；
- 类型、storage schema、wire schema、Host、Browser client 和调用方一致；
- 旧持久化数据的行为有证据；
- 所有竞态与 disposer 路径能结束，不泄漏 timer/controller/task；
- `docs/architecture.md`、本规范和 README 中受影响的公开行为已刷新；
- typecheck、Backend 测试、全量测试、build、文档审计通过。
