import Vue from 'vue'
import vuexStore from '@/store'
import * as directoryStorage from '@/api/directoryStorage'
import { notifyWorkspaceChanged } from '@/api/workspaceEvents'

// 复习数据层：
// - 工作目录模式（isDirectoryMode === true）：复习节点与思维导图保存在同一文件夹
//   （<工作目录>/maps/<导图名>/review.json），全局配置及未绑定导图节点保存在 <工作目录>/review.json。
// - 浏览器模式（降级）：使用 localStorage（MIND_MAP_REVIEW_DATA）。
// 节点以 uid（simple-mind-map 全局唯一）为键，与导图内容解耦
const REVIEW_KEY = 'MIND_MAP_REVIEW_DATA'
const FILE_LIST_KEY = 'SIMPLE_MIND_MAP_FILE_LIST'
const DEFAULT_CYCLES = [1, 3, 4]
const DATA_VERSION = 5

// 内置周期预设种子：首次运行时写入 presets，用户可增删改
const DEFAULT_PRESETS = [
  { id: 'preset_ebbinghaus', name: '艾宾浩斯', cycles: [1, 2, 4, 7, 15] },
  { id: 'preset_common', name: '常用', cycles: [1, 3, 7] },
  { id: 'preset_dense', name: '密集', cycles: [1, 1, 3, 3, 7] },
  { id: 'preset_loose', name: '宽松', cycles: [3, 7, 15, 30] }
]

// 生成预设 id
const createPresetId = () =>
  'preset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)

// 解析周期字符串："1d-3d-4d" / "1,3,4" / "1 3 4" / [1,3,4] → [1,3,4]
export const parseCycles = str => {
  if (Array.isArray(str)) {
    return str.filter(n => Number(n) > 0).map(Number)
  }
  const parts = String(str).split(/[-,，\s]+/)
  return parts
    .map(p => parseInt(p.replace(/[dD天]/g, ''), 10))
    .filter(n => !isNaN(n) && n > 0)
}

// 周期序列转显示字符串
export const cyclesToStr = cycles => {
  return (cycles || []).join('-')
}

const pad = n => String(n).padStart(2, '0')

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const addDays = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 掌握度等级：由连续成功次数/错误次数推导
export const MASTERY_LEVELS = {
  new: '未学习',
  learning: '学习中',
  basic: '基本掌握',
  weak: '容易遗忘',
  mastered: '熟练'
}

// 三档评价
export const RATING = {
  FORGOT: 'forgot', // 忘记 → 错误+1，间隔重置
  FUZZY: 'fuzzy', // 模糊 → 错误+1，间隔减半
  REMEMBER: 'remember' // 记得 → 推进周期
}

// 复习频率：影响周期间隔倍率
export const FREQUENCY = {
  LOW: 'low', // 低频：间隔×1.5
  NORMAL: 'normal', // 正常：间隔×1
  HIGH: 'high' // 高频：间隔×0.5（不熟悉内容，复习更勤）
}

// 计算某次复习的实际间隔天数（考虑频率倍率）
export const getIntervalDays = (node, index) => {
  const base = (node.cycles && node.cycles[index]) || 1
  const freq = node.frequency || FREQUENCY.NORMAL
  if (freq === FREQUENCY.LOW) {
    return Math.round(base * 1.5)
  }
  if (freq === FREQUENCY.HIGH) {
    return Math.max(1, Math.round(base * 0.5))
  }
  return base
}

// 确保 presets 结构完整。仅当 presets 字段缺失（首次运行 / 旧版数据）时播种内置预设；
// 用户删除内置预设后（presets 已存在，即使为空数组），不自动恢复，尊重删除操作。
const normalizePresets = data => {
  if (data.presets === undefined || data.presets === null) {
    data.presets = DEFAULT_PRESETS.map(d => ({
      id: d.id,
      name: d.name,
      cycles: parseCycles(d.cycles)
    }))
  }
  data.presets = data.presets
    .filter(p => p && p.id && p.name && Array.isArray(p.cycles) && p.cycles.length)
    .map(p => ({ id: p.id, name: String(p.name), cycles: parseCycles(p.cycles) }))
  // 激活的预设 id 不存在时清空，回退为“自定义周期”
  if (!data.presets.some(p => p.id === data.activePresetId)) {
    data.activePresetId = null
  }
  return data
}

// ---------- 数据迁移 ----------
const migrate = data => {
  const nodes = data.nodes || {}
  Object.keys(nodes).forEach(uid => {
    const n = nodes[uid]
    if (!n || typeof n !== 'object') return
    n.uid = n.uid || uid
    n.name = n.name || '未命名'
    n.path = typeof n.path === 'string' ? n.path : ''
    n.fileId = n.fileId || ''
    n.fileName = n.fileName || ''
    n.cycles = parseCycles(n.cycles).length ? parseCycles(n.cycles) : [...DEFAULT_CYCLES]
    n.times = Number.isFinite(Number(n.times)) ? Number(n.times) : 0
    n.nextCycleIndex = Number.isFinite(Number(n.nextCycleIndex)) ? Number(n.nextCycleIndex) : 0
    n.lastReview = n.lastReview || null
    n.nextReview = n.nextReview || null
    n.status = n.status || 'new'
    n.errorCount = Number(n.errorCount) || 0 // 累计错误次数
    n.consecutiveSuccess = Number(n.consecutiveSuccess) || 0 // 连续成功次数
    n.mastery = n.mastery || deriveMastery(n) // 掌握度等级
    n.cards = Array.isArray(n.cards) ? n.cards : [] // 复习卡片列表
    n.tags = Array.isArray(n.tags) ? n.tags : [] // 标签
    n.lastRating = n.lastRating || null // 上次评价
    n.ratingHistory = Array.isArray(n.ratingHistory) ? n.ratingHistory : [] // 评价历史
    n.history = Array.isArray(n.history) ? n.history : []
    n.parentUid = n.parentUid || ''
    n.frequency = n.frequency || 'normal' // 复习频率（低/正常/高）
    n.isFocus = n.isFocus === true // 重点标记
    n.stage = getReviewStage(n)
    n.version = DATA_VERSION
  })
  data.version = DATA_VERSION
  return normalizePresets(data)
}

