## [09:50] - 功能实现: 增加跨浏览器工作区保存与自动保存

- **文件**: web/src/api/workspace.js, web/src/api/workspaceEvents.js, web/src/api/index.js, web/src/review/index.js, web/src/review/trash.js, web/src/pages/Edit/components/FileBar.vue, web/src/pages/Edit/components/MasteryColorSettings.vue, web/src/pages/Review/Index.vue
- **决策**: 使用可迁移的 `.smmw.json` 完整工作区文件；覆盖导图多文件、历史版本、复习数据、回收站、配置和掌握度配色。AI 凭据不写入备份，导入时保留目标浏览器已有凭据。Chromium 授权选择文件后开启会话内 2 秒防抖自动保存；不支持 File System Access API 时退化为下载和文件选择导入。
- **验证**: 定向 ESLint 通过；`NODE_OPTIONS=--openssl-legacy-provider npm.cmd run build` 退出码 0；本地 `http://127.0.0.1:8080` HTTP 200。完整项目 lint 仍有原有遗留问题，未作为本次改动失败依据。
