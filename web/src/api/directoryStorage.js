// 工作目录存储层（StorageAdapter）
// 核心链路：Edit → StorageAdapter → File System Access API → 本地工作目录
//
// 目录结构（每个导图 = 工作目录 maps/ 下的一个文件夹）：
//   <工作目录>/
//   └─ maps/
//      ├─ <导图名>/                    # 一个导图 = 一个文件夹（文件夹名即导图名）
//      │  ├─ data.smm                  # 导图数据文件（固定名，正文唯一权威来源）
//      │  ├─ images/                   # 该导图的图片文件（正文只存相对路径引用）
//      │  └─ history/                  # 该导图的历史版本（每份一个独立 .smm.json 文件）
//      └─ ...
//
// 原则：
//   - 本地文件系统中的 .smm 是唯一权威数据源，不在 localStorage/IndexedDB 存正文副本。
//   - 图片外置到每张导图自己的 images/，.smm 内只存相对路径引用（root.data.imgMap 或富文本）。
//   - 历史版本以独立文件保存在每张导图自己的 history/ 下，互相独立、不随正文变化失效。
//   - 兼容旧布局：历史遗留的平铺 maps/*.smm（图片在目录根 images/）会被自动迁移进新布局。
//   - 与 server.py / localStorage 完全隔离：本模式不双写 server、不依赖 localStorage 恢复正文。
//   - 浏览器不支持 File System Access API 时，所有方法返回 { ok:false }，由上层降级。
import Vue from 'vue'
import {
  getDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
  getWorkspaceMeta,
  saveWorkspaceMeta
} from './directoryIndexedDB'

const MAPS_DIR = 'maps'
const IMAGES_DIR = 'images'
const HISTORY_DIR = 'history'
// 导图文件夹内数据文件固定名（重命名/移动/复制文件夹时无需同步改内层文件名）
const DATA_FILE = 'data.smm'
// 历史版本保留策略（与旧版 localStorage 历史一致）
const HISTORY_MAX_AUTO = 10
const HISTORY_MAX_TOTAL = 30

// 图片 URL -> 相对路径 反向映射（水合时建立，保存时还原），避免持久化 blob URL
const urlToPathMap = new Map()
// 相对路径 -> blob URL（当前会话已读取的图片）
const pathToUrlMap = new Map()

let directoryHandle = null
let directoryName = ''
// 当前导图的“文件夹名”（对外暴露时等价于旧的文件名：<name>.smm）
let currentFileName = ''

const isSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

const emitStatus = status => {
  if (Vue.prototype.$bus) Vue.prototype.$bus.$emit('directory_save_status', status)
}

const emitError = message => {
  if (Vue.prototype.$bus) Vue.prototype.$bus.$emit('directory_error', message)
}

const isAbortError = error => {
  const name = String(error && error.name || '').toLowerCase()
  const msg = String(error && error.message || '').toLowerCase()
  return name === 'aborterror' || msg.includes('abort')
}

// 保存队列：串行化写入，避免并发 createWritable 覆盖
let writeQueue = Promise.resolve()
const enqueueWrite = task => {
  const run = writeQueue.then(task)
  writeQueue = run.catch(() => {})
  return run
}

const revokeAllUrls = () => {
  urlToPathMap.forEach((path, url) => {
    try {
      URL.revokeObjectURL(url)
    } catch (e) {
      // 忽略
    }
  })
  urlToPathMap.clear()
  pathToUrlMap.clear()
}

// ---------- 目录 / 权限 ----------

const setDirectoryState = (handle, name) => {
  directoryHandle = handle
  directoryName = name
}

export const isDirectorySupported = isSupported

export const getDirectoryHandleValue = () => directoryHandle
export const getDirectoryNameValue = () => directoryName
// 返回当前导图标识（历史遗留命名为 <name>.smm，用于兼容 meta 与外部调用）
export const getCurrentFileName = () => currentFileName
export const setCurrentFileName = name => {
  currentFileName = name
}

// 让用户选择工作目录并持久化 handle
export const openDirectoryPicker = async () => {
  if (!isSupported()) {
    emitError('当前浏览器不支持 File System Access API，请使用最新版 Chrome / Edge')
    return { ok: false, unsupported: true }
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    setDirectoryState(handle, handle.name)
    await saveDirectoryHandle(handle)
    await saveWorkspaceMeta({ directoryName: handle.name })
    return { ok: true, name: handle.name }
  } catch (error) {
    if (isAbortError(error)) return { ok: false, cancelled: true }
    emitError('打开工作目录失败：' + (error.message || error))
    return { ok: false, error }
  }
}