// 由复习数据推导掌握度
const deriveMastery = n => {
  if (n.status === 'mastered') return 'mastered'
  if (n.errorCount >= 3) return 'weak'
  if (n.times >= 2) return 'basic'
  if (n.times >= 1) return 'learning'
  return 'new'
}

// 重点标记
export const IS_FOCUS = 'isFocus'

// 复习阶段提示：阶段 1 骨架 → 阶段 2 血肉 → 阶段 3 补全
export const REVIEW_STAGES = [
  { stage: 1, title: '阶段 1', text: '骨架：建立知识框架，理解核心概念' },
  { stage: 2, title: '阶段 2', text: '血肉：补充细节，填充具体内容和例子' },
  { stage: 3, title: '阶段 3', text: '补全：完善遗漏，形成完整体系' }
]

// 标记节点为重点；未加入复习的节点会先建立一条复习记录。
export const toggleFocus = (uid, info = {}) => {
  const data = load()
  let node = data.nodes[uid]
  if (!node && uid) {
    node = addReview({ uid, ...info })
    if (!node) return false
    const nextData = load()
    if (!nextData.nodes[uid]) return false
    nextData.nodes[uid][IS_FOCUS] = true
    nextData.nodes[uid].updatedAt = todayStr()
    save(nextData)
    return true
  }
  if (!node) return false
  node[IS_FOCUS] = !node[IS_FOCUS]
  node.updatedAt = todayStr()
  save(data)
  return node[IS_FOCUS]
}

// 获取节点重点状态
export const getFocusStatus = uid => {
  const node = load().nodes[uid]
  return node ? (node[IS_FOCUS] || false) : false
}

// 获取复习阶段建议：根据复习次数返回当前阶段
export const getReviewStage = node => {
  const times = node && Number(node.times) ? Number(node.times) : 0
  if (times <= 0) return 1
  if (times === 1) return 2
  return 3
}

const createFreshData = () =>
  normalizePresets({
    version: DATA_VERSION,
    defaultCycles: [...DEFAULT_CYCLES],
    activePresetId: null,
    nodes: {}
  })

// 判断当前是否处于本地工作目录模式且句柄有效
export const isDirectoryReviewMode = () =>
  !!(
    vuexStore &&
    vuexStore.state &&
    vuexStore.state.isDirectoryMode &&
    directoryStorage.getDirectoryHandleValue()
  )

// 工作目录模式下的内存权威缓存与已落盘签名
let directoryReviewCache = null
const knownMapKeys = new Set()
const lastSavedSignatures = new Map()

// 跨标签页（如导图编辑页 #/ 与独立复习页 #/review）同步广播
const REVIEW_SYNC_CHANNEL = 'mind_map_review_sync'
let syncChannel = null
const syncSubscribers = new Set()

const getSyncChannel = () => {
  if (syncChannel) return syncChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      syncChannel = new BroadcastChannel(REVIEW_SYNC_CHANNEL)
      if (typeof syncChannel.unref === 'function') {
        syncChannel.unref()
      }
      syncChannel.onmessage = event => {
        if (event && event.data && event.data.type === 'review_updated') {
          syncSubscribers.forEach(fn => {
            try {
              fn(event.data)
            } catch (e) {
              // 忽略单个订阅回调异常
            }
          })
        }
      }
    } catch (e) {
      syncChannel = null
    }
  }
  return syncChannel
}

const broadcastReviewUpdated = () => {
  const ch = getSyncChannel()
  if (ch) {
    try {
      ch.postMessage({ type: 'review_updated', time: Date.now() })
    } catch (e) {
      // 忽略广播异常
    }
  }
}

export const subscribeReviewSync = handler => {
  const ch = getSyncChannel()
  if (!ch || typeof handler !== 'function') return () => {}
  syncSubscribers.add(handler)
  return () => {
    syncSubscribers.delete(handler)
  }
}

const loadFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(REVIEW_KEY)
    if (!raw) {
      return createFreshData()
    }
    const data = JSON.parse(raw)
    const merged = {
      defaultCycles: [...DEFAULT_CYCLES],
      activePresetId: null,
      nodes: {},
      ...data
    }
    // 保留旧版本号，不能在迁移前直接覆盖为当前版本。
    merged.version = Number(data.version) || 1
    return migrate(merged)
  } catch (e) {
    return createFreshData()
  }
}

