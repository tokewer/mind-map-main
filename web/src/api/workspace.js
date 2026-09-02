import { flushStore, clearDataCache } from './index'
import { notifyWorkspaceChanged, notifyWorkspaceError } from './workspaceEvents'
import { flushServerSave, markKeyRemoved } from './serverStorage'
import { validateWorkspaceStorage } from './workspaceValidation'

const WORKSPACE_TYPE = 'mind-map-workspace'
const WORKSPACE_VERSION = 1
const WORKSPACE_FILE_NAME = '思绪思维导图工作区.smmw.json'
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
const AI_CONFIG_KEYS = ['key', 'apiKey', 'token', 'secret']

let workspaceFileHandle = null
let autoSaveTimer = null
let autoSaveBusy = false
let autoSaveEnabled = false

const isFileSystemSupported = () =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

const isAbortError = error => String(error && error.name || '').toLowerCase() === 'aborterror' ||
  String(error && error.message || '').toLowerCase().includes('abort')

const readStorage = () => {
  const storage = {}
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (EXACT_KEYS.includes(key) || PREFIXES.some(prefix => key.startsWith(prefix))) {
      keys.push(key)
    }
  }
  keys.forEach(key => {
    const value = localStorage.getItem(key)
    if (value !== null) storage[key] = value
  })
  return storage
}

const sanitizeLocalConfig = raw => {
  try {
    const config = JSON.parse(raw || '{}')
    AI_CONFIG_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(config, key)) delete config[key]
    })
    return JSON.stringify(config)
  } catch (e) {
    return raw
  }
}

const sanitizeStorage = storage => {
  const result = { ...storage }
  if (result.SIMPLE_MIND_MAP_LOCAL_CONFIG) {
    result.SIMPLE_MIND_MAP_LOCAL_CONFIG = sanitizeLocalConfig(result.SIMPLE_MIND_MAP_LOCAL_CONFIG)
  }
  return result
}

export const exportWorkspaceObject = () => {
  flushStore()
  const storage = sanitizeStorage(readStorage())
  return {
    type: WORKSPACE_TYPE,
    version: WORKSPACE_VERSION,
    exportedAt: new Date().toISOString(),
    currentFileId: localStorage.getItem('SIMPLE_MIND_MAP_CURRENT_FILE') || '',
    storage
  }
}

export const exportWorkspace = () => JSON.stringify(exportWorkspaceObject(), null, 2)

export const validateWorkspace = value => {
  let data = value
  try {
    if (typeof value === 'string') data = JSON.parse(value)
  } catch (e) {
    return { ok: false, message: '工作区文件不是有效 JSON' }
  }
  if (!data || data.type !== WORKSPACE_TYPE) {
    return { ok: false, message: '文件类型不是思绪思维导图工作区' }
  }
  if (data.version !== WORKSPACE_VERSION) {
    return { ok: false, message: `工作区版本不兼容：${data.version || '未知'}` }
  }
  const storageValidation = validateWorkspaceStorage(
    data.storage,
    data.storage && data.storage.SIMPLE_MIND_MAP_CURRENT_FILE || data.currentFileId
  )
  if (!storageValidation.ok) return storageValidation
  return { ok: true, data }
}

const getImportKeys = storage => {
  const keys = new Set([...EXACT_KEYS])
  Object.keys(storage || {}).forEach(key => {
    if (PREFIXES.some(prefix => key.startsWith(prefix))) keys.add(key)
  })
  return [...keys]
}