// 是否已保存过工作目录句柄（用于“免重选、一键恢复上次目录”）
export const hasSavedDirectory = async () => {
  const handle = await getDirectoryHandle()
  return !!handle
}

// 从 IndexedDB 恢复工作目录 handle（刷新/重启后免重复授权）
export const restoreDirectory = async () => {
  const handle = await getDirectoryHandle()
  if (!handle) return { ok: false, noHandle: true }
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    const meta = await getWorkspaceMeta()
    if (meta && meta.currentFileName) currentFileName = meta.currentFileName
    if (permission !== 'granted') {
      // 目录句柄仍在，仅权限待重新授予：返回目录名，供 UI 用一次用户手势静默续权
      return { ok: false, needReauth: true, name: handle.name }
    }
    setDirectoryState(handle, handle.name)
    return { ok: true, name: handle.name, currentFileName }
  } catch (e) {
    return { ok: false, error: e }
  }
}

// 权限失效时重新请求授权（需在用户手势中调用，避免浏览器拦截静默续权）。
// 优先使用已保存的目录句柄，而不是让用户重新选择目录。
export const requestReauth = async () => {
  // 内存中没有句柄（如刷新后首次进入）时，从 IndexedDB 取出已保存的句柄
  let handle = directoryHandle || (await getDirectoryHandle())
  if (!handle) {
    return openDirectoryPicker()
  }
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return { ok: false, denied: true }
    setDirectoryState(handle, handle.name)
    const meta = await getWorkspaceMeta()
    if (meta && meta.currentFileName) currentFileName = meta.currentFileName
    return { ok: true, name: handle.name, currentFileName }
  } catch (e) {
    return { ok: false, error: e }
  }
}

// 退出工作目录模式（仅清运行时状态；handle 仍保留，重启可再次恢复）
export const leaveDirectoryMode = async () => {
  revokeAllUrls()
  setDirectoryState(null, '')
  currentFileName = ''
  emitStatus('')
}

// 忘记已保存的工作目录（清 IndexedDB 中的 handle）
export const forgetDirectory = async () => {
  await leaveDirectoryMode()
  await clearDirectoryHandle()
  await saveWorkspaceMeta({})
}

// ---------- 文件系统辅助 ----------

const getSubDir = async (dir, name, create = false) => {
  try {
    return await dir.getDirectoryHandle(name, { create })
  } catch (e) {
    return null
  }
}

const getFile = async (dir, name, create = false) => {
  try {
    return await dir.getFileHandle(name, { create })
  } catch (e) {
    return null
  }
}

const readText = async fileHandle => {
  const file = await fileHandle.getFile()
  return file.text()
}

