# 项目工程规范与准则 (mind-map-main)

本文件定义了针对 `tokewer/mind-map-main` 项目的强制开发与运维规则，所有智能助理必须严格遵守：

## 1. 强制版本号更新 (Semantic Versioning)
- **每次更新代码必须同步更新版本号**：
  - `web/package.json` 中的 `"version"`（补丁修复 +0.0.1，功能新增 +0.1.0）；
  - `CHANGELOG.md` 顶部记录版本号与详细更新项；
  - `server.py` 中的 `VERSION` 变量；
  - 前端界面相关展示处（如复习中心顶部）。
- 严禁在修改代码后不升级版本号。

## 2. 启动服务与兼容保障
- 启动脚本必须保证双模无缝运行：
  1. 「学习工具中心」管理器正在运行时优先委托其管理并打开 `http://127.0.0.2:8080`；若管理器中缺少应用，必须自动注册自愈；
  2. 独立运行模式下，若 `8080` 端口被占用，必须自动探测并切换至可用空闲端口（如 `8081`），严禁死锁报错退出。

## 3. GitHub 自动化同步与推送
- 提交前必须保证代码通过单元测试与前端构建（`$env:NODE_OPTIONS="--openssl-legacy-provider"; npm run build`）。
- 推送至 GitHub 前必须先执行 `git pull --rebase origin master` 规避 non-fast-forward 冲突。
- 自动化同步脚本必须具备网络重试与清晰的排错指引。
