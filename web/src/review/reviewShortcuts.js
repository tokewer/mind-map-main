// 复习快捷键统一管理服务
// 职责：
// 1. 默认快捷键映射配置、全局开关与持久化
// 2. 快捷键按键格式化、规范化与冲突检测
// 3. 统一 keydown 事件监听与分发（支持全局开/关、可编辑输入保护、模式作用域校验）
// 4. 与思维导图及浏览器原生行为的隔离保护

export const STORAGE_KEY = 'MIND_MAP_REVIEW_SHORTCUTS'

// 复习动作定义字典与默认键位
export const REVIEW_ACTION_DEFS = [
  {
    key: 'showAnswer',
    name: '显示答案 / 翻转卡片',
    desc: '在拷问页面揭示当前卡片的答案',
    defaultKey: 'Space',
    scope: 'quiz', // 仅在拷问页面生效
    icon: '💡'
  },
  {
    key: 'prevCard',
    name: '上一张卡片',
    desc: '在当前节点的多张卡片中查看上一张',
    defaultKey: 'Left',
    scope: 'quiz',
    icon: '⬅️'
  },
  {
    key: 'nextCard',
    name: '下一张卡片 / 跳过',
    desc: '在当前节点的多张卡片中查看下一张',
    defaultKey: 'Right',
    scope: 'quiz',
    icon: '➡️'
  },
  {
    key: 'rateForgot',
    name: '评价：忘记',
    desc: '已揭示答案时评价：忘记（重新开始，今天再复习）',
    defaultKey: '1',
    scope: 'quiz',
    icon: '😰'
  },
  {
    key: 'rateFuzzy',
    name: '评价：模糊',
    desc: '已揭示答案时评价：模糊（间隔减半）',
    defaultKey: '2',
    scope: 'quiz',
    icon: '🤔'
  },
  {
    key: 'rateRemember',
    name: '评价：记得',
    desc: '已揭示答案时评价：记得（推进周期）',
    defaultKey: '3',
    scope: 'quiz',
    icon: '✅'
  },
  {
    key: 'rateMastered',
    name: '评价：熟练',
    desc: '已揭示答案时评价：熟练 / 强化掌握（直接进入已掌握或跳跃推进）',
    defaultKey: '4',
    scope: 'quiz',
    icon: '🌟'
  },
  {
    key: 'exitQuiz',
    name: '退出拷问',
    desc: '退出当前复习拷问会话',
    defaultKey: 'Esc',
    scope: 'quiz',
    icon: '🚪'
  },
  {
    key: 'openQuiz',
    name: '进入今日复习拷问',
    desc: '启动今日待复习任务的卡片拷问流程',
    defaultKey: 'Alt + s',
    scope: 'global', // 全局或导图页可用
    icon: '🚀'
  },
  {
    key: 'toggleReview',
    name: '加入 / 移出复习',
    desc: '选中思维导图节点后加入或移出复习计划',
    defaultKey: 'Alt + r',
    scope: 'map', // 仅导图编辑区生效
    icon: '🔄'
  },
  {
    key: 'openReviewDialog',
    name: '打开复习详情',
    desc: '打开当前选中节点的复习管理弹窗',
    defaultKey: 'Alt + Shift + r',
    scope: 'map',
    icon: '📖'
  },
  {
    key: 'toggleFocus',
    name: '标记 / 取消重点',
    desc: '切换当前选中节点的星标重点复习状态',
    defaultKey: 'Alt + f',
    scope: 'map',
    icon: '⭐️'
  },
  {
    key: 'openCardManager',
    name: '管理当前节点卡片',
    desc: '打开当前选中节点的卡片管理与编辑弹窗',
    defaultKey: 'Alt + c',
    scope: 'map',
    icon: '📇'
  },
  {
    key: 'quickRemember',
    name: '导图快捷评价：记得',
    desc: '在导图中直接完成一次复习并推进周期',
    defaultKey: 'Alt + 1',
    scope: 'map',
    icon: '👍'
  },
  {
    key: 'quickFuzzy',
    name: '导图快捷评价：模糊',
    desc: '在导图中直接完成一次复习并缩短间隔',
    defaultKey: 'Alt + 2',
    scope: 'map',
    icon: '👌'
  },
  {
    key: 'quickForgot',
    name: '导图快捷评价：忘了',
    desc: '在导图中直接完成一次复习并重置周期',
    defaultKey: 'Alt + 3',
    scope: 'map',
    icon: '👎'
  }
]

