import exampleData from 'simple-mind-map/example/exampleData'
import { simpleDeepClone } from 'simple-mind-map/src/utils/index'
import Vue from 'vue'
import vuexStore from '@/store'
import { notifyWorkspaceChanged } from './workspaceEvents'
import { scheduleWorkspaceAutoSave } from './workspace'
import { syncFromDiskOnce, markBootstrapKey, markKeyRemoved } from './serverStorage'
import * as directoryStorage from './directoryStorage'

const SIMPLE_MIND_MAP_DATA = 'SIMPLE_MIND_MAP_DATA' // 旧版单文件 key，仅用于首次迁移
const SIMPLE_MIND_MAP_CONFIG = 'SIMPLE_MIND_MAP_CONFIG'
const SIMPLE_MIND_MAP_LANG = 'SIMPLE_MIND_MAP_LANG'
const SIMPLE_MIND_MAP_LOCAL_CONFIG = 'SIMPLE_MIND_MAP_LOCAL_CONFIG'
const SIMPLE_MIND_MAP_FILE_LIST = 'SIMPLE_MIND_MAP_FILE_LIST'
const SIMPLE_MIND_MAP_CURRENT_FILE = 'SIMPLE_MIND_MAP_CURRENT_FILE'
const SIMPLE_MIND_MAP_FILE_PREFIX = 'SIMPLE_MIND_MAP_FILE_'
const SIMPLE_MIND_MAP_HISTORY_PREFIX = 'SIMPLE_MIND_MAP_HISTORY_'
// 浏览器导图已「归档清理」标记：置 1 后，即使文件列表为空也不再自动重建默认导图
const SIMPLE_MIND_MAP_BROWSER_CLEARED = 'SIMPLE_MIND_MAP_BROWSER_CLEARED'

const isBrowserCleared = () => {
  try {
    return localStorage.getItem(SIMPLE_MIND_MAP_BROWSER_CLEARED) === '1'
  } catch (e) {
    return false
  }
}

const HISTORY_MAX_AUTO = 10 // 自动快照保留份数
const HISTORY_MAX_TOTAL = 30 // 快照总数上限（手动 + 自动）

let mindMapData = null
let storageTimer = null
let pendingTask = null // { fileId, data } —— 数据与文件 ID 绑定，避免切换竞态
let lastSnapshotTimes = {} // 按文件记录上次自动快照时间
let initialized = false
// 内存缓存：避免每次 view_data_change 都全量 JSON.parse localStorage（切换节点卡顿根源）
let dataCache = null
let dataCacheFileId = ''

// ---------- 多文件存储 ----------

const getFileKey = id => SIMPLE_MIND_MAP_FILE_PREFIX + id
const getHistoryKey = id => SIMPLE_MIND_MAP_HISTORY_PREFIX + id

// 初始化多文件存储：首次运行时把旧单文件数据迁移为第一个文件
export const initFileStorage = () => {
  if (initialized) return
  initialized = true
  // 启动时优先从本地文件夹（磁盘 data/）回填，localStorage 缺失的键才从磁盘补齐
  const diskSynced = syncFromDiskOnce()
  let list = []
  try {
    list = JSON.parse(localStorage.getItem(SIMPLE_MIND_MAP_FILE_LIST)) || []
  } catch (e) {
    list = []
  }
  // 用户已执行「归档并清理浏览器存储」：文件列表为空时不再自动重建占位导图，
  // 避免刚清理完又出现内容的“删不干净”观感。
  if (list.length === 0 && !isBrowserCleared()) {
    let firstData = simpleDeepClone(exampleData)
    let oldData = localStorage.getItem(SIMPLE_MIND_MAP_DATA)
    if (oldData) {
      try {
        firstData = JSON.parse(oldData)
      } catch (e) {
        firstData = simpleDeepClone(exampleData)
      }
    }
    const file = {
      id: diskSynced ? 'file_default' : 'file_offline_' + Date.now(),
      name: '我的思维导图',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    try {
      localStorage.setItem(getFileKey(file.id), JSON.stringify(firstData))
      markBootstrapKey(getFileKey(file.id))
      list.push(file)
      localStorage.setItem(SIMPLE_MIND_MAP_FILE_LIST, JSON.stringify(list))
      markBootstrapKey(SIMPLE_MIND_MAP_FILE_LIST)
      if (!localStorage.getItem(SIMPLE_MIND_MAP_CURRENT_FILE)) {
        localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, file.id)
        markBootstrapKey(SIMPLE_MIND_MAP_CURRENT_FILE)
      }
    } catch (error) {
      console.log(error)
    }
  }
}