const writeText = async (fileHandle, content) => {
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

const readJson = async fileHandle => {
  try {
    return JSON.parse(await readText(fileHandle))
  } catch (e) {
    return null
  }
}

// 优先 maps/，否则回退到目录根（兼容旧式把 .smm 直接放根目录的文件夹）
const resolveMapsDir = async (create = false) => {
  const mapsDir = await getSubDir(directoryHandle, MAPS_DIR, create)
  return mapsDir || directoryHandle
}

// 导图标识解析：兼容 <name>.smm 与 <name> 两种写法，统一返回文件夹名（不含扩展名）
const toMapKey = name => {
  const str = String(name || '')
  return str.toLowerCase().endsWith('.smm') ? str.slice(0, -4) : str
}
const ensureSmmExt = name => (name.toLowerCase().endsWith('.smm') ? name : name + '.smm')

// 取得导图文件夹句柄（不存在则创建）
const ensureMapFolder = async (mapsDir, key) => {
  const folder = await getSubDir(mapsDir, key, true)
  return folder
}

// ---------- 图片外置 / 水合 ----------
// 所有图片操作都以“导图文件夹”为根：图片放在 <mapFolder>/images/，
// 正文引用统一写成 images/<fileName>，这样导图文件夹整体移动/复制后引用依然有效。

const BASE64_RE = /^data:image\/[^;,]+;base64,/
const isBase64 = v => typeof v === 'string' && BASE64_RE.test(v)
const isBlobUrl = v => typeof v === 'string' && v.startsWith('blob:')

const extOfDataUrl = dataUrl => {
  const m = /^data:image\/([^;,]+)/.exec(dataUrl)
  if (!m) return 'png'
  const subtype = m[1].toLowerCase()
  if (subtype === 'jpeg') return 'jpg'
  if (subtype === 'svg+xml') return 'svg'
  return subtype
}

const hashString = str => {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

const writeImageFile = async (dir, fileName, blob) => {
  const fileHandle = await getFile(dir, fileName, true)
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

const dataUrlToBlob = async dataUrl => {
  const res = await fetch(dataUrl)
  return res.blob()
}

const walkTree = async (root, fn) => {
  if (!root || typeof root !== 'object') return
  await fn(root)
  const children = root.children
  if (Array.isArray(children)) {
    for (const child of children) {
      await walkTree(child, fn)
    }
  }
}

// 深拷贝并丢弃运行时对象（_node 等循环引用），得到可序列化的“持久化副本”。
// 这是数据序列化边界：所有落盘内容都必须经过它，确保与编辑器运行时对象解耦。
export const toPersistableData = data => {
  try {
    return JSON.parse(JSON.stringify(data))
  } catch (e) {
    // 若数据本身带循环引用（理论上不应发生，Edit.vue 已在事件入口净化），
    // 退化为仅保留 { layout, root, theme, view } 纯字段的宽拷贝。
    const pick = {}
    if (data && typeof data === 'object') {
      ;['layout', 'root', 'theme', 'view'].forEach(k => {
        if (data[k] !== undefined) pick[k] = data[k]
      })
    }
    return pick.root ? pick : null
  }
}

// 取得导图文件夹下的 images/ 目录句柄
const getMapImagesDir = async (mapFolder, create = false) => {
  return getSubDir(mapFolder, IMAGES_DIR, create)
}

// 从给定 imagesDir 读取图片为 blob URL，并建立 url<->path 双向映射
const readImageAsUrl = async (imagesDir, relPath) => {
  if (!imagesDir) return ''
  const fileName = relPath.slice(IMAGES_DIR.length + 1)
  const fileHandle = await getFile(imagesDir, fileName, false)
  if (!fileHandle) return ''
  const file = await fileHandle.getFile()
  const url = URL.createObjectURL(file)
  urlToPathMap.set(url, relPath)
  pathToUrlMap.set(relPath, url)
  return url
}

// 把一个图片源（base64/blob url/已是相对路径）落盘到 imagesDir，返回持久化相对路径
const persistImageSource = async (imagesDir, value) => {
  if (isBlobUrl(value)) {
    // blob URL -> 相对路径（映射在本会话内一直保留，避免二次保存时还原失败）
    return urlToPathMap.get(value) || value
  }
  if (isBase64(value)) {
    const ext = extOfDataUrl(value)
    const fileName = 'img_' + ext + '_' + hashString(value) + '.' + ext
    try {
      const blob = await dataUrlToBlob(value)
      await writeImageFile(imagesDir, fileName, blob)
      return IMAGES_DIR + '/' + fileName
    } catch (e) {
      return value
    }
  }
  return value
}

// 保存前：把导图正文中的 base64/blob 图片外置到该导图的 images/ 并替换为相对路径
export const extractImagesForMap = async (mapFolder, data) => {
  if (!data || !data.root) return { data, extracted: 0, failed: 0 }
  const imagesDir = await getMapImagesDir(mapFolder, true)
  if (!imagesDir) return { data, extracted: 0, failed: 1 }
  const cloned = toPersistableData(data)
  if (!cloned || !cloned.root) return { data, extracted: 0, failed: 1 }
  let extracted = 0
  let failed = 0

  // 渲染器与 NodeBase64ImageStorage 实际读写 root.data.imgMap；
  // 旧版本曾误存于 root.imgMap，这里一并读取并迁移到正确位置。
  if (!cloned.root.data) cloned.root.data = {}
  const legacyImgMap = cloned.root.imgMap
  delete cloned.root.imgMap
  const imgMap = Object.assign({}, cloned.root.data.imgMap || {}, legacyImgMap || {})
  const newImgMap = {}
  for (const key of Object.keys(imgMap)) {
    const value = imgMap[key]
    const persisted = await persistImageSource(imagesDir, value)
    if (persisted !== value && persisted !== urlToPathMap.get(value)) {
      extracted++
    } else if (isBlobUrl(value) && persisted === value) {
      failed++
    }
    newImgMap[key] = persisted
  }
  cloned.root.data.imgMap = newImgMap

  // 富文本中的内联图片（base64 / blob URL），统一外置为相对路径
  await walkTree(cloned.root, async node => {
    const text = node.data && node.data.text
    if (
      typeof text !== 'string' ||
      (text.indexOf('data:image') === -1 && text.indexOf('blob:') === -1)
    ) {
      return
    }
    let html = ''
    let lastIndex = 0
    const srcRe = /src="((?:data:image\/[^"]+|blob:[^"]+))"/g
    let m
    let changed = false
    while ((m = srcRe.exec(text))) {
      html += text.slice(lastIndex, m.index)
      const source = m[1]
      const persisted = await persistImageSource(imagesDir, source)
      if (persisted !== source) {
        html += 'src="' + persisted + '"'
        if (!isBlobUrl(source) || persisted !== source) {
          // base64 首次外置计一次；blob->相对路径还原不算“新增”
          if (isBase64(source)) extracted++
        }
        changed = true
      } else {
        html += m[0]
        if (isBlobUrl(source)) failed++
      }
      lastIndex = m.index + m[0].length
    }
    html += text.slice(lastIndex)
    if (changed) node.data.text = html
  })

  return { data: cloned, extracted, failed }
}

// 加载后：把该导图 images/ 下的相对路径图片读为 blob URL（渲染器可用）
export const hydrateImagesForMap = async (mapFolder, data) => {
  if (!data || !data.root) return data
  const imagesDir = await getMapImagesDir(mapFolder, false)
  if (!imagesDir) return data
  if (!data.root.data) data.root.data = {}
  const legacyImgMap = data.root.imgMap
  delete data.root.imgMap
  const imgMap = Object.assign({}, data.root.data.imgMap || {}, legacyImgMap || {})
  data.root.data.imgMap = imgMap
  for (const key of Object.keys(imgMap)) {
    const value = imgMap[key]
    if (typeof value === 'string' && value.indexOf(IMAGES_DIR + '/') === 0) {
      const url = await readImageAsUrl(imagesDir, value)
      if (url) imgMap[key] = url
      // 文件缺失时不删除引用：保留相对路径，下次保存不会丢图片关联；
      // 渲染层对无法加载的图片会显示占位图，文件恢复后可再次正常水合。
    }
  }
  // 富文本中的相对路径图片
  await walkTree(data.root, async node => {
    const text = node.data && node.data.text
    if (typeof text !== 'string' || text.indexOf(IMAGES_DIR + '/') === -1) return
    let html = ''
    let lastIndex = 0
    const srcRe = new RegExp('src="(' + IMAGES_DIR + '/[^"]+)"', 'g')
    let m
    let changed = false
    while ((m = srcRe.exec(text))) {
      html += text.slice(lastIndex, m.index)
      const rel = m[1]
      const url = pathToUrlMap.get(rel)
      if (url) {
        html += 'src="' + url + '"'
        changed = true
      } else {
        html += m[0]
      }
      lastIndex = m.index + m[0].length
    }
    html += text.slice(lastIndex)
    if (changed) node.data.text = html
  })
  return data
}

// ---------- 旧布局迁移 ----------
// 旧版本目录模式把导图以平铺 maps/*.smm 存放，图片统一放在工作目录根 images/。
// 迁移策略：读取旧 .smm 正文 -> 建立 <name>/ 文件夹并写入 <name>.smm ->
// 把正文引用的图片复制到 <name>/images/（引用相对路径保持不变）-> 删除旧的平铺文件。
const migrateLegacyMapFile = async (mapsDir, fileName) => {
  const key = toMapKey(fileName)
  const oldFile = await getFile(mapsDir, fileName, false)
  if (!oldFile) return false
  const text = await readText(oldFile)
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return false // 无法解析则跳过，保留原文件
  }
  const folder = await ensureMapFolder(mapsDir, key)
  if (!folder) return false

  // 旧版图片在目录根 images/（兼容 maps/images/ 两种情况）
  const legacyImagesDir =
    (await getSubDir(directoryHandle, IMAGES_DIR, false)) ||
    (await getSubDir(mapsDir, IMAGES_DIR, false))

  // 收集正文引用到的图片相对路径（imgMap + 富文本 src）
  const refs = new Set()
  if (data && data.root) {
    const imgMap =
      (data.root.data && data.root.data.imgMap) || data.root.imgMap || {}
    Object.values(imgMap).forEach(v => {
      if (typeof v === 'string' && v.indexOf(IMAGES_DIR + '/') === 0) refs.add(v)
    })
    const walk = root => {
      if (!root || typeof root !== 'object') return
      const textNode = root.data && root.data.text
      if (typeof textNode === 'string') {
        const re = new RegExp(IMAGES_DIR + '/[^"\\s]+', 'g')
        let m
        while ((m = re.exec(textNode))) refs.add(m[0])
      }
      ;(root.children || []).forEach(walk)
    }
    walk(data.root)
  }
  // 复制图片（存在才复制，缺失的不影响正文解析）
  if (legacyImagesDir) {
    const imagesDir = await getMapImagesDir(folder, true)
    for (const rel of refs) {
      const fileName2 = rel.slice(IMAGES_DIR.length + 1)
      const src = await getFile(legacyImagesDir, fileName2, false)
      if (src) {
        const content = await (await src.getFile()).slice()
        await writeImageFile(imagesDir, fileName2, content)
      }
    }
  }

  // 写入新布局正文（固定文件名 data.smm）
  const dataFile = await getFile(folder, DATA_FILE, true)
  await writeText(dataFile, text)
  // 删除旧平铺文件（正文已完整迁移）
  try {
    await oldFile.remove()
  } catch (e) {
    // 删除失败则保留，后续 list 会再次尝试迁移同名文件（幂等）
  }
  return true
}

// ---------- 文件管理 ----------

export const listMapFiles = async () => {
  if (!directoryHandle) return []
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return []
  // 先尝试迁移旧布局平铺 .smm
  const flatFiles = []
  for await (const [name, handle] of mapsDir.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.smm')) {
      flatFiles.push(name)
    }
  }
  for (const name of flatFiles) {
    await migrateLegacyMapFile(mapsDir, name)
  }
  const list = []
  for await (const [name, handle] of mapsDir.entries()) {
    if (handle.kind !== 'directory') continue
    // 只把含 data.smm 的文件夹视为导图（避免把 maps/images 之类历史目录当导图）
    const dataFile = await getFile(handle, DATA_FILE, false)
    if (dataFile) list.push(ensureSmmExt(name))
  }
  return list.sort()
}

// 创建导图：name 可为 <name> 或 <name>.smm，建立对应文件夹并写入初始数据
export const createMapFile = async (name, data) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(true)
  const key = toMapKey(name)
  const folder = await getSubDir(mapsDir, key, false)
  if (folder) return { ok: false, message: '文件已存在' }
  const newFolder = await ensureMapFolder(mapsDir, key)
  if (!newFolder) return { ok: false, message: '创建目录失败' }
  const dataFile = await getFile(newFolder, DATA_FILE, true)
  const fileName = ensureSmmExt(key)
  try {
    const source = data || {}
    const { data: outData } = await extractImagesForMap(newFolder, source)
    await enqueueWrite(async () => {
      await writeText(dataFile, JSON.stringify(outData || {}))
    })
    currentFileName = fileName
    await saveWorkspaceMeta({ directoryName, currentFileName: fileName })
    return { ok: true, fileName }
  } catch (e) {
    emitError('新建导图失败：' + (e.message || e))
    return { ok: false, message: e.message || '创建失败' }
  }
}