// 读取旧版浏览器文件列表 id -> name 映射，用于首次迁移复习节点归属导图
const loadLegacyIdToNameMap = () => {
  const map = {}
  try {
    const raw = localStorage.getItem(FILE_LIST_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (Array.isArray(list)) {
      list.forEach(item => {
        if (item && item.id && item.name) {
          map[item.id] = String(item.name)
        }
      })
    }
  } catch (e) {
    // 忽略
  }
  return map
}

// 解析节点归属的导图文件夹名（返回空字符串表示未绑定到具体导图文件夹，存于根目录 review.json）
const resolveNodeMapKey = (node, idToNameMap = null) => {
  if (!node || typeof node !== 'object') return ''
  const rawFileId = String(node.fileId || '').trim()
  const rawFileName = String(node.fileName || '').trim()
  // 1. fileId 直接是目录模式的文件标识（非浏览器模式随机 id file_xxx）
  if (rawFileId && !rawFileId.startsWith('file_')) {
    const key = directoryStorage.toMapKey(rawFileId)
    if (key) return key
  }
  // 2. 通过旧版 fileId 查导图名或使用节点的 fileName 匹配工作目录中已有的导图
  const mappedName = (idToNameMap && rawFileId && idToNameMap[rawFileId]) || rawFileName
  if (mappedName && mappedName !== '手动添加') {
    const key = directoryStorage.toMapKey(mappedName)
    if (key && knownMapKeys.has(key)) return key
  }
  return ''
}

// 将复习总数据拆分为：根目录全局配置（含未归属节点）+ 各导图文件夹的 nodes 字典
const partitionReviewData = (data, idToNameMap = null) => {
  const mapBuckets = {}
  knownMapKeys.forEach(k => {
    if (k) mapBuckets[k] = {}
  })
  const unassignedNodes = {}
  const nodes = (data && data.nodes) || {}
  Object.keys(nodes).forEach(uid => {
    const n = nodes[uid]
    if (!n || typeof n !== 'object') return
    const key = resolveNodeMapKey(n, idToNameMap)
    if (key) {
      knownMapKeys.add(key)
      n.fileId = directoryStorage.ensureSmmExt(key)
      n.fileName = key
      if (!mapBuckets[key]) mapBuckets[key] = {}
      mapBuckets[key][uid] = n
    } else {
      unassignedNodes[uid] = n
    }
  })
  const rootPayload = {
    version: DATA_VERSION,
    defaultCycles: Array.isArray(data.defaultCycles) && data.defaultCycles.length
      ? data.defaultCycles
      : [...DEFAULT_CYCLES],
    activePresetId: data.activePresetId || null,
    presets: Array.isArray(data.presets) ? data.presets : [],
    migratedFromLocalStorage: true,
    nodes: unassignedNodes
  }
  return { rootPayload, mapBuckets }
}

// 将内存中的复习数据增量写入本地工作目录（仅写发生变化的 review.json）
const persistDirectoryReviewData = (data, options = {}) => {
  const normalized = migrate(data)
  directoryReviewCache = normalized
  const { rootPayload, mapBuckets } = partitionReviewData(normalized)
  const rootSig = JSON.stringify(rootPayload)
  if (options.forceRoot || lastSavedSignatures.get('__root__') !== rootSig) {
    lastSavedSignatures.set('__root__', rootSig)
    directoryStorage.saveRootReviewFile(rootPayload)
  }
  Object.keys(mapBuckets).forEach(key => {
    const mapNodes = mapBuckets[key] || {}
    const mapSig = JSON.stringify(mapNodes)
    const sigKey = 'map:' + key
    if (options.forceMaps || lastSavedSignatures.get(sigKey) !== mapSig) {
      lastSavedSignatures.set(sigKey, mapSig)
      directoryStorage.saveMapReviewFile(key, mapNodes)
    }
  })
}

// 从本地工作目录加载并合并所有导图的 review.json 与根目录 review.json；
// 若工作目录首次启用复习文件且 localStorage 中有旧复习数据，自动迁移到本地目录。
export const syncReviewFromDirectory = async () => {
  if (!directoryStorage.getDirectoryHandleValue()) {
    return { ok: false, message: '工作目录未打开' }
  }
  const loaded = await directoryStorage.loadAllDirectoryReviews()
  if (!loaded || !loaded.ok) {
    return { ok: false, message: '读取目录复习数据失败' }
  }
  knownMapKeys.clear()
  lastSavedSignatures.clear()
  ;(loaded.mapKeys || []).forEach(k => {
    if (k) knownMapKeys.add(k)
  })

  const rootData = loaded.rootData && typeof loaded.rootData === 'object' ? loaded.rootData : null
  const mergedNodes = {}

  // 1. 先加载根目录未绑定导图的复习节点
  if (rootData && rootData.nodes && typeof rootData.nodes === 'object') {
    Object.keys(rootData.nodes).forEach(uid => {
      const n = rootData.nodes[uid]
      if (n && typeof n === 'object') {
        mergedNodes[uid] = { ...n, uid: n.uid || uid }
      }
    })
  }

  // 2. 加载各导图文件夹 maps/<导图名>/review.json 中的节点（以文件夹名为权威来源）
  ;(loaded.mapKeys || []).forEach(key => {
    const entry = loaded.mapReviews && loaded.mapReviews[key]
    const rawNodes = entry && entry.data && entry.data.nodes
    if (rawNodes && typeof rawNodes === 'object') {
      const canonicalId = directoryStorage.ensureSmmExt(key)
      Object.keys(rawNodes).forEach(uid => {
        const n = rawNodes[uid]
        if (n && typeof n === 'object') {
          mergedNodes[uid] = {
            ...n,
            uid: n.uid || uid,
            fileId: canonicalId,
            fileName: key
          }
        }
      })
    }
  })

  let defaultCycles =
    rootData && Array.isArray(rootData.defaultCycles) && rootData.defaultCycles.length
      ? rootData.defaultCycles
      : [...DEFAULT_CYCLES]
  let activePresetId = rootData && rootData.activePresetId ? rootData.activePresetId : null
  let presets = rootData && Array.isArray(rootData.presets) ? rootData.presets : undefined

  // 3. 首次迁移：当工作目录尚无根目录 review.json 且各导图下也无任何已存复习节点时，
  //    自动将浏览器 localStorage 中的旧复习数据迁移进本地目录。
  let migratedFromLs = false
  if (!loaded.rootExists && Object.keys(mergedNodes).length === 0) {
    const rawLs = typeof localStorage !== 'undefined' ? localStorage.getItem(REVIEW_KEY) : null
    if (rawLs) {
      const lsData = loadFromLocalStorage()
      const idToNameMap = loadLegacyIdToNameMap()
      if (Array.isArray(lsData.defaultCycles) && lsData.defaultCycles.length) {
        defaultCycles = lsData.defaultCycles
      }
      if (lsData.activePresetId) {
        activePresetId = lsData.activePresetId
      }
      if (Array.isArray(lsData.presets)) {
        presets = lsData.presets
      }
      const lsNodes = lsData.nodes || {}
      Object.keys(lsNodes).forEach(uid => {
        const n = lsNodes[uid]
        if (!n || typeof n !== 'object') return
        const copy = { ...n, uid: n.uid || uid }
        const matchedKey = resolveNodeMapKey(copy, idToNameMap)
        if (matchedKey) {
          copy.fileId = directoryStorage.ensureSmmExt(matchedKey)
          copy.fileName = matchedKey
        }
        mergedNodes[uid] = copy
      })
      migratedFromLs = true
    }
  }

  const combined = migrate({
    version: DATA_VERSION,
    defaultCycles,
    activePresetId,
    presets,
    nodes: mergedNodes
  })
  directoryReviewCache = combined

  // 计算当前分组并把尚未在磁盘建立的 review.json 或迁移产生的数据落盘
  const { rootPayload, mapBuckets } = partitionReviewData(combined)
  const rootSig = JSON.stringify(rootPayload)
  lastSavedSignatures.set('__root__', rootSig)
  if (!loaded.rootExists || migratedFromLs) {
    directoryStorage.saveRootReviewFile(rootPayload)
  }
  Object.keys(mapBuckets).forEach(key => {
    const mapNodes = mapBuckets[key] || {}
    const mapSig = JSON.stringify(mapNodes)
    lastSavedSignatures.set('map:' + key, mapSig)
    const entry = loaded.mapReviews && loaded.mapReviews[key]
    if (!entry || !entry.exists || (migratedFromLs && Object.keys(mapNodes).length > 0)) {
      directoryStorage.saveMapReviewFile(key, mapNodes)
    }
  })

  await directoryStorage.flushDirectoryWrites()
  if (Vue.prototype.$bus) {
    Vue.prototype.$bus.$emit('review_changed')
  }
  return { ok: true, data: directoryReviewCache }
}

// 等待所有待写入的本地复习文件落盘完成
export const flushReviewWrites = async () => {
  await directoryStorage.flushDirectoryWrites()
}

// 退出工作目录模式时清理内存复习缓存，回退到 localStorage
export const leaveDirectoryReviewMode = () => {
  directoryReviewCache = null
  knownMapKeys.clear()
  lastSavedSignatures.clear()
}

const load = () => {
  if (isDirectoryReviewMode()) {
    if (!directoryReviewCache) {
      directoryReviewCache = createFreshData()
    }
    return directoryReviewCache
  }
  return loadFromLocalStorage()
}

const save = data => {
  if (isDirectoryReviewMode()) {
    try {
      persistDirectoryReviewData(data)
      notifyWorkspaceChanged()
      broadcastReviewUpdated()
    } catch (e) {
      console.log(e)
    }
    return
  }
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(data))
    notifyWorkspaceChanged()
    broadcastReviewUpdated()
  } catch (e) {
    console.log(e)
    if (isQuotaExceeded(e)) {
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
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    String(error.message || '').toLowerCase().includes('quota')
  )
}