export const getFileList = () => {
  initFileStorage()
  try {
    return JSON.parse(localStorage.getItem(SIMPLE_MIND_MAP_FILE_LIST)) || []
  } catch (e) {
    return []
  }
}

export const saveFileList = list => {
  localStorage.setItem(SIMPLE_MIND_MAP_FILE_LIST, JSON.stringify(list))
  notifyWorkspaceChanged()
}

export const getCurrentFileId = () => {
  initFileStorage()
  let id = localStorage.getItem(SIMPLE_MIND_MAP_CURRENT_FILE)
  if (!id || !getFileList().find(f => f.id === id)) {
    const list = getFileList()
    if (list.length) {
      id = list[0].id
    } else if (isBrowserCleared()) {
      // 已归档清理且文件列表为空：不写入虚假 current，返回空串由调用方兜底
      return ''
    } else {
      id = 'file_default'
    }
    localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, id)
  }
  return id
}

export const setCurrentFileId = id => {
  localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, id)
  notifyWorkspaceChanged()
}

export const getCurrentFile = () => {
  const id = getCurrentFileId()
  return getFileList().find(f => f.id === id) || null
}

export const getFileById = id => {
  return getFileList().find(f => f.id === id) || null
}

// 当前“导图”的统一身份：目录模式下用 .smm 文件名，浏览器模式下用 fileId。
// 复习记录、重点标记、历史等所有与导图挂钩的元数据都应使用该身份，避免两种模式混用。
export const getCurrentMapIdentity = () => {
  if (vuexStore.state.isDirectoryMode) {
    const name = directoryStorage.getCurrentFileName() || ''
    return { fileId: name, fileName: name.replace(/\.smm$/i, ''), isDirectory: true }
  }
  return { fileId: getCurrentFileId(), fileName: getCurrentFile() ? getCurrentFile().name : '', isDirectory: false }
}

// 读取某“导图身份”对应的正文数据（跨模式统一入口，供复习页定位/建树使用）。
// 目录模式按文件名读本地文件（仅返回持久化 JSON，不做图片水合——调用方若只需
// uid/父子结构时无需生成 blob URL，避免泄漏），浏览器模式读 localStorage。
export const readMapDataByIdentity = async identity => {
  const fileId = identity && (identity.fileId || identity)
  if (!fileId) return null
  const isDir =
    (identity && identity.isDirectory) ||
    (vuexStore.state.isDirectoryMode &&
      typeof fileId === 'string' &&
      fileId.toLowerCase().endsWith('.smm'))
  if (isDir) {
    const res = await directoryStorage.readRawMapFile(fileId)
    if (!res || !res.ok) return null
    try {
      return JSON.parse(res.text)
    } catch (e) {
      return null
    }
  }
  return readFileData(fileId)
}

// 恢复上次的工作目录并打开上次的导图（免重选）。
// - withReauth=false：仅做静默查询；权限未授予时返回 { ok:false, needReauth:true }，
//   由调用方（启动流程）决定是否等待用户手势。
// - withReauth=true：必须在用户手势中调用；会用已保存的目录句柄静默续权（不再弹目录选择器），
//   成功后进入工作目录模式并读回上次打开的导图，返回可直接 setData 的数据。
export const resumeDirectoryMode = async (withReauth = false) => {
  if (!(await directoryStorage.hasSavedDirectory())) {
    return { ok: false, reason: 'no-handle' }
  }
  let res = await directoryStorage.restoreDirectory()
  if (res && res.ok) {
    // fallthrough: 权限已授予
  } else if (res && res.needReauth && withReauth) {
    try {
      res = await directoryStorage.requestReauth()
    } catch (e) {
      return { ok: false, reason: 'reauth-error', error: e }
    }
  } else {
    return res || { ok: false }
  }
  if (!res || !res.ok) return res || { ok: false }
  // 打开上次的导图；没有则取目录中第一个
  let target = res.currentFileName
  if (!target) {
    const files = await directoryStorage.listMapFiles()
    target = files && files.length ? files[0] : ''
  }
  let opened = null
  if (target) {
    opened = await directoryStorage.openMapFile(target)
    if (!opened || !opened.ok) opened = null
  }
  // 目录完全为空时新建一张默认导图：保证会话始终有可写目标，避免后续编辑静默丢失
  if (!opened && directoryStorage.getDirectoryHandleValue()) {
    const created = await directoryStorage.createMapFile('我的思维导图', undefined)
    if (created && created.ok) {
      opened = await directoryStorage.openMapFile(created.fileName)
      if (!opened || !opened.ok) opened = null
    }
  }
  return {
    ok: true,
    name: res.name,
    fileName: opened ? opened.fileName : (target || ''),
    data: opened ? opened.data : null
  }
}

