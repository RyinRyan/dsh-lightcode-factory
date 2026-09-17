# Platform 开发规范

Platform 是共享 Browser 展示层，负责所有 Workflow 的看板、任务创建、运行详情、轨迹与用户命令。它只消费 Backend 公开 Browser service 与 JSON-safe 类型，不拥有执行或持久化状态。

## 1. 组件边界

- Host 入口只在确有 Host 能力时增加逻辑；当前主要能力属于 Browser Client。
- Browser 注册入口负责 locale、slot 和依赖注入；注册与资源必须跟随 Cordis lifecycle。
- 面板负责页面编排和命令触发，不复制 Backend 状态机。
- 运行详情展示 node output/error 和生命周期事件。
- 轨迹展示 observation 及其 call/session 关联；不要把内部过程重复塞进运行详情。
- CSS 属于插件自身，必须在构建产物中注入且不会污染宿主全局样式。

## 2. 数据与命令

- 只从 `WorkflowPlatformSnapshot` 派生 UI，不直接读取 storage、Host service 或 Workflow 对象。
- `start/cancel/review/refresh` 通过 Backend Browser facade 调用；处理 pending、成功、拒绝和 refresh 失败。
- UI 可以乐观显示本地交互状态，但不得伪造 durable run 状态。
- 新增展示字段前先让 Backend 提供公开类型、runtime/wire schema 和兼容行为。
- 未知 status/output/observation 如果协议允许出现，必须有安全回退；不要用不穷尽的强制断言隐藏协议变化。

## 3. 通用展示原则

- renderer 按稳定的字段语义工作，禁止使用 workflowId、包名、节点 id 或节点中文名称分支。
- 任意 JSON-safe output 都必须可通过通用格式化回退查看。
- 节点轨道同时承担进度与输出选择；点击节点必须切换对应 output/error。
- 只有真实内容溢出时才显示横向导航，提示元素本身不得制造溢出。
- 运行详情与轨迹职责清晰：结果在前者，过程在后者。
- loading、empty、error、queued、running、review 和终态都有可理解表现。

## 4. 可访问性与交互

- 使用语义化 `button`、`form`、`nav`、`main`、label 和必要的 ARIA 属性。
- 对话框处理初始焦点、Escape、提交中防重复与错误反馈；不能只依赖鼠标。
- 状态不能只靠颜色表达；按钮有可读名称，选中/展开使用 `aria-pressed`、`aria-selected` 或 `aria-expanded`。
- drag/scroll 等指针交互必须保留点击、键盘或原生滚动替代路径。
- 中英文 locale key 同步；不要在可复用组件中新增无法翻译的业务文案。

## 5. 测试与视觉验收

组件测试以用户可观察行为为主：

- definition 驱动表单和默认值；
- 命令参数、pending、防重复和错误显示；
- 六状态看板与详情动作可用性；
- 多节点选择切换 output，未知 output 使用 JSON 回退；
- observation 只在轨迹出现，搜索/筛选/检查器可用；
- 对话框焦点、Escape、ARIA 和键盘操作；
- 不溢出与真实溢出的两种节点轨道行为。

完整浏览器验收必须在 DSH 原生侧栏存在的桌面页面中进行，并缩窄窗口复核响应式行为。视觉问题要补行为或几何回归测试；不能只看截图或 CSS 数值。

## 6. 完成检查

- 未导入 Backend 私有源码、Host-only 模块或具体 Workflow；
- 没有状态写入、业务特例或重复状态机；
- 新 renderer 有公开字段语义、未知结构回退和跨 Workflow fixture；
- locale、slot、timer/listener disposer 和构建 external 同步；
- `docs/architecture.md`、统一页面契约与 README 中受影响内容已刷新；
- Platform 测试、全量测试、typecheck、build 和完整浏览器验收通过。