export const importWorkspace = value => {
  const checked = validateWorkspace(value)
  if (!checked.ok) return checked
  const incoming = checked.data.storage
  const previous = readStorage()
  const previousLocalConfig = previous.SIMPLE_MIND_MAP_LOCAL_CONFIG
  try {
    getImportKeys({ ...previous, ...incoming }).forEach(key => localStorage.removeItem(key))
    const next = { ...incoming }
    // 工作区不携带 AI 凭据，保留当前浏览器已有的凭据字段。
    try {
      const oldConfig = JSON.parse(previousLocalConfig || '{}')
      if (!next.SIMPLE_MIND_MAP_LOCAL_CONFIG && previousLocalConfig) {
        next.SIMPLE_MIND_MAP_LOCAL_CONFIG = previousLocalConfig
      } else {
        const newConfig = JSON.parse(next.SIMPLE_MIND_MAP_LOCAL_CONFIG || '{}')
        AI_CONFIG_KEYS.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(oldConfig, key)) newConfig[key] = oldConfig[key]
        })
        next.SIMPLE_MIND_MAP_LOCAL_CONFIG = JSON.stringify(newConfig)
      }
    } catch (e) {
      console.warn('工作区配置未能合并当前凭据', e)
    }
    Object.keys(next).forEach(key => {
      if (typeof next[key] === 'string') localStorage.setItem(key, next[key])
    })
    Object.keys(previous).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(next, key)) markKeyRemoved(key)
    })
    clearDataCache()
    notifyWorkspaceChanged()
    return { ok: true, data: checked.data }
  } catch (error) {
    // 导入失败时恢复原始 allowlist，避免留下半套工作区。
    try {
      getImportKeys({ ...previous, ...incoming }).forEach(key => localStorage.removeItem(key))
      Object.keys(previous).forEach(key => localStorage.setItem(key, previous[key]))
    } catch (rollbackError) {
      console.error(rollbackError)
    }
    return { ok: false, message: '工作区导入失败，已尝试恢复原数据', error }
  }
}

const writeHandle = async (handle, content) => {
  const writable = await handle.createWritable()
  try {
    await writable.write(content)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch (abortError) {
      console.warn('工作区写入中止失败', abortError)
    }
    throw error
  }
}

export const saveWorkspaceFile = async (reuseHandle = true) => {
  flushStore()
  let handle = reuseHandle ? workspaceFileHandle : null
  if (!handle) {
    if (!isFileSystemSupported()) {
      const blob = new Blob([exportWorkspace()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = WORKSPACE_FILE_NAME
      a.click()
      URL.revokeObjectURL(url)
      return { ok: true, downloaded: true }
    }
    handle = await window.showSaveFilePicker({
      suggestedName: WORKSPACE_FILE_NAME,
      types: [{ description: '思绪思维导图工作区', accept: { 'application/json': ['.smmw.json', '.json'] } }]
    })
  }
  await writeHandle(handle, exportWorkspace())
  workspaceFileHandle = handle
  autoSaveEnabled = true
  return { ok: true, handle }
}

export const openWorkspaceFile = async file => {
  let source = file
  let handle = null
  if (!source) {
    if (typeof window.showOpenFilePicker !== 'function') {
      return { ok: false, unsupported: true, message: '当前浏览器不支持直接选择工作区文件' }
    }
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: '思绪思维导图工作区', accept: { 'application/json': ['.smmw.json', '.json'] } }]
    })
    if (!handles.length) return { ok: false, cancelled: true }
    handle = handles[0]
    source = await handle.getFile()
  }
  const text = typeof source === 'string' ? source : await source.text()
  const checked = validateWorkspace(text)
  if (!checked.ok) return checked
  return { ok: true, data: checked.data, text, handle }
}

export const applyOpenedWorkspace = async result => {
  if (!result || !result.ok) return result
  const applied = importWorkspace(result.text || result.data)
  if (applied.ok) {
    if (result.handle) {
      workspaceFileHandle = result.handle
      autoSaveEnabled = true
    }
    await flushServerSave()
  }
  return applied
}

export const scheduleWorkspaceAutoSave = () => {
  if (!autoSaveEnabled || !workspaceFileHandle) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    if (autoSaveBusy) {
      scheduleWorkspaceAutoSave()
      return
    }
    autoSaveBusy = true
    try {
      await saveWorkspaceFile(true)
    } catch (error) {
      autoSaveEnabled = false
      console.error('工作区自动保存失败', error)
      if (!isAbortError(error)) notifyWorkspaceError('工作区自动保存失败，请重新选择保存位置')
    } finally {
      autoSaveBusy = false
    }
  }, 2000)
}

export const isWorkspaceAutoSaveEnabled = () => autoSaveEnabled && !!workspaceFileHandle
export const getWorkspaceFileName = () => workspaceFileHandle && workspaceFileHandle.name
export const disableWorkspaceAutoSave = () => {
  clearTimeout(autoSaveTimer)
  autoSaveEnabled = false
  workspaceFileHandle = null
}
