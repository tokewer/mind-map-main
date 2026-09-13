// 本地文件夹存储层：通过 server.py 的 /api 接口把数据持久化到磁盘 data/ 目录。
// 这是「以本地文件夹储存为主」的核心实现：
//   - 每次数据变更（导图/复习/回收站/设置）后，防抖 2 秒自动全量保存到磁盘。
//   - 节点图片从 base64 中提取，存为 data/images/ 下的真实图片文件，突破 localStorage 10MB 限制。
//   - 启动时若 localStorage 为空，从磁盘回填；浏览器清缓存也不丢数据。
//   - 30 秒周期：探测服务是否恢复，恢复后立即把离线期间累积的改动回写磁盘，
//     同时把「本地已删除但磁盘还残留」的孤儿键清掉（删除同步）。
// 服务器不可用时（例如直接用 file:// 打开 index.html），自动降级为纯 localStorage，不报错。

import { mergeFileLists } from './storageMerge'

const API_BASE = '/api'

// 与 workspace.js 保持一致的数据键集合
const EXACT_KEYS = [
  'SIMPLE_MIND_MAP_FILE_LIST',
  'SIMPLE_MIND_MAP_CURRENT_FILE',
  'SIMPLE_MIND_MAP_CONFIG',
  'SIMPLE_MIND_MAP_LANG',
  'SIMPLE_MIND_MAP_LOCAL_CONFIG',
  'MIND_MAP_REVIEW_DATA',
  'MIND_MAP_TRASH',
  'MIND_MAP_MASTERY_COLORS',
  'MIND_MAP_REVIEW_FLOAT_CONFIG'
]
const PREFIXES = ['SIMPLE_MIND_MAP_FILE_', 'SIMPLE_MIND_MAP_HISTORY_']

const BASE64_IMG_RE = /^data:image\/([A-Za-z0-9.+-]+);base64,/

// 周期同步间隔（毫秒）：服务离线时用它探测恢复并回写
const SYNC_INTERVAL = 30000
const TOMBSTONE_KEY = 'SIMPLE_MIND_MAP_SERVER_TOMBSTONES'

let serverAvailable = null // null=未探测，true/false=探测结果
let synced = false
let saveTimer = null
let saveBusy = false
let pendingAgain = false
let initialPullPending = false
let changedSinceInitialPull = false

// 本会话内被删除的键（跨会话记录的删除通过「磁盘有、本地无」的比对推导）
const locallyRemoved = new Set()
const bootstrapKeys = new Set()

// base64 -> 磁盘图片 url 缓存，避免同一张图重复上传
const imageCache = new Map()

// 磁盘上已知的键快照（用于周期同步时推导孤儿键），启动回填时更新
let diskKeySnapshot = new Set()

const extOf = mime => {
  const m = String(mime || '').toLowerCase().replace(/\+.*$/, '')
  if (m === 'jpeg') return 'jpg'
  if (m === 'svg') return 'svg'
  return m || 'png'
}

// 简单字符串哈希（djb2），让相同图片生成本地磁盘同名文件，避免重复
const hashString = str => {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('server error ' + res.status)
  const data = await res.json()
  if (!data || data.ok !== true) throw new Error('server rejected request')
  return data
}

// 探测本地服务器是否可用；打开为纯静态文件时不可用。
// 与早期实现不同：允许强制重新探测（isServerAvailable===false 后周期轮询会再次探测）。
export const probeServer = async (force = false) => {
  if (!force && serverAvailable !== null) return serverAvailable
  try {
    const res = await fetch(API_BASE + '/storage', { cache: 'no-store' })
    if (!res.ok) throw new Error('server error ' + res.status)
    serverAvailable = true
  } catch (e) {
    serverAvailable = false
  }
  return serverAvailable
}

export const isServerAvailable = () => serverAvailable === true

// 判断某 key 是否属于需要持久化的数据键
const isManagedKey = key =>
  EXACT_KEYS.includes(key) || PREFIXES.some(p => key.startsWith(p))

const persistTombstones = () => {
  try {
    if (locallyRemoved.size) {
      localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...locallyRemoved]))
    } else {
      localStorage.removeItem(TOMBSTONE_KEY)
    }
  } catch (e) {
    // localStorage 不可用时保留内存 tombstone，当前页面仍可继续同步。
  }
}

try {
  const savedTombstones = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '[]')
  if (Array.isArray(savedTombstones)) {
    savedTombstones.forEach(key => {
      if (typeof key === 'string' && isManagedKey(key)) locallyRemoved.add(key)
    })
  }
} catch (e) {
  // 损坏的内部标记不应阻止应用启动。
}