export const getReviewData = () => load()

export const getDefaultCycles = () => load().defaultCycles

// 手动设置默认周期时同步激活态：与某个预设完全一致则指向该预设，否则视为自定义
export const setDefaultCycles = cycles => {
  const data = load()
  const parsed = parseCycles(cycles)
  if (!parsed.length) return
  data.defaultCycles = parsed
  const matched = data.presets.find(
    p => cyclesToStr(p.cycles) === cyclesToStr(parsed)
  )
  data.activePresetId = matched ? matched.id : null
  save(data)
}

// ---------- 周期预设（命名周期库） ----------

// 预设列表
export const getPresets = () => load().presets

// 当前激活的预设（导图页快速切换使用）；无则返回 null（自定义周期）
export const getActivePreset = () => {
  const data = load()
  return (
    data.presets.find(p => p.id === data.activePresetId) || null
  )
}

// 新增预设：name 必填、cycles 需为合法序列；重名时自动追加序号
export const addPreset = ({ name = '', cycles = null } = {}) => {
  const data = load()
  const trimmed = String(name).trim()
  if (!trimmed) return null
  const parsed = parseCycles(cycles)
  if (!parsed.length) return null
  const base = trimmed
  let candidate = base
  let seq = 2
  while (data.presets.some(p => p.name === candidate)) {
    candidate = base + ' ' + seq
    seq++
  }
  const preset = { id: createPresetId(), name: candidate, cycles: parsed }
  data.presets.push(preset)
  save(data)
  return preset
}

