# 本地持久化与复习视觉功能实施计划

> **For agentic workers:** 按任务逐项执行，每项都先建立可重复验证，再实施最小修复。步骤使用 checkbox 跟踪。

**Goal:** 修复图片和存储接口、离线/删除同步、掌握度展示与发光设置，并完成构建和真实 HTTP 验证。

**Architecture:** 保留 Python `http.server` 与 localStorage 主流程；后端提供严格、原子、可报告失败的文件 API，前端用单一同步状态机将受管理键落盘。复习视觉效果全部作用于 SVG 展示层，配置复用现有 Vuex 本地配置。

**Tech Stack:** Python 标准库、Vue 2、Vuex 3、Element UI、simple-mind-map 0.14.0-fix.3、ESLint、Vue CLI 4。

**Spec:** `docs/superpowers/specs/2026-08-28-local-persistence-review-visuals-design.md`

## Global Constraints

- 不新增第三方依赖。
- 后端继续使用 Python 标准库 `http.server`。
- 不修改或删除用户现有数据；测试使用临时目录与临时端口。
- 掌握度颜色不得写入节点数据或撤销历史。
- 项目不是 Git 仓库，不执行提交步骤。

---

### Task 1: 后端文件 API

**Files:**
- Modify: `server.py`
- Create: `tests/test_server.py`

**Interfaces:**
- Consumes: `POST /api/image` JSON `{name, data}`；`POST /api/storage` JSON `{keys, remove}`。
- Produces: `_atomic_write(path, data_bytes)`；成功响应 `{ok: true}`；验证失败 400/413；I/O 失败 500。

- [x] 用临时目录测试图片上传、严格校验、存储写删和唯一临时文件。
- [x] 运行 `uv run python -m unittest tests.test_server -v`，确认旧实现至少在 `/api/image` 路由和冲突语义测试失败。
- [x] 增加请求体上限、完整类型验证、MIME/扩展名一致性、唯一临时文件与存储锁。
- [x] 让精确路径 `/api/image` 和 `/api/image/` 共用图片保存逻辑。
- [x] 重跑后端单元测试并确认通过。

### Task 2: 同步状态机与工作区导入

**Files:**
- Modify: `web/src/api/serverStorage.js`
- Modify: `web/src/api/workspace.js`
- Modify: `web/src/api/index.js`
- Modify: `web/src/pages/Edit/components/ReviewFloat.vue`

**Interfaces:**
- Consumes: localStorage 受管理键、服务器 `{keys}` 和 `{ok}` 响应。
- Produces: `markKeyRemoved(key)`、`scheduleServerAutoSave(delay)`、返回 Promise 的 `flushServerSave()`。

- [x] 修复 remove 集合，使本轮现存键永不同时删除。
- [x] 在服务恢复时先补做失败的首次磁盘拉取，再推送本地状态。
- [x] 工作区导入标记导入后消失的键并触发立即保存。
- [x] 历史版本和浮窗配置变化统一发送工作区变化事件。
- [x] 仅在服务器明确返回 `ok: true` 时提交前端同步状态。

### Task 3: 掌握度展示层颜色

**Files:**
- Modify: `web/src/pages/Edit/components/ReviewColorToggle.vue`

**Interfaces:**
- Consumes: `getNodeList()`、`getMasteryColors()`、节点 `group`。
- Produces: `.smm-node-mastery-color` class 与 `--smm-mastery-fill`、`--smm-mastery-text` CSS 变量。

- [x] 将 `node.setStyles()` 替换为 SVG group class/CSS 变量。
- [x] 清除逻辑只移除本功能的 class 和变量。
- [x] 监听 `node_tree_render_end` 和掌握度颜色配置变化，确保重绘后恢复展示。
- [x] 用 ESLint 验证 Vue 语法，不触发数据保存事件。

### Task 4: 发光设置闭环

**Files:**
- Modify: `web/src/store.js`
- Modify: `web/src/pages/Review/Index.vue`
- Modify: `web/src/pages/Edit/components/ReviewGlowSync.vue`

**Interfaces:**
- Consumes: `state.localConfig.reviewGlow`。
- Produces: `review_glow_config_change` 事件；SVG group 上的发光 class 和 CSS 变量。

- [x] 在 Vuex 默认本地配置中增加 `reviewGlow` 默认值。
- [x] 在复习设置页加入开关、颜色选择、强度和速度控件。
- [x] 每次设置变化归一化后调用 `setLocalConfig({reviewGlow})` 并发送事件。
- [x] 删除无效的动态 `<style>` 绑定，改用静态关键帧和 group CSS 变量。
- [x] 用 ESLint 和生产构建验证模板、样式和状态访问。

### Task 5: 综合验证

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-local-persistence-review-visuals-design.md`（仅在实现与规格有偏差时）
- Modify: `docs/superpowers/plans/2026-08-28-local-persistence-review-visuals.md`（勾选结果）

**Interfaces:**
- Consumes: Task 1-4 全部实现。
- Produces: 可重复的测试和构建结果。

- [x] 运行 `uv run python -m unittest tests.test_server -v`。
- [x] 运行 `npm --prefix web run lint`。
- [x] 运行 `NODE_OPTIONS=--openssl-legacy-provider npm --prefix web run build`。
- [x] 在临时数据目录启动服务器并执行真实 HTTP 图片与存储冒烟测试。
- [x] 检查生产构建产物不含错误路径 `/apiimage`。
- [x] 记录任何环境限制或仍需浏览器手工确认的视觉行为。
