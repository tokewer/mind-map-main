// 工作目录存储层（StorageAdapter）
// 核心链路：Edit → StorageAdapter → File System Access API → 本地 .smm / images/
// 原则：
//   - 本地文件系统中的 .smm 是唯一权威数据源，不在 localStorage/IndexedDB 存正文副本。
//   - 图片外置到 images/，.smm 内只存相对路径引用（root.imgMap 值或富文本 html）。
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

// 图片 URL -> 相对路径 反向映射（水合时建立，保存时还原），避免持久化 blob URL
const urlToPathMap = new Map()
// 相对路径 -> blob URL（当前会话已读取的图片）
const pathToUrlMap = new Map()

let directoryHandle = null
let directoryName = ''
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

// 从 IndexedDB 恢复工作目录 handle（刷新/重启后免重复授权）
export const restoreDirectory = async () => {
  const handle = await getDirectoryHandle()
  if (!handle) return { ok: false, noHandle: true }
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      return { ok: false, needReauth: true }
    }
    setDirectoryState(handle, handle.name)
    const meta = await getWorkspaceMeta()
    if (meta && meta.currentFileName) currentFileName = meta.currentFileName
    return { ok: true, name: handle.name, currentFileName }
  } catch (e) {
    return { ok: false, error: e }
  }
}

// 权限失效时重新请求授权
export const requestReauth = async () => {
  if (!directoryHandle) {
    return openDirectoryPicker()
  }
  try {
    const permission = await directoryHandle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return { ok: false, denied: true }
    const meta = await getWorkspaceMeta()
    if (meta && meta.currentFileName) currentFileName = meta.currentFileName
    return { ok: true, name: directoryHandle.name, currentFileName }
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

// 优先 maps/，否则回退到目录根（兼容旧式把 .smm 直接放根目录的文件夹）
const resolveMapsDir = async (create = false) => {
  const mapsDir = await getSubDir(directoryHandle, MAPS_DIR, create)
  return mapsDir || directoryHandle
}

const ensureSmmExt = name => (name.toLowerCase().endsWith('.smm') ? name : name + '.smm')

// ---------- 文件管理 ----------

export const listMapFiles = async () => {
  if (!directoryHandle) return []
  const mapsDir = await resolveMapsDir(false)
  if (!mapsDir) return []
  const list = []
  for await (const [name, handle] of mapsDir.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.smm')) {
      list.push(name)
    }
  }
  return list.sort()
}

export const createMapFile = async (name, data) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(true)
  const fileName = ensureSmmExt(name)
  let fileHandle = await getFile(mapsDir, fileName, false)
  if (fileHandle) return { ok: false, message: '文件已存在' }
  fileHandle = await getFile(mapsDir, fileName, true)
  const { data: outData } = await extractImages(data || {})
  await enqueueWrite(async () => {
    await writeText(fileHandle, JSON.stringify(outData))
  })
  currentFileName = fileName
  await saveWorkspaceMeta({ directoryName, currentFileName: fileName })
  return { ok: true, fileName }
}

export const openMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  // 切换文件前清理上一个文件的 blob URL 与映射，避免泄漏与串图
  revokeAllUrls()
  const mapsDir = await resolveMapsDir(false)
  const fileHandle = await getFile(mapsDir || directoryHandle, fileName, false)
  if (!fileHandle) return { ok: false, message: '文件不存在' }
  const text = await readText(fileHandle)
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, message: '文件内容不是有效 JSON' }
  }
  const hydrated = await hydrateImages(data)
  currentFileName = fileName
  await saveWorkspaceMeta({ directoryName, currentFileName: fileName })
  return { ok: true, data: hydrated, fileName }
}

export const readRawMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  const fileHandle = await getFile(mapsDir || directoryHandle, fileName, false)
  if (!fileHandle) return { ok: false, message: '文件不存在' }
  const text = await readText(fileHandle)
  return { ok: true, text, fileName }
}

export const renameMapFile = async (oldName, newName) => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  const dir = mapsDir || directoryHandle
  const src = await getFile(dir, oldName, false)
  if (!src) return { ok: false, message: '文件不存在' }
  const newFileName = ensureSmmExt(newName)
  const dst = await getFile(dir, newFileName, false)
  if (dst) return { ok: false, message: '目标文件已存在' }
  await src.move(dir, newFileName)
  if (currentFileName === oldName) currentFileName = newFileName
  await saveWorkspaceMeta({ directoryName, currentFileName })
  return { ok: true, fileName: newFileName }
}

export const deleteMapFile = async fileName => {
  if (!directoryHandle) return { ok: false, message: '工作目录未打开' }
  const mapsDir = await resolveMapsDir(false)
  const dir = mapsDir || directoryHandle
  const fh = await getFile(dir, fileName, false)
  if (!fh) return { ok: false, message: '文件不存在' }
  await fh.remove()
  if (currentFileName === fileName) currentFileName = ''
  await saveWorkspaceMeta({ directoryName, currentFileName })
  return { ok: true }
}