// 把磁盘镜像回填进 localStorage。
//
// 数据可靠性原则（对应本文件开头的说明）：回填只负责「补齐 localStorage 里没有的键」，
// 绝不覆盖已存在的本地值。原因是磁盘镜像可能落后于浏览器：
// 离线会话（server.py 未启动）期间的编辑只写进了 localStorage，磁盘还停在上一版；
// 若此时让磁盘值覆盖本地值，用户刚做的最新内容就会被旧内容顶掉，
// 表现为「重新打开后读到老版本数据」。本地值随后会由正常的保存流程写回磁盘。
//
// preferDisk 仅用于「离线启动时创建的占位键」清理：磁盘上并不存在这些键时删除它们，
// 避免刚清理完又冒出占位导图；它不再表示「可以用磁盘覆盖本地」。
const applyDiskKeys = (keys, preferDisk = false) => {
  const diskKeys = Object.keys(keys)
  diskKeySnapshot = new Set(diskKeys)
  try {
    if (preferDisk && diskKeys.length) {
      bootstrapKeys.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(keys, key)) {
          localStorage.removeItem(key)
        }
      })
    }
    diskKeys.forEach(key => {
      if (!isManagedKey(key) || locallyRemoved.has(key)) return
      const localValue = localStorage.getItem(key)
      if (key === 'SIMPLE_MIND_MAP_FILE_LIST' && localValue !== null) {
        // 文件清单两侧合并（磁盘与本地各自可能新增过文件），并剔除已删除的
        const removedFileIds = [...locallyRemoved]
          .filter(item => item !== 'SIMPLE_MIND_MAP_FILE_LIST' && item.startsWith('SIMPLE_MIND_MAP_FILE_'))
          .map(item => item.slice('SIMPLE_MIND_MAP_FILE_'.length))
        localStorage.setItem(key, mergeFileLists(keys[key], localValue, removedFileIds))
      } else if (localValue === null) {
        localStorage.setItem(key, keys[key])
      }
    })
  } catch (e) {
    throw new Error('磁盘数据回填 localStorage 失败')
  }
  bootstrapKeys.clear()
}

const pullFromServer = async (preferDisk = false) => {
  const res = await fetch(API_BASE + '/storage', { cache: 'no-store' })
  if (!res.ok) throw new Error('server error ' + res.status)
  const data = await res.json()
  const keys = data && data.keys && typeof data.keys === 'object' ? data.keys : {}
  applyDiskKeys(keys, preferDisk)
  serverAvailable = true
  initialPullPending = false
}

// 启动时同步从磁盘回填 localStorage（同步 XHR，确保先于导图初始化完成）
export const syncFromDiskOnce = () => {
  if (synced) return serverAvailable === true
  synced = true
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', API_BASE + '/storage', false)
    xhr.send(null)
    if (xhr.status !== 200) throw new Error('server error ' + xhr.status)
    const data = JSON.parse(xhr.responseText)
    const keys = data && data.keys && typeof data.keys === 'object' ? data.keys : {}
    applyDiskKeys(keys)
    serverAvailable = true
    initialPullPending = false
  } catch (e) {
    serverAvailable = false
    initialPullPending = true
  } finally {
    // 无论是否成功，启动 30 秒周期同步；它随时能把离线改动/删除同步回去
    startPeriodicSync()
  }
  return serverAvailable === true
}

// 读取当前 localStorage 中需要持久化的键值（值为字符串）
const collectLocalStorage = () => {
  const keys = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (isManagedKey(key)) {
      const v = localStorage.getItem(key)
      if (v !== null) keys[key] = v
    }
  }
  return keys
}

// 计算需要从磁盘删除的孤儿键：
// 1. 本会话显式删除过的键；
// 2. 磁盘快照里有、但当前 localStorage 里已不存在的受管理键。
const collectRemovalKeys = keys => {
  const remove = new Set(locallyRemoved)
  diskKeySnapshot.forEach(key => {
    if (isManagedKey(key) && localStorage.getItem(key) === null) {
      remove.add(key)
    }
  })
  return [...remove].filter(key => {
    return localStorage.getItem(key) === null && !Object.prototype.hasOwnProperty.call(keys, key)
  })
}

const uploadImage = async (name, dataURL) => {
  const data = await postJson(API_BASE + '/image', { name, data: dataURL })
  return data.url || ('/api/image/' + name)
}

