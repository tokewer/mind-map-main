// 当前打开的「本地磁盘文件」句柄共享模块。
// 背景：Toolbar.vue 用模块级 fileHandle 保存用户通过「打开本地文件 / 另存为」拿到的
// FileSystemFileHandle；而复习归属（getCurrentMapIdentity）需要知道这张本地文件叫什么，
// 才能把复习记录与浏览器内置文件、其他本地文件区分开。
// 为避免 api/index.js ←→ Toolbar.vue 的直接依赖，句柄通过本模块单向共享：
// Toolbar 写入，api 读取。
let localFileHandle = null

export const setLocalFileHandle = handle => {
  localFileHandle = handle || null
}

export const getLocalFileHandle = () => localFileHandle

export const getLocalFileName = () => {
  return localFileHandle && localFileHandle.name ? localFileHandle.name : ''
}