export const createFile = name => {
  initFileStorage()
  const list = getFileList()
  const file = {
    id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: name || '新建思维导图',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  try {
    localStorage.setItem(getFileKey(file.id), JSON.stringify(simpleDeepClone(exampleData)))
    list.push(file)
    saveFileList(list)
  } catch (error) {
    console.log(error)
    if (isQuotaExceeded(error)) {
      Vue.prototype.$bus.$emit('localStorageExceeded')
    }
  }
  return file
}

export const renameFile = (id, name) => {
  const list = getFileList()
  const f = list.find(x => x.id === id)
  if (f) {
    f.name = name || f.name
    f.updatedAt = Date.now()
    saveFileList(list)
  }
}

export const deleteFile = id => {
  const list = getFileList()
  const idx = list.findIndex(x => x.id === id)
  if (idx === -1) return
  list.splice(idx, 1)
  saveFileList(list)
  localStorage.removeItem(getFileKey(id))
  localStorage.removeItem(getHistoryKey(id))
  markKeyRemoved(getFileKey(id))
  markKeyRemoved(getHistoryKey(id))
  notifyWorkspaceChanged()
  if (getCurrentFileId() === id) {
    if (list.length > 0) {
      localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, list[0].id)
      scheduleWorkspaceAutoSave()
    } else {
      const f = createFile('我的思维导图')
      localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, f.id)
    }
  }
}

export const readFileData = id => {
  const store = localStorage.getItem(getFileKey(id))
  if (store === null) return simpleDeepClone(exampleData)
  try {
    return JSON.parse(store)
  } catch (e) {
    return simpleDeepClone(exampleData)
  }
}

export const writeFileData = (id, data) => {
  try {
    localStorage.setItem(getFileKey(id), JSON.stringify(data))
    notifyWorkspaceChanged()
    scheduleWorkspaceAutoSave()
    const list = getFileList()
    const f = list.find(x => x.id === id)
    if (f) {
      f.updatedAt = Date.now()
      saveFileList(list)
    }
  } catch (error) {
    console.log(error)
    if (isQuotaExceeded(error)) {
      Vue.prototype.$bus.$emit('localStorageExceeded')
    }
  }
}

// ---------- 历史版本快照 ----------

// 手动/自动保存一个历史版本。快照只存 root + view，减小 localStorage 占用
export const saveSnapshot = (fileId, manual = false) => {
  const id = fileId || getCurrentFileId()
  const data = readFileData(id)
  const snapshot = {
    time: Date.now(),
    manual: !!manual,
    data: { root: data.root || null, view: data.view || null }
  }
  let list = getSnapshots(id)
  list.push(snapshot)
  if (!manual) {
    const autoList = list.filter(s => !s.manual)
    if (autoList.length > HISTORY_MAX_AUTO) {
      const removeCount = autoList.length - HISTORY_MAX_AUTO
      let removed = 0
      list = list.filter(s => {
        if (!s.manual && removed < removeCount) {
          removed++
          return false
        }
        return true
      })
    }
  }
  if (list.length > HISTORY_MAX_TOTAL) {
    list = list.slice(list.length - HISTORY_MAX_TOTAL)
  }
  try {
    localStorage.setItem(getHistoryKey(id), JSON.stringify(list))
    notifyWorkspaceChanged()
  } catch (error) {
    // 超限时逐步丢弃最旧快照，直到能存下为止
    let shrunk = list.slice()
    let writeError = error
    while (shrunk.length > 1 && isQuotaExceeded(writeError)) {
      shrunk = shrunk.slice(1)
      try {
        localStorage.setItem(getHistoryKey(id), JSON.stringify(shrunk))
        list = shrunk
        writeError = null
        notifyWorkspaceChanged()
        break
      } catch (e2) {
        writeError = e2
      }
    }
    if (writeError) {
      console.log(writeError)
    }
  }
}