// 更新预设（改名/改周期）。若更新的是当前激活预设，默认周期同步跟随。
export const updatePreset = (id, { name, cycles } = {}) => {
  const data = load()
  const preset = data.presets.find(p => p.id === id)
  if (!preset) return null
  if (typeof name === 'string' && name.trim()) preset.name = name.trim()
  const parsed = parseCycles(cycles)
  if (parsed.length) preset.cycles = parsed
  if (data.activePresetId === id) {
    data.defaultCycles = [...preset.cycles]
  }
  save(data)
  return preset
}

// 删除预设；若删除的是当前激活预设，则回到自定义周期（保留 defaultCycles）
export const deletePreset = id => {
  const data = load()
  const idx = data.presets.findIndex(p => p.id === id)
  if (idx === -1) return false
  data.presets.splice(idx, 1)
  if (data.activePresetId === id) data.activePresetId = null
  save(data)
  return true
}

// 切换当前使用的预设（导图页/复习页通用）：把该预设的周期设为默认周期
export const setActivePreset = id => {
  const data = load()
  const preset = data.presets.find(p => p.id === id)
  if (!preset) return null
  data.activePresetId = id
  data.defaultCycles = [...preset.cycles]
  save(data)
  return preset
}

// 将当前默认周期标记为“自定义”（不使用任何预设）
export const clearActivePreset = () => {
  const data = load()
  data.activePresetId = null
  save(data)
}

// 全部复习节点（按下次复习日期升序）
export const getNodeList = () => {
  const data = load()
  return Object.values(data.nodes).sort((a, b) => {
    const an = a.nextReview || '9999-99-99'
    const bn = b.nextReview || '9999-99-99'
    return an < bn ? -1 : an > bn ? 1 : 0
  })
}

export const getNode = uid => {
  return load().nodes[uid] || null
}

// 加入复习。cycles 可为数组或字符串；缺省用全局默认周期
export const addReview = ({ uid, name, path = '', fileId = '', fileName = '', parentUid = '', cycles = null }) => {
  const data = load()
  const today = todayStr()
  let resolvedFileId = fileId
  let resolvedFileName = fileName
  if (isDirectoryReviewMode()) {
    // 若调用方未显式传 fileId（且非手动添加），默认绑定到当前打开的导图文件
    if (!resolvedFileId && resolvedFileName !== '手动添加') {
      const currentFile =
        (vuexStore && vuexStore.state && vuexStore.state.currentSmmFile) ||
        directoryStorage.getCurrentFileName() ||
        ''
      if (currentFile) {
        resolvedFileId = currentFile
        resolvedFileName = resolvedFileName || directoryStorage.toMapKey(currentFile)
      }
    }
    if (resolvedFileId && !String(resolvedFileId).startsWith('file_')) {
      const key = directoryStorage.toMapKey(resolvedFileId)
      if (key) {
        resolvedFileId = directoryStorage.ensureSmmExt(key)
        resolvedFileName = key
        knownMapKeys.add(key)
      }
    }
  }
  const node = {
    uid: uid || 'manual_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: name || '未命名',
    path,
    fileId: resolvedFileId,
    fileName: resolvedFileName,
    parentUid: parentUid || '',
    cycles: parseCycles(cycles && cycles.length ? cycles : data.defaultCycles),
    times: 0,
    nextCycleIndex: 0,
    lastReview: null,
    nextReview: today, // 加入即待复习，今天完成第一次
    status: 'new',
    mastery: 'new',
    errorCount: 0,
    consecutiveSuccess: 0,
    lastRating: null,
    ratingHistory: [],
    cards: [],
    tags: [],
    frequency: 'normal',
    isFocus: false,
    stage: 1,
    createdAt: today,
    updatedAt: today,
    history: [],
    version: DATA_VERSION
  }
  data.nodes[node.uid] = node
  save(data)
  return node
}

export const removeReview = uid => {
  const data = load()
  if (data.nodes[uid]) {
    delete data.nodes[uid]
    save(data)
  }
}

export const updateReviewName = (uid, name) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  node.name = name
  node.updatedAt = todayStr()
  save(data)
}

