## [09:15] - 功能实现: 完成复习增强功能

- **文件**: web/src/review/index.js; web/src/pages/Edit/components/ReviewDialog.vue; web/src/pages/Edit/components/Contextmenu.vue; web/src/pages/Edit/components/ReviewGlowSync.vue; web/src/pages/Edit/components/FileBar.vue; web/src/pages/Edit/components/ReviewFloat.vue; simple-mind-map/src/constants/constant.js
- **决策**: 重点节点使用 localStorage 复习记录中的 isFocus 字段；未加入复习的节点标记重点时自动建立复习记录；复习页使用 router.resolve + window.open 新窗口打开。
- **验证**: NODE_OPTIONS=--openssl-legacy-provider npm.cmd run build，退出码 0；仅有 Browserslist 过期和资源体积警告。
