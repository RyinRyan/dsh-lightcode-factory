# Workflow 开发规范索引

本文件保留为旧链接兼容入口。规范已按开发阶段拆分，避免单篇长文混合稳定契约与易变化实现细节。

按以下顺序使用：

1. [核心契约](core-contract.md)：底座与 Workflow 的稳定边界、强制规则和任务分类。
2. [仓库探索](repository-discovery.md)：从当前 checkout 获取版本、接口、构建和页面能力。
3. [设计门禁](design-template.md)：生成 `.design/workflows/<workflow-id>.md` 并完成设计自检。
4. [Workflow 实现规范](workflow-implementation.md)：插件结构、注册、节点、输出、观测、安全和生命周期。
5. [统一页面契约](platform-display-contract.md)：如何让任意 Workflow 正确复用统一运行页和轨迹页。
6. [测试与交付](testing-and-delivery.md)：测试矩阵、Bundle 接线、打包、隔离安装和浏览器验收。

版本号、依赖版本、限制值、CSS 数值、响应式断点和当前 renderer 字段都必须从正在开发的仓库中读取。本索引不记录固定版本快照。
