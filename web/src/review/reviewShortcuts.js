// 复习快捷键默认配置与辅助方法
const DEFAULT_REVIEW_SHORTCUTS = {
  toggleReview: 'Alt + r', // 加入/移出复习
  openReviewDialog: 'Alt + Shift + r', // 打开复习详情/管理弹窗
  toggleFocus: 'Alt + f', // 标记/取消重点
  quickRemember: 'Alt + 1', // 快捷评价：记得
  quickFuzzy: 'Alt + 2', // 快捷评价：模糊
  quickForgot: 'Alt + 3' // 快捷评价：忘了
}

const STORAGE_KEY = 'MIND_MAP_REVIEW_SHORTCUTS'

// 获取复习快捷键配置
export const getReviewShortcuts = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_REVIEW_SHORTCUTS }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_REVIEW_SHORTCUTS,
      ...(parsed || {})
    }
  } catch (e) {
    return { ...DEFAULT_REVIEW_SHORTCUTS }
  }
}

// 保存复习快捷键配置
export const saveReviewShortcuts = shortcuts => {
  try {
    const next = {
      ...getReviewShortcuts(),
      ...(shortcuts || {})
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  } catch (e) {
    console.error('Failed to save review shortcuts', e)
    return getReviewShortcuts()
  }
}

// 重置复习快捷键为默认
export const resetReviewShortcuts = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {}
  return { ...DEFAULT_REVIEW_SHORTCUTS }
}

// 将键盘事件转换为标准快捷键字符串，例如 "Control + Alt + r"
export const formatKeyEventToShortcut = e => {
  if (!e) return ''
  const parts = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Cmd')

  const code = e.keyCode
  // 排除单纯按修饰键的情况
  if ([16, 17, 18, 91, 93, 224].includes(code)) {
    return parts.join(' + ')
  }

  let mainKey = ''
  // 字母 A-Z
  if (code >= 65 && code <= 90) {
    mainKey = String.fromCharCode(code).toLowerCase()
  } else if (code >= 48 && code <= 57) {
    // 数字 0-9
    mainKey = String.fromCharCode(code)
  } else if (code >= 112 && code <= 123) {
    // F1 - F12
    mainKey = 'F' + (code - 111)
  } else {
    const specialKeys = {
      8: 'Backspace',
      9: 'Tab',
      13: 'Enter',
      27: 'Esc',
      32: 'Spacebar',
      37: 'Left',
      38: 'Up',
      39: 'Right',
      40: 'Down',
      46: 'Del',
      187: '=',
      189: '-',
      190: '.',
      191: '/',
      192: '`'
    }
    mainKey = specialKeys[code] || e.key || ''
  }

  if (mainKey && !parts.includes(mainKey)) {
    parts.push(mainKey)
  }

  return parts.join(' + ')
}

export default {
  DEFAULT_REVIEW_SHORTCUTS,
  getReviewShortcuts,
  saveReviewShortcuts,
  resetReviewShortcuts,
  formatKeyEventToShortcut
}