// 浏览器保留键（禁止拦截或提示冲突）
export const BROWSER_RESERVED_SHORTCUTS = [
  'Control + r',
  'Control + Shift + r',
  'F5',
  'Control + F5',
  'Control + w',
  'Control + t',
  'Control + n',
  'Control + Shift + n',
  'Control + q',
  'Control + p',
  'Control + u',
  'Control + l',
  'Control + d',
  'Control + h',
  'Control + j',
  'Alt + Left',
  'Alt + Right',
  'F12',
  'Control + Shift + i',
  'Control + Shift + j',
  'Control + Shift + c',
  'Cmd + r',
  'Cmd + Shift + r',
  'Cmd + w',
  'Cmd + t',
  'Cmd + q'
]

// 默认快捷键字典配置
export const DEFAULT_REVIEW_SHORTCUTS = REVIEW_ACTION_DEFS.reduce((acc, def) => {
  acc[def.key] = def.defaultKey
  return acc
}, {})

// 默认完整配置对象
export const DEFAULT_SHORTCUT_CONFIG = {
  enabled: true,
  shortcuts: { ...DEFAULT_REVIEW_SHORTCUTS }
}

// 获取规范化键位字符串
export const normalizeShortcutKey = keyStr => {
  if (!keyStr || typeof keyStr !== 'string') return ''
  const trimmed = keyStr.trim()
  if (!trimmed) return ''
  // 统一空格分隔符 "Ctrl+Alt+r" -> "Ctrl + Alt + r"
  const tokens = trimmed.split(/\s*\+\s*/).filter(Boolean)
  const mods = []
  let mainKey = ''
  tokens.forEach(tok => {
    const lower = tok.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') {
      if (!mods.includes('Control')) mods.push('Control')
    } else if (lower === 'alt') {
      if (!mods.includes('Alt')) mods.push('Alt')
    } else if (lower === 'shift') {
      if (!mods.includes('Shift')) mods.push('Shift')
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      if (!mods.includes('Cmd')) mods.push('Cmd')
    } else {
      mainKey = tok
    }
  })
  // 标准主键大小写规整
  if (mainKey) {
    if (mainKey.length === 1 && /[a-zA-Z]/.test(mainKey)) {
      mainKey = mainKey.toLowerCase()
    } else if (/^f\d{1,2}$/i.test(mainKey)) {
      mainKey = mainKey.toUpperCase()
    } else {
      const standardNames = {
        space: 'Space',
        spacebar: 'Space',
        esc: 'Esc',
        escape: 'Esc',
        enter: 'Enter',
        return: 'Enter',
        tab: 'Tab',
        backspace: 'Backspace',
        delete: 'Delete',
        del: 'Del',
        up: 'Up',
        arrowup: 'Up',
        down: 'Down',
        arrowdown: 'Down',
        left: 'Left',
        arrowleft: 'Left',
        right: 'Right',
        arrowright: 'Right'
      }
      mainKey = standardNames[mainKey.toLowerCase()] || mainKey
    }
    return [...mods, mainKey].join(' + ')
  }
  return mods.join(' + ')
}

// 读取存储的配置
export const getReviewShortcutConfig = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) {
      return {
        enabled: true,
        shortcuts: { ...DEFAULT_REVIEW_SHORTCUTS }
      }
    }
    const parsed = JSON.parse(raw)
    // 兼容旧格式：旧格式直接存储键值对对象 { toggleReview: "Alt + r", ... }
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.enabled === 'boolean' && parsed.shortcuts) {
        return {
          enabled: parsed.enabled,
          shortcuts: {
            ...DEFAULT_REVIEW_SHORTCUTS,
            ...(parsed.shortcuts || {})
          }
        }
      }
      // 旧格式迁移
      return {
        enabled: true,
        shortcuts: {
          ...DEFAULT_REVIEW_SHORTCUTS,
          ...parsed
        }
      }
    }
    return {
      enabled: true,
      shortcuts: { ...DEFAULT_REVIEW_SHORTCUTS }
    }
  } catch (e) {
    return {
      enabled: true,
      shortcuts: { ...DEFAULT_REVIEW_SHORTCUTS }
    }
  }
}

// 兼容老调用：直接返回 shortcuts 键值对对象
export const getReviewShortcuts = () => {
  return getReviewShortcutConfig().shortcuts
}