// 打开导图：fileName 可为 <name>.smm 或 <name>；读取正文并水合图片
export const openMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  // 切换文件前清理上一个文件的 blob URL 与映射，避免泄漏与串图
  revokeAllUrls()
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const key = toMapKey(fileName)
  // 若还是旧平铺文件（首次迁移未覆盖），就地迁移
  const flat = await getFile(mapsDir, ensureSmmExt(key), false)
  if (flat) {
    await migrateLegacyMapFile(mapsDir, ensureSmmExt(key))
  }
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false, message: '文件不存在' }
  const dataFile = await getFile(folder, DATA_FILE, false)
  if (!dataFile) return { ok: false, message: '文件不存在' }
  const data = await readJson(dataFile)
  if (!data) return { ok: false, message: '文件内容不是有效 JSON' }
  const hydrated = await hydrateImagesForMap(folder, data)
  const canonical = ensureSmmExt(key)
  currentFileName = canonical
  await saveWorkspaceMeta({ directoryName, currentFileName: canonical })
  return { ok: true, data: hydrated, fileName: canonical }
}

// 读取导图原始 JSON 文本（不水合）
export const readRawMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false, message: '文件不存在' }
  const dataFile = await getFile(folder, DATA_FILE, false)
  if (!dataFile) return { ok: false, message: '文件不存在' }
  const text = await readText(dataFile)
  return { ok: true, text, fileName: ensureSmmExt(key) }
}

