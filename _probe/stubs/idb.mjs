// 探针用 directoryIndexedDB 桩（内存版），避免依赖真实 IndexedDB
let handle = null
let meta = null
export const saveDirectoryHandle = async h => {
  handle = h
}
export const getDirectoryHandle = async () => handle
export const clearDirectoryHandle = async () => {
  handle = null
}
export const saveWorkspaceMeta = async m => {
  meta = m
}
export const getWorkspaceMeta = async () => meta
export const clearWorkspaceMeta = async () => {
  meta = null
}