// 保存快捷键配置
export const saveReviewShortcutConfig = config => {
  try {
    const current = getReviewShortcutConfig()
    const next = {
      enabled: typeof config.enabled === 'boolean' ? config.enabled : current.enabled,
      shortcuts: {
        ...current.shortcuts,
        ...(config.shortcuts || {})
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
    return next
  } catch (e) {
    console.error('Failed to save review shortcut config', e)
    return getReviewShortcutConfig()
  }
}

// 保存特定键位（兼容旧接口）
export const saveReviewShortcuts = shortcuts => {
  const current = getReviewShortcutConfig()
  const updated = saveReviewShortcutConfig({
    enabled: current.enabled,
    shortcuts: { ...current.shortcuts, ...(shortcuts || {}) }
  })
  return updated.shortcuts
}

// 恢复默认快捷键
export const resetReviewShortcuts = () => {
  const fresh = {
    enabled: true,
    shortcuts: { ...DEFAULT_REVIEW_SHORTCUTS }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    }
  } catch (e) {}
  return fresh.shortcuts
}

// 设置全局快捷键启用/禁用
export const setReviewShortcutsEnabled = enabled => {
  return saveReviewShortcutConfig({ enabled: !!enabled })
}

// 将原生键盘事件转为标准快捷键字符串
export const formatKeyEventToShortcut = e => {
  if (!e) return ''
  const parts = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Cmd')

  const code = e.keyCode
  // 排除单纯按修饰键
  if ([16, 17, 18, 91, 93, 224].includes(code)) {
    return parts.join(' + ')
  }

  let mainKey = ''
  if (code >= 65 && code <= 90) {
    // 字母
    mainKey = String.fromCharCode(code).toLowerCase()
  } else if (code >= 48 && code <= 57) {
    // 主键盘数字
    mainKey = String.fromCharCode(code)
  } else if (code >= 96 && code <= 105) {
    // 小键盘数字 0-9
    mainKey = String(code - 96)
  } else if (code >= 112 && code <= 123) {
    // F1 - F12
    mainKey = 'F' + (code - 111)
  } else {
    const specialKeys = {
      8: 'Backspace',
      9: 'Tab',
      13: 'Enter',
      27: 'Esc',
      32: 'Space',
      37: 'Left',
      38: 'Up',
      39: 'Right',
      40: 'Down',
      46: 'Delete',
      187: '=',
      189: '-',
      190: '.',
      191: '/',
      192: '`'
    }
    mainKey = specialKeys[code] || e.key || ''
    if (mainKey === ' ' || mainKey === 'Spacebar') mainKey = 'Space'
  }

  if (mainKey && !parts.includes(mainKey)) {
    parts.push(mainKey)
  }

  return parts.join(' + ')
}

// 快捷键冲突检测
export const checkShortcutConflict = (targetActionKey, keyStr, currentShortcuts = {}) => {
  const normalized = normalizeShortcutKey(keyStr)
  if (!normalized) {
    return { hasConflict: false }
  }

  // 1. 检查是否与浏览器重要保留键冲突
  const isBrowserReserved = BROWSER_RESERVED_SHORTCUTS.some(
    res => normalizeShortcutKey(res).toLowerCase() === normalized.toLowerCase()
  )
  if (isBrowserReserved) {
    return {
      hasConflict: true,
      type: 'browser',
      message: `按键「${normalized}」为浏览器系统保留组合键，可能会被浏览器拦截`
    }
  }

  // 2. 检查与同作用域或互斥复习操作之间的冲突
  const targetDef = REVIEW_ACTION_DEFS.find(d => d.key === targetActionKey)
  const targetScope = targetDef ? targetDef.scope : 'global'

  for (const def of REVIEW_ACTION_DEFS) {
    if (def.key === targetActionKey) continue
    const otherKey = currentShortcuts[def.key]
    if (!otherKey) continue
    if (normalizeShortcutKey(otherKey).toLowerCase() === normalized.toLowerCase()) {
      // 若处于相同作用域，或者其中一个是 global，则视为真冲突
      if (
        def.scope === targetScope ||
        def.scope === 'global' ||
        targetScope === 'global'
      ) {
        return {
          hasConflict: true,
          type: 'review_action',
          conflictedWith: def.name,
          message: `按键「${normalized}」与「${def.name}」快捷键冲突`
        }
      }
    }
  }

  return { hasConflict: false }
}

// 判断当前事件目标是否为可输入表单元素（避免拦截用户文字输入）
export const isInputElement = el => {
  if (!el || !el.tagName) return false
  const tagName = el.tagName.toUpperCase()
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true
  }
  if (el.isContentEditable) {
    return true
  }
  // 检查是否在 Element UI 或富文本编辑器内
  if (el.closest && (el.closest('.el-input') || el.closest('.el-textarea') || el.closest('.toastui-editor-defaultUI'))) {
    return true
  }
  return false
}