// 保存导图到 maps/（含图片外置，串行写入）
export const saveMapFile = async (fileName, data) => {
  if (!directoryHandle) {
    emitStatus('error')
    emitError('工作目录未打开，无法保存')
    return { ok: false, message: '工作目录未打开' }
  }
  emitStatus('saving')
  return enqueueWrite(async () => {
    try {
      const mapsDir = await resolveMapsDir(true)
      const { data: outData } = await extractImages(data)
      const text = JSON.stringify(outData)
      const fileHandle = await getFile(mapsDir, fileName, true)
      await writeText(fileHandle, text)
      currentFileName = fileName
      await saveWorkspaceMeta({ directoryName, currentFileName: fileName })
      emitStatus('saved')
      return { ok: true, outData }
    } catch (error) {
      emitStatus('error')
      emitError('保存到工作目录失败：' + (error.message || error))
      throw error
    }
  })
}

// ---------- 图片外置 / 水合 ----------

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

// 保存前：把 base64 图片写为 images/ 文件并替换为相对路径，把 blob URL 还原为相对路径
export const extractImages = async data => {
  if (!data || !data.root) return { data, extracted: 0, failed: 0 }
  const cloned = JSON.parse(JSON.stringify(data))
  let extracted = 0
  let failed = 0
  const imagesDir = await getSubDir(directoryHandle, IMAGES_DIR, true)
  if (!imagesDir) return { data: cloned, extracted: 0, failed: 1 }

  // 渲染器与 NodeBase64ImageStorage 实际读写 root.data.imgMap；
  // 旧版本曾误存于 root.imgMap，这里一并读取并迁移到正确位置。
  if (!cloned.root.data) cloned.root.data = {}
  const legacyImgMap = cloned.root.imgMap
  delete cloned.root.imgMap
  const imgMap = Object.assign({}, cloned.root.data.imgMap || {}, legacyImgMap || {})
  const newImgMap = {}
  for (const key of Object.keys(imgMap)) {
    const value = imgMap[key]
    if (isBlobUrl(value)) {
      // blob URL -> 相对路径（映射在本会话内一直保留，避免二次保存时还原失败）
      newImgMap[key] = urlToPathMap.get(value) || value
    } else if (isBase64(value)) {
      const ext = extOfDataUrl(value)
      const fileName = 'img_' + ext + '_' + hashString(value) + '.' + ext
      try {
        const blob = await dataUrlToBlob(value)
        await writeImageFile(imagesDir, fileName, blob)
        newImgMap[key] = IMAGES_DIR + '/' + fileName
        extracted++
      } catch (e) {
        newImgMap[key] = value
        failed++
      }
    } else {
      newImgMap[key] = value
    }
  }
  cloned.root.data.imgMap = newImgMap

  // 富文本中的 base64 图片
  await walkTree(cloned.root, async node => {
    const text = node.data && node.data.text
    if (typeof text !== 'string' || text.indexOf('data:image') === -1) return
    let html = ''
    let lastIndex = 0
    const srcRe = /src="(data:image\/[^"]+)"/g
    let m
    let changed = false
    while ((m = srcRe.exec(text))) {
      html += text.slice(lastIndex, m.index)
      const dataUrl = m[1]
      if (isBase64(dataUrl)) {
        const ext = extOfDataUrl(dataUrl)
        const fileName = 'img_' + ext + '_' + hashString(dataUrl) + '.' + ext
        try {
          const blob = await dataUrlToBlob(dataUrl)
          await writeImageFile(imagesDir, fileName, blob)
          html += 'src="' + IMAGES_DIR + '/' + fileName + '"'
          extracted++
          changed = true
        } catch (e) {
          html += m[0]
          failed++
        }
      } else {
        html += m[0]
      }
      lastIndex = m.index + m[0].length
    }
    html += text.slice(lastIndex)
    if (changed) node.data.text = html
  })

  return { data: cloned, extracted, failed }
}

// 加载后：把相对路径图片读为 blob URL（渲染器可用），并建立反向映射
export const hydrateImages = async data => {
  if (!data || !data.root) return data
  const imagesDir = await getSubDir(directoryHandle, IMAGES_DIR, false)
  // 渲染器与 NodeBase64ImageStorage 实际读写 root.data.imgMap；
  // 旧版本曾误存于 root.imgMap，这里合并并迁移到正确位置。
  if (!data.root.data) data.root.data = {}
  const legacyImgMap = data.root.imgMap
  delete data.root.imgMap
  const imgMap = Object.assign({}, data.root.data.imgMap || {}, legacyImgMap || {})
  data.root.data.imgMap = imgMap
  for (const key of Object.keys(imgMap)) {
    const value = imgMap[key]
    if (typeof value === 'string' && value.indexOf(IMAGES_DIR + '/') === 0) {
      const url = await readImageAsUrl(imagesDir, value)
      if (url) {
        imgMap[key] = url
        urlToPathMap.set(url, value)
        pathToUrlMap.set(value, url)
      }
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

const readImageAsUrl = async (imagesDir, relPath) => {
  if (!imagesDir) return ''
  const fileName = relPath.slice(IMAGES_DIR.length + 1)
  const fileHandle = await getFile(imagesDir, fileName, false)
  if (!fileHandle) return ''
  const file = await fileHandle.getFile()
  return URL.createObjectURL(file)
}