// 自动快照：每文件 60 秒内最多存一份，避免高频编辑产生过多版本
const autoSnapshot = fileId => {
  const now = Date.now()
  const last = lastSnapshotTimes[fileId] || 0
  if (now - last < 60000) return
  lastSnapshotTimes[fileId] = now
  saveSnapshot(fileId, false)
}

export const getSnapshots = fileId => {
  const id = fileId || getCurrentFileId()
  try {
    return JSON.parse(localStorage.getItem(getHistoryKey(id))) || []
  } catch (e) {
    return []
  }
}

export const clearSnapshots = fileId => {
  const id = fileId || getCurrentFileId()
  localStorage.removeItem(getHistoryKey(id))
  markKeyRemoved(getHistoryKey(id))
  notifyWorkspaceChanged()
}

// 删除某文件历史列表中的一份快照（index 为升序数组下标）
export const deleteSnapshot = (fileId, index) => {
  const id = fileId || getCurrentFileId()
  const list = getSnapshots(id)
  if (index >= 0 && index < list.length) {
    list.splice(index, 1)
    try {
      localStorage.setItem(getHistoryKey(id), JSON.stringify(list))
      notifyWorkspaceChanged()
    } catch (e) {
      console.log(e)
    }
  }
}

// 恢复某个历史版本：用当前文件的 layout/theme，替换 root/view
export const restoreSnapshot = (fileId, snapshot) => {
  const id = fileId || getCurrentFileId()
  const cur = readFileData(id)
  return {
    ...cur,
    root: snapshot.data.root || cur.root,
    view: snapshot.data.view || cur.view
  }
}

// ---------- 原数据接口（改为多文件） ----------

// 获取缓存的思维导图数据
export const getData = () => {
  // 接管模式
  if (window.takeOverApp) {
    mindMapData = window.takeOverAppMethods.getMindMapData()
    return mindMapData
  }
  // 工作目录模式：正文唯一权威来源是内存缓存（由 storeData 维护），不读 localStorage
  if (vuexStore.state.isDirectoryMode) {
    return dataCache || simpleDeepClone(exampleData)
  }
  // 操作本地文件模式
  if (vuexStore.state.isHandleLocalFile) {
    return Vue.prototype.getCurrentData()
  }
  const fileId = getCurrentFileId()
  // 命中内存缓存则直接返回（切换节点高频 view_data_change 的核心优化）
  if (dataCache && dataCacheFileId === fileId) {
    return dataCache
  }
  dataCache = readFileData(fileId)
  dataCacheFileId = fileId
  return dataCache
}

// 清除数据内存缓存（文件切换/删除/导入后调用）
export const clearDataCache = () => {
  dataCache = null
  dataCacheFileId = ''
}

// 存储思维导图数据。immediate=true 时立即写入，否则 500ms 节流合并高频编辑
export const storeData = (data, immediate = false) => {
  try {
    let originData = null
    if (window.takeOverApp) {
      originData = mindMapData
    } else {
      originData = getData()
    }
    if (!originData) {
      originData = {}
    }
    originData = {
      ...originData,
      ...data
    }
    if (window.takeOverApp) {
      mindMapData = originData
      window.takeOverAppMethods.saveMindMapData(originData)
      return
    }
    // 工作目录模式：唯一权威数据源是本地 .smm，只更新内存缓存 + 防抖写盘。
    // 不写 localStorage、不触发 write_local_file、不调度 server.py 双写。
    if (vuexStore.state.isDirectoryMode) {
      dataCache = originData
      dataCacheFileId = 'directory'
      if (immediate) {
        clearTimeout(directorySaveTimer)
        directoryPendingData = originData
        directoryFlushSave()
      } else {
        directoryScheduleSave(originData)
      }
      return
    }
    Vue.prototype.$bus.$emit('write_local_file', originData)
    if (vuexStore.state.isHandleLocalFile) {
      return
    }
    let fileId = getCurrentFileId()
    // 已清理且尚无文件时的兜底：用户确实在浏览器模式下编辑并保存，
    // 此时为他新建一个导图文件，避免写入空 id 的垃圾键。
    if (!fileId && originData && (originData.root || originData.layout)) {
      const created = createFile('我的思维导图')
      if (created && created.id) {
        localStorage.setItem(SIMPLE_MIND_MAP_CURRENT_FILE, created.id)
        fileId = created.id
      }
    }
    const doWrite = () => {
      storageTimer = null
      pendingTask = null
      writeFileData(fileId, originData)
      scheduleWorkspaceAutoSave()
      // 写入后同步内存缓存，避免后续 getData 读到旧数据
      dataCache = originData
      dataCacheFileId = fileId
      autoSnapshot(fileId)
    }
    if (immediate) {
      clearTimeout(storageTimer)
      pendingTask = null
      // 立即写入的同时也立即更新缓存
      doWrite()
    } else {
      pendingTask = { fileId, data: originData }
      // 节流期间也先更新内存缓存，保证 getData 始终读到最新
      dataCache = originData
      dataCacheFileId = fileId
      clearTimeout(storageTimer)
      storageTimer = setTimeout(doWrite, 500)
    }
  } catch (error) {
    console.log(error)
    if (isQuotaExceeded(error)) {
      Vue.prototype.$bus.$emit('localStorageExceeded')
    }
  }
}