// 文件重命名后，同步更新所有属于该文件的复习记录文件名与文件标识
export const renameFileForReviews = (fileId, newName, newFileId = '') => {
  if (!fileId) return
  const data = load()
  let changed = false
  if (isDirectoryReviewMode()) {
    const oldKey = directoryStorage.toMapKey(fileId)
    const newKey = directoryStorage.toMapKey(newFileId || newName)
    if (!oldKey || !newKey) return
    const canonicalNewId = directoryStorage.ensureSmmExt(newKey)
    knownMapKeys.delete(oldKey)
    knownMapKeys.add(newKey)
    lastSavedSignatures.delete('map:' + oldKey)
    lastSavedSignatures.delete('map:' + newKey)
    Object.keys(data.nodes).forEach(uid => {
      const n = data.nodes[uid]
      if (!n) return
      if (
        n.fileId === fileId ||
        directoryStorage.toMapKey(n.fileId) === oldKey ||
        n.fileName === oldKey
      ) {
        n.fileId = canonicalNewId
        n.fileName = newKey
        changed = true
      }
    })
    // 即使没有关联节点，也把新文件夹下的 review.json 头信息刷新为新名称
    persistDirectoryReviewData(data, { forceMaps: true })
    notifyWorkspaceChanged()
    broadcastReviewUpdated()
    return
  }
  Object.keys(data.nodes).forEach(uid => {
    const n = data.nodes[uid]
    if (n.fileId === fileId) {
      if (n.fileName !== newName) {
        n.fileName = newName
        changed = true
      }
      if (newFileId && n.fileId !== newFileId) {
        n.fileId = newFileId
        changed = true
      }
    }
  })
  if (changed) save(data)
}

// 删除导图文件时，清理内存中属于该导图的复习节点（导图文件夹本身已随删除一并移除）
export const deleteFileForReviews = fileId => {
  if (!fileId) return
  const data = load()
  const targetKey = directoryStorage.toMapKey(fileId)
  if (isDirectoryReviewMode() && targetKey) {
    knownMapKeys.delete(targetKey)
    lastSavedSignatures.delete('map:' + targetKey)
  }
  let changed = false
  Object.keys(data.nodes).forEach(uid => {
    const n = data.nodes[uid]
    if (!n) return
    if (
      n.fileId === fileId ||
      (isDirectoryReviewMode() && targetKey && directoryStorage.toMapKey(n.fileId) === targetKey)
    ) {
      delete data.nodes[uid]
      changed = true
    }
  })
  if (changed) {
    save(data)
  } else if (isDirectoryReviewMode()) {
    notifyWorkspaceChanged()
    broadcastReviewUpdated()
  }
}

export const updateCycles = (uid, cycles) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return null
  const parsed = parseCycles(cycles)
  if (!parsed.length) return null
  node.cycles = parsed
  node.nextCycleIndex = Math.min(node.nextCycleIndex || 0, parsed.length - 1)

  // 当周期改变时，如果节点处于学习/复习状态，重新计算下次复习日期
  if (node.status !== 'mastered') {
    const today = todayStr()
    const nextIndex = node.nextCycleIndex
    if (nextIndex < parsed.length) {
      node.nextReview = addDays(node.lastReview || today, getIntervalDays(node, nextIndex))
    } else {
      node.status = 'mastered'
      node.mastery = 'mastered'
      node.nextReview = null
    }
  } else if (node.nextCycleIndex < parsed.length) {
    node.status = 'reviewing'
    node.nextReview = todayStr()
  }

  node.updatedAt = todayStr()
  save(data)
  return node
}

// 更新复习频率（low/normal/high）
export const updateFrequency = (uid, frequency) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  node.frequency = ['low', 'normal', 'high'].includes(frequency) ? frequency : 'normal'
  node.updatedAt = todayStr()
  save(data)
}

// ---------- 标签 ----------
export const updateTags = (uid, tags) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  node.tags = (tags || []).map(t => String(t).trim()).filter(Boolean)
  node.updatedAt = todayStr()
  save(data)
}

// 获取全部标签（去重）
export const getAllTags = () => {
  const data = load()
  const set = new Set()
  Object.values(data.nodes).forEach(n => {
    (n.tags || []).forEach(t => set.add(t))
  })
  return [...set].sort()
}

// ---------- 复习卡片 ----------
// 卡片类型：qa（问答）、cloze（填空）、judge（判断）、example（例题）
// 若节点尚未加入复习，自动为其创建一条复习记录再保存卡片
export const addCard = (uid, card, nodeInfo = null) => {
  let data = load()
  let node = data.nodes[uid]
  if (!node && uid) {
    addReview({
      uid,
      ...(nodeInfo && typeof nodeInfo === 'object' ? nodeInfo : {})
    })
    data = load()
    node = data.nodes[uid]
  }
  if (!node) return null
  node.cards = node.cards || []
  node.cards.push({
    id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: card.type || 'qa',
    front: card.front || '',
    back: card.back || '',
    hint: card.hint || '',
    createdAt: todayStr(),
    ...card
  })
  node.updatedAt = todayStr()
  save(data)
  return node.cards[node.cards.length - 1]
}

export const updateCard = (uid, cardId, patch) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  const idx = (node.cards || []).findIndex(c => c.id === cardId)
  if (idx === -1) return
  node.cards[idx] = { ...node.cards[idx], ...patch }
  node.updatedAt = todayStr()
  save(data)
}

export const removeCard = (uid, cardId) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  node.cards = (node.cards || []).filter(c => c.id !== cardId)
  node.updatedAt = todayStr()
  save(data)
}

