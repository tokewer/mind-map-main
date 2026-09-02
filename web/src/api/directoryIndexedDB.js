// 工作目录模式的轻量元数据持久化（IndexedDB）
// 只存 DirectoryHandle / 当前打开文件 / 工作目录名等轻量数据，
// 绝不保存完整思维导图正文（正文唯一数据源是本地 .smm 文件）。
// 使用 IndexedDB 而非 localStorage，避免挤占 localStorage 配额。
const DB_NAME = 'smm-directory-mode'
const DB_VERSION = 1
const HANDLES_STORE = 'handles'
const META_STORE = 'meta'

let dbPromise = null

const openDB = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE)
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

const idbGet = (store, key) =>
  openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )

const idbSet = (store, key, value) =>
  openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )

const idbDelete = (store, key) =>
  openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )

// ---------- DirectoryHandle ----------

export const saveDirectoryHandle = handle =>
  idbSet(HANDLES_STORE, 'directoryHandle', handle)

export const getDirectoryHandle = () =>
  idbGet(HANDLES_STORE, 'directoryHandle').catch(() => null)

export const clearDirectoryHandle = () =>
  idbDelete(HANDLES_STORE, 'directoryHandle').catch(() => {})

// ---------- 工作区元数据 ----------

export const saveWorkspaceMeta = meta =>
  idbSet(META_STORE, 'workspace', meta).catch(() => {})

export const getWorkspaceMeta = () =>
  idbGet(META_STORE, 'workspace').catch(() => null)

export const clearWorkspaceMeta = () =>
  idbDelete(META_STORE, 'workspace').catch(() => {})