// 判断是否真的超出浏览器 localStorage 配额
const isQuotaExceeded = error => {
  if (!error) return false
  return (
    error.code === 22 ||
    error.code === 1014 ||
    error.name === 'QuotaExceededError' ||
    (error.name === 'NS_ERROR_DOM_QUOTA_REACHED') ||
    String(error.message || '').toLowerCase().includes('quota')
  )
}

// 立即把节流中的待写数据落盘（用于切换文件/关闭前）。
// 数据与最初的文件 ID 绑定，不会因切换而写到新文件。
export const flushStore = () => {
  if (storageTimer) {
    clearTimeout(storageTimer)
    storageTimer = null
  }
  if (pendingTask) {
    const task = pendingTask
    pendingTask = null
    writeFileData(task.fileId, task.data)
    // 落盘后同步缓存
    dataCache = task.data
    dataCacheFileId = task.fileId
    autoSnapshot(task.fileId)
  }
}

// ---------- 工作目录模式：防抖自动保存 ----------
// 与 localStorage 的 storageTimer 隔离，避免互相干扰。

const DIRECTORY_SAVE_DELAY = 800
// 目录模式自动历史快照节流（每张导图 60s 内最多一份）
const DIRECTORY_AUTO_SNAPSHOT_INTERVAL = 60000
let directorySaveTimer = null
let directoryPendingData = null
let directorySaving = false
let directorySaveAgain = false
let directoryLastSnapshotTime = {}

const directoryFlushSave = async () => {
  if (directorySaving) {
    directorySaveAgain = true
    return
  }
  const data = directoryPendingData
  if (!data) return
  directoryPendingData = null
  directorySaving = true
  try {
    const fileName = directoryStorage.getCurrentFileName()
    if (fileName) {
      // 注意：saveMapFile 内部深拷贝后再外置图片，不会污染内存中的水合数据。
      // 内存缓存保持 blob URL / base64 的渲染版本，落盘版本才是相对路径。
      const res = await directoryStorage.saveMapFile(fileName, data)
      // 保存成功后节流触发“自动历史快照”（历史以文件形式保存在该导图 history/ 下）
      if (res && res.ok && res.outData) {
        autoDirectorySnapshot(fileName, res.outData)
      }
    }
  } catch (error) {
    // 失败：保留本次数据，等待下一次变更自动重试；状态已在 adapter 中置 error
    if (directoryPendingData === null) {
      directoryPendingData = data
    }
  } finally {
    directorySaving = false
    if (directorySaveAgain) {
      directorySaveAgain = false
      directoryFlushSave()
    }
  }
}

// 目录模式自动快照：节流 + 静默失败（不打扰用户编辑）
const autoDirectorySnapshot = (fileName, data) => {
  const now = Date.now()
  const last = directoryLastSnapshotTime[fileName] || 0
  if (now - last < DIRECTORY_AUTO_SNAPSHOT_INTERVAL) return
  directoryLastSnapshotTime[fileName] = now
  directoryStorage
    .saveHistorySnapshot(fileName, data, false)
    .catch(() => {})
}

// 切换导图时重置自动快照节流（保证新导图能及时产生首份快照）
export const resetDirectorySnapshotThrottle = () => {
  directoryLastSnapshotTime = {}
}

