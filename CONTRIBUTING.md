# Contributing to Mind Map Review (贡献指南)

感谢你对复习思维导图项目的关注！我们欢迎社区提交 Issue 和 Pull Request 来帮助完善项目。

---

## 🧭 开发环境与准备工作

1. **环境要求**：
   - Node.js >= 16 (建议 Node.js 18 或 20 LTS)
   - npm >= 8
   - Python 3.7+（仅测试本地数据落盘服务时需要）

2. **本地安装与运行**：
   ```bash
   # 克隆仓库
   git clone https://github.com/tokewer/mind-map-main.git
   cd mind-map-main/web

   # 安装前端依赖
   npm install

   # 启动前端开发调试服务
   npm run serve
   ```

3. **代码风格与规范**：
   - 遵循 ESLint 与 Vue 官方推荐代码风格。
   - 提交前请运行格式化与检查：
     ```bash
     npm run lint
     ```

---

## 📝 提交规范

### 分支管理
- 建议从 `master` 分支切出功能分支进行开发，如 `feature/xxx` 或 `fix/xxx`。

### Commit 信息格式
推荐使用 Conventional Commits 格式：
- `feat: 增加xxx新功能`
- `fix: 修复xxx问题`
- `docs: 更新文档`
- `style: 样式调整`
- `refactor: 重构某部分逻辑`
- `test: 增加或修改测试`

---

## 🛡️ 数据与隐私准则

- **严禁提交个人复习数据**：任何包含个人学习记录、真实笔记、私人图片或私有配置的文件均不得提交至 Git。
- 请确保本地调试产生的数据文件（`data/`）处于 `.gitignore` 规则之下。