// 全局复习快捷键分发调度器（单例模式）
export class ReviewShortcutDispatcher {
  constructor() {
    this.handlers = new Map() // scope -> Map(actionKey -> callback)
    this.currentScope = 'map' // 当前页面环境：'quiz' (拷问中), 'map' (思维导图), 'review_page' (复习中心), 'none'
    this.isRecording = false // 用户正在设置界面录制按键时暂停分发
    this.isListening = false
    this.boundKeydown = this.onKeydown.bind(this)
  }

  init() {
    if (typeof window === 'undefined' || this.isListening) return
    window.addEventListener('keydown', this.boundKeydown, { capture: true })
    this.isListening = true
  }

  destroy() {
    if (typeof window === 'undefined' || !this.isListening) return
    window.removeEventListener('keydown', this.boundKeydown, { capture: true })
    this.isListening = false
    this.handlers.clear()
  }

  setScope(scope) {
    this.currentScope = scope || 'none'
  }

  setRecording(recording) {
    this.isRecording = !!recording
  }

  register(scope, actionKey, handler) {
    if (!this.handlers.has(scope)) {
      this.handlers.set(scope, new Map())
    }
    this.handlers.get(scope).set(actionKey, handler)
  }

  unregister(scope, actionKey) {
    if (this.handlers.has(scope)) {
      this.handlers.get(scope).delete(actionKey)
    }
  }

  onKeydown(e) {
    // 正在录制按键或不可响应时跳过
    if (this.isRecording) return

    // 检查总开关
    const config = getReviewShortcutConfig()
    if (!config.enabled) return

    // 检查是否在可编辑文本区域内
    if (isInputElement(e.target)) {
      // 允许在输入框中按 Esc 退出某些弹窗，但不拦截普通字符
      if (e.keyCode !== 27) return
    }

    const currentKeyStr = formatKeyEventToShortcut(e)
    if (!currentKeyStr) return
    const normalizedKey = normalizeShortcutKey(currentKeyStr).toLowerCase()

    // 遍历已配置快捷键寻找匹配
    const shortcuts = config.shortcuts || {}
    for (const def of REVIEW_ACTION_DEFS) {
      const binding = shortcuts[def.key]
      if (!binding) continue
      if (normalizeShortcutKey(binding).toLowerCase() === normalizedKey) {
        // 校验作用域
        // 如果当前是拷问页面：仅响应 scope==='quiz' 或 scope==='global'
        // 如果当前是导图页面：仅响应 scope==='map' 或 scope==='global'
        // 如果当前是复习主页：响应 scope==='global'
        let scopeMatches = false
        if (def.scope === 'global') {
          scopeMatches = true
        } else if (def.scope === this.currentScope) {
          scopeMatches = true
        }

        if (scopeMatches) {
          // 查找处理器并执行
          let handler = null
          if (this.handlers.has(this.currentScope) && this.handlers.get(this.currentScope).has(def.key)) {
            handler = this.handlers.get(this.currentScope).get(def.key)
          } else if (this.handlers.has('global') && this.handlers.get('global').has(def.key)) {
            handler = this.handlers.get('global').get(def.key)
          }

          if (handler && typeof handler === 'function') {
            if (typeof e.preventDefault === 'function') e.preventDefault()
            if (typeof e.stopPropagation === 'function') e.stopPropagation()
            try {
              handler(e)
            } catch (err) {
              console.error(`Error executing review shortcut [${def.key}]`, err)
            }
            return
          }
        }
      }
    }
  }
}

export const reviewShortcutDispatcher = new ReviewShortcutDispatcher()
if (typeof window !== 'undefined') {
  reviewShortcutDispatcher.init()
}

export default {
  STORAGE_KEY,
  REVIEW_ACTION_DEFS,
  DEFAULT_REVIEW_SHORTCUTS,
  DEFAULT_SHORTCUT_CONFIG,
  getReviewShortcutConfig,
  getReviewShortcuts,
  saveReviewShortcutConfig,
  saveReviewShortcuts,
  resetReviewShortcuts,
  setReviewShortcutsEnabled,
  formatKeyEventToShortcut,
  normalizeShortcutKey,
  checkShortcutConflict,
  isInputElement,
  reviewShortcutDispatcher
}
