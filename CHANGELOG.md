# Changelog (更新日志)

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 规范。

## [Unreleased]

### Added
- 完整规范开源项目主页与结构，集成 GitHub Actions 自动化部署至 GitHub Pages。
- 完善 `LICENSE`、`NOTICE.md`、`CONTRIBUTING.md`、`SECURITY.md` 与 Issue/PR 模板。
- 支持纯静态 GitHub Pages 模式与本地 Python 服务双模式透明兼容运行。

### Changed
- 清理上游旧项目商业推广与失效外链，界面导航及反馈入口统一指向当前仓库。
- 优化工作区与多文件存储导入导出体验。

## [1.0.0] - 2026-09-25

### Added
- **艾宾浩斯复习系统**：
  - 节点加入复习并支持艾宾浩斯标准、密集、宽松及自定义周期配置。
  - 掌握度动态推导（学习中、基本掌握、容易遗忘、熟练）。
  - 今日待复习、近期到期提醒、薄弱节点专栏与全局悬浮看板。
  - 节点挂载复习卡片（Q&A、填空、判断）及 Markdown 批量导入导出。
- **本地文件夹持久化**：
  - 本地 Python HTTP 服务 (`server.py`) 自动双向同步 `data/store/*.json`。
  - 节点图片从 base64 自动提取并以哈希文件保存至 `data/images/`。
- **跨浏览器工作区迁移**：
  - 完整工作区文件 (`.smmw.json`) 导出与校验导入。