const directoryScheduleSave = data => {
  directoryPendingData = data
  clearTimeout(directorySaveTimer)
  directorySaveTimer = setTimeout(() => {
    directorySaveTimer = null
    directoryFlushSave()
  }, DIRECTORY_SAVE_DELAY)
}

// 立即把工作目录模式的待写数据落盘（切换文件/关闭前调用）
export const flushDirectoryStore = async () => {
  clearTimeout(directorySaveTimer)
  directorySaveTimer = null
  await directoryFlushSave()
}

// ---------- 工作目录模式：历史版本（以文件形式存在每张导图 history/ 下） ----------
// 目录模式历史不使用 localStorage；这里统一包一层，HistoryDialog 无需感知存储后端。

export const getDirectorySnapshots = async () => {
  const fileName = directoryStorage.getCurrentFileName()
  if (!fileName) return []
  return directoryStorage.getHistorySnapshots(fileName)
}

export const saveDirectorySnapshot = async manual => {
  const fileName = directoryStorage.getCurrentFileName()
  if (!fileName) return { ok: false, message: '尚未打开导图' }
  // 落盘前确保最新的数据先写入正文（快照与当前内容一致）
  await flushDirectoryStore()
  const data = dataCache
  if (!data) return { ok: false, message: '没有可保存的数据' }
  return directoryStorage.saveHistorySnapshot(fileName, data, !!manual)
}

export const deleteDirectorySnapshot = async snapshotName => {
  const fileName = directoryStorage.getCurrentFileName()
  if (!fileName) return { ok: false }
  return directoryStorage.deleteHistorySnapshot(fileName, snapshotName)
}

export const clearDirectorySnapshots = async () => {
  const fileName = directoryStorage.getCurrentFileName()
  if (!fileName) return { ok: false }
  return directoryStorage.clearHistorySnapshots(fileName)
}

// 恢复某个历史版本：用当前导图的 layout/theme，替换 root/view（图片引用已水合）
export const restoreDirectorySnapshot = async snapshotName => {
  const fileName = directoryStorage.getCurrentFileName()
  if (!fileName) return { ok: false, message: '尚未打开导图' }
  const res = await directoryStorage.restoreHistorySnapshot(fileName, snapshotName)
  if (!res || !res.ok) return res || { ok: false, message: '恢复失败' }
  const cur = dataCache || {}
  return {
    ok: true,
    data: {
      ...cur,
      root: (res.data && res.data.root) || cur.root,
      view: (res.data && res.data.view) || cur.view
    }
  }
}

// 获取思维导图配置数据
export const getConfig = () => {
  if (window.takeOverApp) {
    window.takeOverAppMethods.getMindMapConfig()
    return
  }
  let config = localStorage.getItem(SIMPLE_MIND_MAP_CONFIG)
  if (config) {
    return JSON.parse(config)
  }
  return null
}

// 存储思维导图配置数据
export const storeConfig = config => {
  try {
    if (window.takeOverApp) {
      window.takeOverAppMethods.saveMindMapConfig(config)
      return
    }
    localStorage.setItem(SIMPLE_MIND_MAP_CONFIG, JSON.stringify(config))
    notifyWorkspaceChanged()
  } catch (error) {
    console.log(error)
  }
}

// 存储语言
export const storeLang = lang => {
  if (window.takeOverApp) {
    window.takeOverAppMethods.saveLanguage(lang)
    return
  }
  localStorage.setItem(SIMPLE_MIND_MAP_LANG, lang)
  notifyWorkspaceChanged()
}

// 获取存储的语言
export const getLang = () => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.getLanguage() || 'zh'
  }
  let lang = localStorage.getItem(SIMPLE_MIND_MAP_LANG)
  if (lang) {
    return lang
  }
  storeLang('zh')
  return 'zh'
}

// 存储本地配置
export const storeLocalConfig = config => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.saveLocalConfig(config)
  }
  localStorage.setItem(SIMPLE_MIND_MAP_LOCAL_CONFIG, JSON.stringify(config))
  notifyWorkspaceChanged()
}

// 获取本地配置
export const getLocalConfig = () => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.getLocalConfig()
  }
  let config = localStorage.getItem(SIMPLE_MIND_MAP_LOCAL_CONFIG)
  if (config) {
    return JSON.parse(config)
  }
  return null
}
