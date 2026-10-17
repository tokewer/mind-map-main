---
name: review-mindmap-workflow
description: >-
  复习思维导图 (mind-map-main) 项目的开发、版本管理、启动运维与 GitHub 自动化同步规范。
  在修改该项目任何功能、修复缺陷或准备推送提交时必须遵守此技能指南。
---

# 复习思维导图项目工程与维护工作流规范

本项目为 `tokewer/mind-map-main`（基于 Web 与本地 Python 存储的复习思维导图系统）。为确保系统长期稳定、多端协同无误，所有智能助手及开发者必须严格遵循以下规范：

---

## 1. 每次更新必须升级版本号（强制）

任何功能新增、逻辑修复、样式调整或依赖变动，**严禁使用旧版本号直接发布**。提交和同步前必须同步更新以下位置：

1. **`web/package.json`**：
   - 递增 `"version"` 字段（遵循语义化版本号 SemVer 规范）：
     - 补丁修复（Bug Fix）：`1.1.0` -> `1.1.1`
     - 功能特性（Feature）：`1.1.1` -> `1.2.0`
     - 架构重构（Major）：`1.x.x` -> `2.0.0`
2. **`CHANGELOG.md`**：
   - 在顶部添加对应版本号与当前日期的条目（格式：`## [x.y.z] - YYYY-MM-DD`）。
   - 详细列明 `Added`、`Changed`、`Fixed` 等修改清单。
3. **`server.py`**：
   - 保持 `VERSION = 'x.y.z'` 与 `package.json` 一致，服务启动时打印该版本。
4. **前端界面展示**：
   - 复习中心顶部及相关页面同步展示最新版本 Tag。

---

## 2. 启动与端口兼容规范（双模自愈）

项目提供统一启动脚本 `启动思绪思维导图.bat`（调用 `launcher.ps1`），支持两种运行模式：

1. **「学习工具中心」统一托管模式（首选）**：
   - 管理器运行在 `127.0.0.1:8080`，思维导图映射到统一入口 `127.0.0.2:8080`（内部上游端口为 `8081`）。
   - 启动器必须具备**自愈能力**：若管理器返回 `找不到应用：mindmap`，启动器必须自动调用 `POST /api/apps` 将思维导图注册至管理器并自动激活，严禁抛错退出。
2. **本地独立运行模式（兜底）**：
   - 若管理器未运行，直接运行 `python server.py`。
   - **智能端口避让**：默认端口为 `8080`；若 `8080` 端口被其他进程占用，启动器必须自动扫描可用空闲端口（例如 `8081`、`8082`），以 `python server.py --port=<PORT>` 启动，并打开浏览器对应的端口地址。
   - 严禁因端口占用直接死锁退出。

---

## 3. GitHub 自动化同步与推送规范

项目集成了一键同步脚本 `auto-sync.bat`（调用 `scripts/auto-sync-github.mjs`）以及实时变动监听脚本 `watch-sync.bat`（调用 `scripts/watch-and-sync.mjs`）：

1. **版本自动递增**：
   - 执行同步时，脚本会自动检测文件变更，并自动递增 `package.json` 中的 patch 版本号。
2. **打包产物联动**：
   - 当检测到前端源码（`web/src/` 等）变动时，必须自动执行生产打包（`npm run build`），确保 `dist/` 目录产物与源码完全一致。
3. **推送前 Rebase 拉取**：
   - 推送至 GitHub 前必须先执行 `git pull --rebase origin master`，防止由于远程存在未合并提交导致 `non-fast-forward` 拒绝推送。
4. **网络容错与重试**：
   - 执行 GitHub 远程操作时必须配置网络重试机制（默认重试 3 次，带指数退避），并在失败时输出清晰的网络与凭证排查指引。

---

## 4. 前端工程构建与测试规范

1. **Webpack 与 OpenSSL 兼容性**：
   - 在 Node.js 18+ 环境下运行 Webpack 4 构建时，必须附加环境变量：
     ```powershell
     $env:NODE_OPTIONS="--openssl-legacy-provider"; npm run build
     ```
2. **单元测试验证**：
   - 根目录下使用 `bun test` 运行自动化测试套件（包括 `tests/frontend_storage.test.js` 和 `tests/review_quiz_and_shortcuts.test.js`）。
   - 修改复习逻辑、卡片流转、快捷键或存储合并规则后，必须确保所有测试用例 100% 通过。