export const renameMapFile = async (oldName, newName) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const oldKey = toMapKey(oldName)
  const newKey = toMapKey(newName)
  if (!newKey) return { ok: false, message: '文件名为空' }
  const src = await getSubDir(mapsDir, oldKey, false)
  if (!src) return { ok: false, message: '文件不存在' }
  const dst = await getSubDir(mapsDir, newKey, false)
  if (dst) return { ok: false, message: '目标文件已存在' }
  // 重命名文件夹（文件夹内 data.smm/images/history 一并移动，引用保持不变）
  try {
    await src.move(mapsDir, newKey)
  } catch (e) {
    return { ok: false, message: '重命名失败：' + (e.message || e) }
  }
  const canonical = ensureSmmExt(newKey)
  if (getCurrentFileName() === ensureSmmExt(oldKey) || getCurrentFileName() === oldKey) {
    currentFileName = canonical
  }
  await saveWorkspaceMeta({ directoryName, currentFileName: canonical })
  return { ok: true, fileName: canonical }
}

export const deleteMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) {
    // 兼容旧平铺文件删除
    const flat = await getFile(mapsDir, ensureSmmExt(key), false)
    if (!flat) return { ok: false, message: '文件不存在' }
    await flat.remove()
  } else {
    await folder.remove({ recursive: true })
  }
  if (getCurrentFileName() === ensureSmmExt(key) || getCurrentFileName() === key) {
    currentFileName = ''
  }
  await saveWorkspaceMeta({ directoryName, currentFileName })
  return { ok: true }
}

