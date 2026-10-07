# 复习思维导图 (Mind Map Review)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen)](https://tokewer.github.io/mind-map-main/)

一款专注于**知识体系整理与艾宾浩斯间隔复习**的现代化 Web 思维导图应用。支持思维导图多模式编辑、艾宾浩斯复习调度、掌握度自动追踪、复习卡片、工作区跨端导入导出以及本地文件夹离线持久化。

---

## 🌟 在线演示

- **GitHub Pages 演示站点**：[https://tokewer.github.io/mind-map-main/](https://tokewer.github.io/mind-map-main/)
- 打开即可直接在浏览器内创建导图并添加复习节点，数据自动保存在本地浏览器 `localStorage` 中。

---

## 🚀 核心特性

### 1. 结构化思维导图
- **丰富布局结构**：支持逻辑结构图、思维导图、组织结构图、目录组织图、鱼骨图、时间轴等多种布局形式。
- **节点内容丰富**：节点支持富文本、数学公式（KaTeX）、图片、标签、超链接、备注、图标、概括节点及关联线。
- **个性化样式**：内置数十种经典主题配色，支持自定义背景、连接线样式、边框、彩虹分支及手绘风格。

### 2. 艾宾浩斯间隔复习系统
- **记忆周期算法**：内置艾宾浩斯标准周期、密集攻坚、宽松维护及自定义复习周期（如 `1d-2d-4d-7d-15d`）。
- **掌握度追踪与动态分级**：根据复习连续正确/模糊/遗忘反馈，动态推导掌握状态（未学习、学习中、基本掌握、容易遗忘、熟练）。
- **到期复习与看板**：提供今日待复习列表、近期到期提醒、薄弱节点专栏，以及全局复习悬浮窗。
- **复习卡片与抽认卡**：节点可挂载问答卡片（Q&A、填空、判断），支持 Markdown 格式卡片批量导入导出。
- **复习操作快捷键化**：支持自定义复习快捷键（加入/移出复习默认 `Alt + R`、复习详情 `Alt + Shift + R`、标记重点 `Alt + F`、三档快速评价 `Alt + 1/2/3`），支持多键组合自由录制。

### 3. 多种运行模式与 GitHub 自动同步
- **纯前端静态模式（如 GitHub Pages）**：无需任何后端依赖，自动优雅降级为浏览器 `localStorage` 缓存运行，随时可导出 `.smmw.json` 工作区文件或各类图片、文档。
- **工作目录本地模式（File System Access API）**：直接选择本地工作文件夹，导图与复习记录（`review.json`）保存在同一目录，免除服务端搭建与数据丢失困扰。
- **GitHub 自动上传与云端备份（双轨支持）**：
  - **本地开发一键自动推送**：双击 `auto-sync.bat` 或运行 `npm run push`，自动暂存所有代码与文件变更、生成带时间戳提交并推送到 GitHub 远程仓库，自动触发 GitHub Pages 构建。
  - **网页端自动同步仓库**：在网页【设置】面板填入 GitHub Personal Access Token 与仓库名，每次在浏览器中编辑思维导图或更新复习数据时，后台静默防抖自动提交保存至 GitHub 仓库。
- **本地服务模式（Python HTTP 服务）**：通过项目内置的轻量级 `server.py`，数据自动防抖落盘保存至本地 `data/store/*.json`。

### 4. 数据安全与隐私保护
- **数据完全本地化**：所有导图数据、复习记录、图片默认保留在用户本地机器或浏览器中，不经由任何未经配置的第三方云端。
- **工作区备份与迁移**：支持导出可迁移的 `.smmw.json` 完整工作区文件，实现不同设备与浏览器间的无缝同步。

---

## 🖼️ 界面预览

![思维导图界面](./assets/preview.png)

![艾宾浩斯复习中心](./assets/review.png)

---

## 🛠️ 技术栈

- **前端框架**：[Vue.js 2.6](https://vuejs.org/) + [Vue Router 3.5](https://router.vuejs.org/) + [Vuex 3.6](https://vuex.vuejs.org/)
- **UI 组件库**：[Element-UI 2.15](https://element.eleme.cn/)
- **图形渲染内核**：`simple-mind-map`（SVG 渲染引擎与节点排版）
- **富文本与数学公式**：[Quill](https://quilljs.com/) + [KaTeX](https://katex.org/)
- **构建工具**：`@vue/cli-service` (Webpack 4)
- **本地服务（可选）**：Python 3 轻量 HTTP 服务 (`server.py`)

---

## 💻 本地运行与安装

### 环境要求
- [Node.js](https://nodejs.org/) >= 16（推荐 Node.js 18 或 20）
- [Python](https://www.python.org/) 3.7+（仅本地文件持久化模式需要）

### 1. 本地启动服务（推荐）
通过本地 Python 服务启动，支持自动将导图持久化到本地文件夹：
```bash
# 方式一：直接运行一键脚本（Windows）
双击运行 "启动思绪思维导图.bat" 或在 PowerShell 中运行 .\launcher.ps1

# 方式二：手动运行 Python 静态服务
python server.py
# 浏览器访问 http://127.0.0.1:8080 即可
```

### 2. 前端开发与构建
```bash
# 进入前端工程目录
cd web

# 安装依赖
npm install

# 启动开发服务器（支持热更新）
npm run serve

# 生产环境打包构建
npm run build
```
> 注：在 Node.js 17+ 环境下构建 Webpack 4 项目时，若遇 OpenSSL 报错，请使用：
> - Windows PowerShell: `$env:NODE_OPTIONS="--openssl-legacy-provider"; npm run build`
> - Linux/macOS: `NODE_OPTIONS=--openssl-legacy-provider npm run build`

---

## 📦 GitHub Pages 部署说明

本项目支持自动化构建并部署到 GitHub Pages：

1. 仓库已配置 GitHub Actions 工作流 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)。
2. 推送至 `master` 分支时，Actions 会自动执行依赖安装、静态打包并发布至 GitHub Pages。
3. 部署后访问地址为：`https://<你的用户名>.github.io/<仓库名>/`。

---

## 🔒 隐私与数据存储说明

1. **个人数据保护**：`data/`（包含导图与复习记录）在 [`.gitignore`](./.gitignore) 中严格忽略，不会被提交至 Git 仓库。
2. **API 密钥安全**：如使用 AI 生成功能，配置的 API 密钥仅保存在用户本地浏览器内存与配置中，工作区导出时会自动脱敏剔除。

---

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request！在参与前请参阅：
- [CONTRIBUTING.md](./CONTRIBUTING.md) 了解代码提交规范
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) 开源行为准则
- [SECURITY.md](./SECURITY.md) 安全漏洞报告机制

---

## 📄 开源许可证与致谢

- 本项目遵循 **[MIT 许可证](./LICENSE)** 开源。
- 基础思维导图渲染引擎源自开源项目 `simple-mind-map`（Copyright (c) 2021-2023 The MindMap Team，遵循 MIT 协议）。
- 详细第三方版权声明与致谢请参见 **[NOTICE.md](./NOTICE.md)**。