// 从键值对象中提取 base64 图片，上传到磁盘并替换为 url 引用
const extractImages = async keys => {
  const set = new Set()
  const walkCollect = v => {
    if (typeof v === 'string') {
      if (v.length > 1024 && BASE64_IMG_RE.test(v)) set.add(v)
    } else if (Array.isArray(v)) {
      v.forEach(walkCollect)
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walkCollect)
    }
  }
  Object.keys(keys).forEach(key => {
    try {
      walkCollect(JSON.parse(keys[key]))
    } catch (e) {
      // 非 JSON 值（如纯字符串）无需处理
    }
  })

  const needUpload = [...set].filter(s => !imageCache.has(s))
  if (needUpload.length) {
    await Promise.all(
      needUpload.map(async b64 => {
        const m = b64.match(BASE64_IMG_RE)
        const ext = extOf(m ? m[1] : 'png')
        const name = 'img_' + ext + '_' + hashString(b64) + '.' + ext
        try {
          const url = await uploadImage(name, b64)
          imageCache.set(b64, url)
        } catch (e) {
          // 单个图片上传失败不阻塞整体保存，保留 base64
        }
      })
    )
  }

  if (!imageCache.size) return keys

  const walkReplace = v => {
    if (typeof v === 'string') {
      return imageCache.has(v) ? imageCache.get(v) : v
    }
    if (Array.isArray(v)) {
      return v.map(walkReplace)
    }
    if (v && typeof v === 'object') {
      const o = {}
      Object.keys(v).forEach(k => {
        o[k] = walkReplace(v[k])
      })
      return o
    }
    return v
  }
  const out = {}
  Object.keys(keys).forEach(key => {
    try {
      out[key] = JSON.stringify(walkReplace(JSON.parse(keys[key])))
    } catch (e) {
      out[key] = keys[key]
    }
  })
  return out
}

// 全量保存：写当前 localStorage 的数据，删除磁盘孤儿键。
const doServerSave = async () => {
  const keys = collectLocalStorage()
  Object.keys(keys).forEach(key => locallyRemoved.delete(key))
  persistTombstones()
  const remove = collectRemovalKeys(keys)
  // 没有任何键，也没有要删的键，跳过
  if (!Object.keys(keys).length && remove.length === 0) return

  let out = keys
  if (Object.keys(keys).length) {
    out = await extractImages(keys)
  }
  await postJson(API_BASE + '/storage', { keys: out, remove })

  // 成功：更新磁盘键快照为「本地现存键」集合
  const liveKeys = new Set(Object.keys(keys))
  remove.forEach(k => diskKeySnapshot.delete(k))
  diskKeySnapshot = new Set([...diskKeySnapshot, ...liveKeys])
  // 只清除本轮已同步的删除记录，保存期间新产生的删除仍留待下一轮。
  remove.forEach(key => locallyRemoved.delete(key))
  persistTombstones()
  serverAvailable = true
  changedSinceInitialPull = false
}

// 记录一个被删除的受管理键，供下次同步时告知后端删除磁盘文件
export const markKeyRemoved = key => {
  if (typeof key === 'string' && isManagedKey(key)) {
    locallyRemoved.add(key)
    persistTombstones()
    scheduleServerAutoSave()
  }
}

// 标记离线启动时为保证界面可用而创建的默认键；恢复拉取磁盘后可安全移除孤儿默认数据。
export const markBootstrapKey = key => {
  if (initialPullPending && typeof key === 'string' && isManagedKey(key)) {
    bootstrapKeys.add(key)
  }
}

const prepareServerSave = async () => {
  if (initialPullPending) {
    await pullFromServer(!changedSinceInitialPull)
  }
  await doServerSave()
}

// 防抖自动保存到磁盘
export const scheduleServerAutoSave = (delay = 2000) => {
  if (initialPullPending) changedSinceInitialPull = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (saveBusy) {
      pendingAgain = true
      return
    }
    saveBusy = true
    try {
      await prepareServerSave()
    } catch (e) {
      serverAvailable = false
      // 失败静默：localStorage 仍在工作，30 秒周期同步会重试
    } finally {
      saveBusy = false
      if (pendingAgain) {
        pendingAgain = false
        scheduleServerAutoSave(delay)
      }
    }
  }, delay)
}

// 周期同步：探测服务是否恢复；恢复后把本地改动/删除回写磁盘。
// 服务一直可用时它也起到「兜底全量同步」作用（覆盖任何被遗漏的变更）。
const periodicSync = async () => {
  // 服务此前不可用（或未探测成功）时，先强制重探测
  if (serverAvailable !== true) {
    const ok = await probeServer(true)
    if (!ok) return // 仍离线，等待下一轮
  }
  if (saveBusy) return // 正在保存则让位
  saveBusy = true
  try {
    await prepareServerSave()
  } catch (e) {
    serverAvailable = false
  } finally {
    saveBusy = false
  }
}

let periodicStarted = false
const startPeriodicSync = () => {
  if (periodicStarted) return
  periodicStarted = true
  setInterval(periodicSync, SYNC_INTERVAL)
}

// 立即执行一次同步；调用方可 await，但浏览器卸载本身仍不保证 fetch 完成。
export const flushServerSave = async () => {
  clearTimeout(saveTimer)
  saveTimer = null
  if (serverAvailable !== true || saveBusy) {
    if (saveBusy) pendingAgain = true
    return false
  }
  saveBusy = true
  try {
    await prepareServerSave()
    return true
  } catch (e) {
    serverAvailable = false
    return false
  } finally {
    saveBusy = false
    if (pendingAgain) {
      pendingAgain = false
      scheduleServerAutoSave(0)
    }
  }
}