// 保存导图到 maps/<name>/（含图片外置到该导图 images/，串行写入）
export const saveMapFile = async (fileName, data) => {
  if (!directoryHandle) {
    emitStatus('error')
    emitError('工作目录未打开，无法保存')
    return { ok: false, message: '工作目录未打开' }
  }
  emitStatus('saving')
  const mapsDir = await resolveMapsDir(true)
  const key = toMapKey(fileName)
  return enqueueWrite(async () => {
    try {
      const folder = await ensureMapFolder(mapsDir, key)
      const { data: outData, extracted, failed } = await extractImagesForMap(folder, data)
      if (!outData) throw new Error('数据序列化失败')
      const text = JSON.stringify(outData)
      const dataFile = await getFile(folder, DATA_FILE, true)
      await writeText(dataFile, text)
      const canonical = ensureSmmExt(key)
      currentFileName = canonical
      await saveWorkspaceMeta({ directoryName, currentFileName: canonical })
      emitStatus('saved')
      return { ok: true, outData, extracted, failed }
    } catch (error) {
      emitStatus('error')
      emitError('保存到工作目录失败：' + (error.message || error))
      throw error
    }
  })
}

// ---------- 历史版本（每张导图一个 history/ 文件夹，每份快照一个独立文件） ----------

const getHistoryDir = async (mapFolder, create = false) => {
  return getSubDir(mapFolder, HISTORY_DIR, create)
}

const snapshotFileName = (time, manual) =>
  `${String(time)}_${manual ? 'manual' : 'auto'}.smm.json`

// 为当前导图保存一份历史版本（正文已含相对图片路径引用）
export const saveHistorySnapshot = async (fileName, data, manual = false) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false, message: '文件不存在' }
  const historyDir = await getHistoryDir(folder, true)
  if (!historyDir) return { ok: false, message: '无法创建历史目录' }
  const time = Date.now()
  const name = snapshotFileName(time, manual)
  // 统一序列化边界：内存数据可能携带 blob/base64，先外置到该导图 images/ 得到相对路径引用。
  // 快照与正文共用该导图 images/（图片按内容哈希命名、永不被清理），因此：
  //  - 修改/替换图片只会新增文件，旧快照引用的图片文件仍然存在 → 旧版本图片不失效；
  //  - 恢复旧快照时图片可正常显示。
  const { data: outData } = await extractImagesForMap(folder, data)
  const snapshotData = outData || data
  const snapshot = {
    time,
    manual: !!manual,
    data: {
      root: snapshotData && snapshotData.root,
      view: snapshotData && snapshotData.view,
      layout: snapshotData && snapshotData.layout,
      theme: snapshotData && snapshotData.theme
    }
  }
  // 只写 root/view，与旧版快照范围一致；layout/theme 以当前为准
  delete snapshot.data.layout
  delete snapshot.data.theme
  const fileHandle = await getFile(historyDir, name, true)
  try {
    await writeText(fileHandle, JSON.stringify(snapshot))
  } catch (e) {
    return { ok: false, message: e.message || '写入历史失败' }
  }
  // 清理超量历史
  await trimHistory(mapsDir, key)
  return { ok: true, name }
}

