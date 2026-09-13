# 数据可靠性探针（_probe）

针对「偶尔莫名读取到老版本数据」的回归验证。用 esbuild 把 **真实生产源码**
（`web/src/api/*.js`、`web/src/pages/Edit/components/{Edit,FileBar,Toolbar,ReviewFloat}.vue`、
`web/src/store.js`）打进一个可在 Node 中运行的 bundle，只替换浏览器 API
（File System Access、localStorage、fetch/XHR、element-ui、simple-mind-map）。

因此这些测试跑的是真实代码路径与真实异步时序，而不是复刻的逻辑。

## 用法

```bash
cd _probe
node build.mjs            # 生成 bundle.mjs（每次改完源码都要重新生成）
node t1-directory.mjs     # 工作目录模式
node t2-local-browser.mjs # 本地磁盘文件 + 浏览器存储
node t3-more.mjs          # 遮罩泄漏 / 防抖窗口内旧读取 / 待写任务归属
node t4-lifecycle.mjs     # 多次保存·关闭·重新打开·刷新（多轮循环）
node t5-mirror.mjs        # 磁盘镜像回灌不得覆盖本地新数据
```

每个脚本独立运行，退出码非 0 表示有用例失败。

## 覆盖的缺陷（均为真实复现后修复）

| 用例 | 缺陷 |
| --- | --- |
| T1 | 编辑后切文件，前一张图的待写数据被新文件的立即保存丢弃 → 切回来是旧版本 |
| T2 | 目录模式防抖窗口内刷新页面 → 磁盘停在上一版 |
| T3 | 目录模式待写数据未绑定文件名，定时器触发时写进「当时」的文件 |
| T4 | 启动恢复不得用占位内容覆盖本地正文 |
| T5 | 本地文件切换：编辑未落盘就换句柄 → 内容丢失 |
| T6 | 本地文件防抖窗口内刷新 → 磁盘停在上一版 |
| T7 | 浏览器存储 500ms 节流窗口内刷新 → localStorage 停在上一版 |
| T8 | 启动回灌不得让磁盘旧内容覆盖本地新内容 |
| T9 | 连续多次 setData 后 loading 遮罩不得残留 |
| T10 | 防抖窗口内 `readFileData` 不得读到旧版本 |
| T11 | 本地文件防抖不得把 A 的内容写进 B |
| T12 | 浏览器待写任务应写回原文件而非新文件 |
| T13 | 服务恢复回灌时磁盘旧内容不得覆盖浏览器新内容 |
| T14 | 本次会话已编辑时不得被磁盘内容回退 |
| T15/T16 | 保持既有能力：全新浏览器/键缺失时仍从磁盘回填 |
| L1 | 工作目录模式 20 轮「编辑→刷新→重开」始终读到最新 |
| L2 | 工作目录模式来回切换 10 轮，两张图各自保留最新内容 |
| L3 | 浏览器模式 20 轮编辑+刷新始终读到最新 |
| L4 | 本地磁盘文件 10 轮切换后重开始终读到最新 |
| L5 | 遮罩开启/关闭次数配平 |

## 目录结构

- `build.mjs` — 打包 + 别名替换（唯一需要按需调整的文件）
- `entry.js` — 导出待测的真实模块
- `harness.mjs` — 全局环境桩（含「服务中途恢复」模拟）
- `vm.mjs` — 极简 Vue 实例 shim，用于驱动真实组件的 methods / 生命周期
- `stubs/` — 浏览器 API 与第三方库的替身；`fakeFs.mjs` 是可注入延迟的假文件系统
- `bundle.mjs` — 生成物，勿手改
