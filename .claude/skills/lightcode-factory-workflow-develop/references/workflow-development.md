# LightCode Factory 开发规范索引

本文件保留为旧链接兼容入口。规范覆盖 Workflow、Backend、Platform 三个可开发组件；Factory Bundle 仅负责安装装配。

按以下顺序使用：

1. [核心契约](core-contract.md)：三个组件的稳定边界、状态所有权和强制规则。
2. [仓库探索](repository-discovery.md)：从当前 checkout 获取接口、schema、构建和页面事实。
3. [组件选择](component-selection.md)：判断需求属于 Workflow、Backend、Platform 还是跨组件。
4. Workflow 路径：[设计门禁](design-template.md) -> [实现规范](workflow-implementation.md)。
5. Backend 路径：[底座变更设计](change-design.md) -> [Backend 开发规范](backend-development.md)。
6. Platform 路径：[底座变更设计](change-design.md) -> [Platform 开发规范](platform-development.md) -> [统一页面契约](platform-display-contract.md)。
7. [文档同步](documentation-sync.md)：代码、设计、架构、README 和 Skill 的刷新矩阵。
8. [测试与交付](testing-and-delivery.md)：分组件测试、Bundle、隔离安装和浏览器验收。

版本号、依赖版本、限制值、CSS 数值、响应式断点和当前 renderer 字段都必须从正在开发的仓库中读取。本索引不记录固定版本快照。