// 强化复习：手动推进至下一个周期（无论当前日期），并增加掌握度
export const enhanceReview = (uid) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return null

  const today = todayStr()
  node.times += 1
  node.lastReview = today

  // 强制推进一个周期
  const nextIndex = node.nextCycleIndex + 1
  if (nextIndex >= node.cycles.length) {
    node.status = 'mastered'
    node.mastery = 'mastered'
    node.nextReview = null
    node.nextCycleIndex = node.cycles.length - 1
  } else {
    node.status = node.times <= 1 ? 'learning' : 'reviewing'
    node.nextCycleIndex = nextIndex
    node.nextReview = addDays(today, getIntervalDays(node, nextIndex))
  }

  node.consecutiveSuccess += 1
  node.mastery = deriveMastery(node)
  node.stage = getReviewStage(node)
  node.updatedAt = today
  node.history.push({ date: today, action: 'enhance', times: node.times })
  if (node.history.length > 100) node.history = node.history.slice(-100)

  save(data)
  return node
}

// 三档评价复习：返回更新后的节点
export const rateReview = (uid, rating) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return null
  const today = todayStr()
  node.times += 1
  node.lastReview = today
  node.lastRating = rating
  node.ratingHistory.push({ date: today, rating })
  if (node.ratingHistory.length > 100) node.ratingHistory = node.ratingHistory.slice(-100)

  if (rating === RATING.FORGOT) {
    // 忘记：错误+1，间隔重置到最开始，状态回退
    node.errorCount += 1
    node.consecutiveSuccess = 0
    node.nextCycleIndex = 0
    node.nextReview = today
    node.status = 'learning'
  } else if (rating === RATING.FUZZY) {
    // 模糊：错误+1，间隔减半（不重置）
    node.errorCount += 1
    node.consecutiveSuccess = 0
    const nextIndex = node.nextCycleIndex
    const base = (node.cycles[nextIndex] || 1)
    const halfDays = Math.max(1, Math.floor(base / 2))
    node.nextReview = addDays(today, halfDays)
    node.status = 'reviewing'
  } else {
    // 记得：推进周期（考虑复习频率倍率）
    node.consecutiveSuccess += 1
    const nextIndex = node.nextCycleIndex + 1
    if (nextIndex >= node.cycles.length) {
      node.status = 'mastered'
      node.mastery = 'mastered'
      node.nextReview = null
      node.nextCycleIndex = node.cycles.length - 1
    } else {
      node.status = node.times <= 1 ? 'learning' : 'reviewing'
      node.nextCycleIndex = nextIndex
      node.nextReview = addDays(today, getIntervalDays(node, nextIndex))
    }
  }
  node.mastery = deriveMastery(node)
  node.stage = getReviewStage(node)
  node.updatedAt = today
  node.history.push({ date: today, action: 'review', times: node.times, rating })
  if (node.history.length > 100) node.history = node.history.slice(-100)
  save(data)
  return node
}

// 兼容旧接口：完成一次复习（默认按"记得"处理）
export const completeReview = uid => {
  return rateReview(uid, RATING.REMEMBER)
}

// 重置复习进度
export const resetReview = uid => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return
  const today = todayStr()
  node.times = 0
  node.nextCycleIndex = 0
  node.lastReview = null
  node.nextReview = today
  node.status = 'new'
  node.mastery = 'new'
  node.stage = 1
  node.errorCount = 0
  node.consecutiveSuccess = 0
  node.lastRating = null
  node.updatedAt = today
  save(data)
}

// 推迟一天
export const postponeReview = uid => {
  const data = load()
  const node = data.nodes[uid]
  if (!node || node.status === 'mastered' || !node.nextReview) return null
  const today = todayStr()
  node.nextReview = addDays(node.nextReview > today ? node.nextReview : today, 1)
  node.updatedAt = today
  save(data)
  return node
}

// “忘了”快捷评价：记一次错误并把下次复习推迟到 N 天后（由用户自选天数）。
// 与 rateReview(FORGOT) 的区别：不只重置到今天，而是允许指定复习日期。
export const forgotReview = (uid, days = 1) => {
  const data = load()
  const node = data.nodes[uid]
  if (!node) return null
  const today = todayStr()
  const wait = Math.max(1, Math.min(365, Number(days) || 1))
  node.times += 1
  node.lastReview = today
  node.lastRating = RATING.FORGOT
  node.errorCount += 1
  node.consecutiveSuccess = 0
  node.nextCycleIndex = 0
  node.nextReview = addDays(today, wait)
  node.status = 'learning'
  node.mastery = deriveMastery(node)
  node.stage = getReviewStage(node)
  node.updatedAt = today
  node.ratingHistory.push({ date: today, rating: RATING.FORGOT, days: wait })
  if (node.ratingHistory.length > 100) node.ratingHistory = node.ratingHistory.slice(-100)
  node.history.push({ date: today, action: 'review', times: node.times, rating: RATING.FORGOT, days: wait })
  if (node.history.length > 100) node.history = node.history.slice(-100)
  save(data)
  return node
}

// 今日待复习
export const todayList = () => {
  const today = todayStr()
  return getNodeList().filter(
    n => n.status !== 'mastered' && n.nextReview && n.nextReview <= today
  )
}

// 即将到期（3 天内）
export const upcomingList = () => {
  const today = todayStr()
  return getNodeList().filter(n => {
    if (n.status === 'mastered' || !n.nextReview) return false
    const diff = new Date(n.nextReview).getTime() - new Date(today).getTime()
    return diff >= 0 && diff <= 3 * 86400000
  })
}