// 读取某导图全部历史（返回 [{name,time,manual}]，按时间升序）
export const getHistorySnapshots = async fileName => {
  if (!directoryHandle) return []
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return []
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return []
  const historyDir = await getHistoryDir(folder, false)
  if (!historyDir) return []
  const list = []
  for await (const [name, handle] of historyDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      const data = await readJson(handle)
      if (data) {
        list.push({ name, time: data.time, manual: !!data.manual })
      }
    }
  }
  return list.sort((a, b) => a.time - b.time)
}

// 恢复某历史版本：读取快照并水合该导图 images/ 图片，返回可 setData 的数据
export const restoreHistorySnapshot = async (fileName, snapshotName) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false, message: '工作目录未打开' }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false, message: '文件不存在' }
  const historyDir = await getHistoryDir(folder, false)
  if (!historyDir) return { ok: false, message: '历史目录不存在' }
  const fileHandle = await getFile(historyDir, snapshotName, false)
  if (!fileHandle) return { ok: false, message: '历史文件不存在' }
  const snapshot = await readJson(fileHandle)
  if (!snapshot) return { ok: false, message: '历史文件损坏' }
  // 快照正文引用的是该导图 images/ 的相对路径，直接水合即可显示图片
  const snapshotData = snapshot.data && snapshot.data.root ? snapshot.data : {}
  if (snapshotData.root) {
    await hydrateImagesForMap(folder, snapshotData)
  }
  return { ok: true, data: snapshotData }
}

// 删除单个历史版本
export const deleteHistorySnapshot = async (fileName, snapshotName) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false }
  const historyDir = await getHistoryDir(folder, false)
  if (!historyDir) return { ok: false }
  const fileHandle = await getFile(historyDir, snapshotName, false)
  if (!fileHandle) return { ok: false, message: '历史文件不存在' }
  await fileHandle.remove()
  return { ok: true }
}

// 清空某导图全部历史
export const clearHistorySnapshots = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return { ok: false }
  const key = toMapKey(fileName)
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return { ok: false }
  const historyDir = await getHistoryDir(folder, false)
  if (!historyDir) return { ok: false }
  const toRemove = []
  for await (const [name, handle] of historyDir.entries()) {
    if (handle.kind === 'file') toRemove.push(name)
  }
  for (const name of toRemove) {
    try {
      await (await getFile(historyDir, name, false)).remove()
    } catch (e) {
      // 忽略单个失败
    }
  }
  return { ok: true }
}

// 历史数量修剪：总份数不超过 HISTORY_MAX_TOTAL；其中自动份数不超过 HISTORY_MAX_AUTO。
// 一律从最旧（文件名时间最小）的开始删，手动快照在自动超限时会保留更久。
const trimHistory = async (mapsDir, key) => {
  const folder = await getSubDir(mapsDir, key, false)
  if (!folder) return
  const historyDir = await getHistoryDir(folder, false)
  if (!historyDir) return
  const entries = []
  for await (const [name, handle] of historyDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      entries.push({ name, handle })
    }
  }
  if (entries.length === 0) return
  // 按文件名时间升序（旧→新）
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const isAuto = e => e.name.indexOf('_auto.') !== -1
  const removeEntry = e => {
    try {
      return e.handle.remove()
    } catch (err) {
      return Promise.resolve()
    }
  }

  // 1) 总份数超限：删最旧的
  const excessTotal = entries.length - HISTORY_MAX_TOTAL
  for (let i = 0; i < excessTotal; i++) {
    await removeEntry(entries[i])
  }
  if (excessTotal > 0) return

  // 2) 自动份数超限：从最旧的自动快照开始删
  const autoEntries = entries.filter(isAuto)
  const excessAuto = autoEntries.length - HISTORY_MAX_AUTO
  for (let i = 0; i < excessAuto; i++) {
    await removeEntry(autoEntries[i])
  }
}