// 薄弱节点：错误≥3 或 长期未复习（>14天）
export const weakList = () => {
  const today = todayStr()
  return getNodeList().filter(n => {
    if (n.status === 'mastered') return false
    if ((n.errorCount || 0) >= 3) return true
    if (n.nextReview) {
      const diff = new Date(today).getTime() - new Date(n.nextReview).getTime()
      if (diff > 14 * 86400000) return true
    }
    return false
  })
}

export const getStats = () => {
  const list = getNodeList()
  const today = todayStr()
  return {
    total: list.length,
    mastered: list.filter(n => n.status === 'mastered').length,
    learning: list.filter(n => n.status === 'learning' || n.status === 'reviewing').length,
    new: list.filter(n => n.status === 'new').length,
    weak: weakList().length,
    todayDone: list.filter(n => n.lastReview === today).length,
    todayDue: todayList().length
  }
}

// 导图文件是否有关联的复习节点
export const getFileNodeCount = fileId => {
  if (!fileId) return 0
  const targetKey = directoryStorage.toMapKey(fileId)
  return getNodeList().filter(
    n =>
      n.fileId === fileId ||
      (isDirectoryReviewMode() && targetKey && directoryStorage.toMapKey(n.fileId) === targetKey)
  ).length
}

// 导出 / 导入（JSON 字符串）
export const exportReviewData = () => {
  return JSON.stringify(load(), null, 2)
}

export const importReviewData = jsonStr => {
  try {
    const data = JSON.parse(jsonStr)
    if (!data || !data.nodes) throw new Error('格式错误')
    save({ ...load(), nodes: data.nodes })
    return true
  } catch (e) {
    return false
  }
}

// ---------- 复习卡片 Markdown 导入导出 ----------
// 格式：
// # 节点名 (uid:xxx)
// - Q: 问题
//   A: 答案
//   T: 类型 (qa/cloze/judge/example)
//   H: 提示

export const cardsToMarkdown = () => {
  const data = load()
  const lines = []
  Object.values(data.nodes).forEach(n => {
    const cards = n.cards || []
    if (cards.length === 0) return
    lines.push(`## ${n.name} (uid:${n.uid})`)
    lines.push(`路径: ${n.path || ''}`)
    lines.push('')
    cards.forEach(c => {
      lines.push(`- Q: ${c.front || ''}`)
      lines.push(`  A: ${c.back || ''}`)
      lines.push(`  T: ${c.type || 'qa'}`)
      if (c.hint) lines.push(`  H: ${c.hint}`)
      lines.push('')
    })
  })
  return lines.join('\n')
}

export const markdownToCards = md => {
  const lines = String(md).split(/\r?\n/)
  let currentUid = null
  let currentName = ''
  let currentPath = ''
  let currentCard = null
  let count = 0
  const data = load()

  const flushCard = () => {
    if (currentUid && currentCard) {
      // 已有该节点则添加卡片，否则新建
      if (!data.nodes[currentUid]) {
        data.nodes[currentUid] = {
          uid: currentUid,
          name: currentName || '导入节点',
          path: currentPath || '',
          fileId: '',
          fileName: '',
          cycles: [...data.defaultCycles],
          times: 0,
          nextCycleIndex: 0,
          lastReview: null,
          nextReview: todayStr(),
          status: 'new',
          mastery: 'new',
          errorCount: 0,
          consecutiveSuccess: 0,
          lastRating: null,
          ratingHistory: [],
          cards: [],
          tags: [],
          createdAt: todayStr(),
          updatedAt: todayStr(),
          history: [],
          version: 2
        }
      }
      const card = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: currentCard.type || 'qa',
        front: currentCard.front || '',
        back: currentCard.back || '',
        hint: currentCard.hint || '',
        createdAt: todayStr()
      }
      data.nodes[currentUid].cards.push(card)
      data.nodes[currentUid].cards = data.nodes[currentUid].cards || []
      count++
    }
    currentCard = null
  }

  lines.forEach(line => {
    const nodeMatch = line.match(/^##\s+(.+?)\s*\(uid:(\S+)\)\s*$/)
    if (nodeMatch) {
      flushCard()
      currentUid = nodeMatch[2]
      currentName = nodeMatch[1].trim()
      return
    }
    const pathMatch = line.match(/^路径:\s*(.*)$/)
    if (pathMatch) {
      currentPath = pathMatch[1].trim()
      return
    }
    const qMatch = line.match(/^-\s*Q:\s*(.*)$/)
    if (qMatch) {
      flushCard()
      currentCard = { front: qMatch[1].trim() }
      return
    }
    if (currentCard) {
      const aMatch = line.match(/^\s+A:\s*(.*)$/)
      if (aMatch) {
        currentCard.back = aMatch[1].trim()
        return
      }
      const tMatch = line.match(/^\s+T:\s*(.*)$/)
      if (tMatch) {
        currentCard.type = tMatch[1].trim() || 'qa'
        return
      }
      const hMatch = line.match(/^\s+H:\s*(.*)$/)
      if (hMatch) {
        currentCard.hint = hMatch[1].trim()
      }
    }
  })
  flushCard()
  save(data)
  return count
}
