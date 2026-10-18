import { describe, expect, test, beforeEach } from 'bun:test'

// Mock 基础浏览器环境
const memoryStorage = {}
globalThis.localStorage = {
  getItem: key => (key in memoryStorage ? memoryStorage[key] : null),
  setItem: (key, val) => {
    memoryStorage[key] = String(val)
  },
  removeItem: key => {
    delete memoryStorage[key]
  },
  clear: () => {
    Object.keys(memoryStorage).forEach(k => delete memoryStorage[k])
  }
}
globalThis.document = {
  documentElement: {
    requestFullScreen: () => {},
    style: {}
  },
  createElement: () => ({ style: {} }),
  addEventListener: () => {},
  removeEventListener: () => {}
}
globalThis.window = globalThis

// 引入被测试模块
import {
  REVIEW_ACTION_DEFS,
  DEFAULT_REVIEW_SHORTCUTS,
  getReviewShortcutConfig,
  saveReviewShortcutConfig,
  setReviewShortcutsEnabled,
  resetReviewShortcuts,
  formatKeyEventToShortcut,
  checkShortcutConflict,
  isInputElement,
  ReviewShortcutDispatcher
} from '../web/src/review/reviewShortcuts.js'

import {
  RATING,
  addReview,
  rateReview,
  removeReview,
  getNode,
  getArchivedNode,
  transferReviewProgress,
  importReviewData
} from '../web/src/review/index.js'

describe('复习快捷键配置与调度测试 (reviewShortcuts)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('初始加载默认配置', () => {
    const config = getReviewShortcutConfig()
    expect(config.enabled).toBe(true)
    expect(config.shortcuts.showAnswer).toBe('Space')
    expect(config.shortcuts.rateForgot).toBe('1')
    expect(config.shortcuts.rateMastered).toBe('4')
    expect(config.shortcuts.toggleReview).toBe('Alt + r')
  })

  test('向下兼容旧版纯对象格式', () => {
    localStorage.setItem('MIND_MAP_REVIEW_SHORTCUTS', JSON.stringify({
      toggleReview: 'Ctrl + Shift + R'
    }))
    const config = getReviewShortcutConfig()
    expect(config.enabled).toBe(true)
    expect(config.shortcuts.toggleReview).toBe('Ctrl + Shift + R')
    expect(config.shortcuts.showAnswer).toBe('Space') // 补充缺失项
  })

  test('全局开关设置与保存', () => {
    const disabledConfig = setReviewShortcutsEnabled(false)
    expect(disabledConfig.enabled).toBe(false)

    const reloaded = getReviewShortcutConfig()
    expect(reloaded.enabled).toBe(false)

    const enabledConfig = setReviewShortcutsEnabled(true)
    expect(enabledConfig.enabled).toBe(true)
  })

  test('恢复默认快捷键', () => {
    saveReviewShortcutConfig({
      enabled: false,
      shortcuts: { showAnswer: 'Enter' }
    })
    const restored = resetReviewShortcuts()
    expect(restored.showAnswer).toBe('Space')
    expect(getReviewShortcutConfig().enabled).toBe(true)
  })

  test('键盘事件格式化 formatKeyEventToShortcut', () => {
    // 单键 Space
    expect(formatKeyEventToShortcut({
      keyCode: 32,
      key: ' ',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })).toBe('Space')

    // 单键 Enter
    expect(formatKeyEventToShortcut({
      keyCode: 13,
      key: 'Enter',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })).toBe('Enter')

    // 组合键 Alt + r
    expect(formatKeyEventToShortcut({
      keyCode: 82,
      key: 'r',
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false
    })).toBe('Alt + r')

    // 方向键 ArrowLeft -> Left
    expect(formatKeyEventToShortcut({
      keyCode: 37,
      key: 'ArrowLeft',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })).toBe('Left')
  })

  test('快捷键冲突检测 checkShortcutConflict', () => {
    const currentShortcuts = {
      showAnswer: 'Space',
      nextCard: 'ArrowRight',
      toggleReview: 'Alt + r'
    }

    // 1. 浏览器保留快捷键冲突检测 (如 Ctrl + R)
    const browserConflict = checkShortcutConflict('toggleReview', 'Ctrl + R', currentShortcuts)
    expect(browserConflict.hasConflict).toBe(true)
    expect(browserConflict.type).toBe('browser')

    // 2. 相同作用域重复冲突 (showAnswer 与 nextCard 都在 quiz 作用域)
    const sameScopeConflict = checkShortcutConflict('nextCard', 'Space', currentShortcuts)
    expect(sameScopeConflict.hasConflict).toBe(true)
    expect(sameScopeConflict.type).toBe('review_action')

    // 3. 不同作用域不冲突 (quiz 与 map 作用域)
    const diffScopeConflict = checkShortcutConflict('toggleReview', 'Space', currentShortcuts)
    expect(diffScopeConflict.hasConflict).toBe(false)
  })

  test('输入框元素保护判断 isInputElement', () => {
    expect(isInputElement(null)).toBe(false)
    expect(isInputElement({ tagName: 'DIV', isContentEditable: false })).toBe(false)
    expect(isInputElement({ tagName: 'INPUT' })).toBe(true)
    expect(isInputElement({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isInputElement({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  test('ReviewShortcutDispatcher 事件分发与作用域隔离', () => {
    const dispatcher = new ReviewShortcutDispatcher()
    dispatcher.init()

    let quizTriggered = false
    let mapTriggered = false

    dispatcher.register('quiz', 'showAnswer', () => {
      quizTriggered = true
    })
    dispatcher.register('map', 'toggleReview', () => {
      mapTriggered = true
    })

    // 处于 quiz 作用域时，仅 quiz 动作响应
    dispatcher.setScope('quiz')
    dispatcher.onKeydown({
      keyCode: 32,
      key: ' ',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      target: { tagName: 'DIV' },
      preventDefault: () => {}
    })
    expect(quizTriggered).toBe(true)

    // 切到 map 作用域时
    dispatcher.setScope('map')
    dispatcher.onKeydown({
      keyCode: 82,
      key: 'r',
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      target: { tagName: 'DIV' },
      preventDefault: () => {}
    })
    expect(mapTriggered).toBe(true)

    // 全局禁用时，不触发任何动作
    saveReviewShortcutConfig({ enabled: false })
    quizTriggered = false
    dispatcher.setScope('quiz')
    dispatcher.onKeydown({
      keyCode: 32,
      key: ' ',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      target: { tagName: 'DIV' },
      preventDefault: () => {}
    })
    expect(quizTriggered).toBe(false)
  })
})

describe('复习卡片与四级评价流程测试 (rateReview)', () => {
  beforeEach(() => {
    localStorage.clear()
    importReviewData('{"version":5,"nodes":{}}')
  })

  test('添加复习节点并记录卡片', () => {
    const node = addReview({
      uid: 'test_node_1',
      name: '计算机网络 TCP 三次握手',
      cycles: [1, 2, 4, 7, 15],
      cards: [
        {
          id: 'card_1',
          type: 'qa',
          front: 'TCP 第一次握手客户端发送什么报文？',
          back: 'SYN=1, seq=x'
        }
      ]
    })
    expect(node.uid).toBe('test_node_1')
    expect(node.cards.length).toBe(1)
    expect(node.status).toBe('new')
  })

  test('四级评价流转：记得 (REMEMBER) 推进周期', () => {
    addReview({
      uid: 'test_node_rem',
      name: '操作系统虚拟内存',
      cycles: [1, 3, 7]
    })

    const afterRate = rateReview('test_node_rem', RATING.REMEMBER)
    expect(afterRate).not.toBeNull()
    expect(afterRate.times).toBe(1)
    expect(afterRate.ratingHistory.length).toBe(1)
    expect(afterRate.ratingHistory[0].rating).toBe(RATING.REMEMBER)
  })

  test('四级评价流转：模糊 (FUZZY) 减半周期间隔', () => {
    addReview({
      uid: 'test_node_fuz',
      name: '快速排序时间复杂度',
      cycles: [2, 6, 14]
    })
    // 先走一次
    rateReview('test_node_fuz', RATING.REMEMBER)
    // 第二次模糊
    const afterFuzzy = rateReview('test_node_fuz', RATING.FUZZY)
    expect(afterFuzzy.ratingHistory.length).toBe(2)
    expect(afterFuzzy.ratingHistory[1].rating).toBe(RATING.FUZZY)
  })

  test('四级评价流转：忘记 (FORGOT) 记录错误', () => {
    addReview({
      uid: 'test_node_forg',
      name: '红黑树旋转规则',
      cycles: [1, 2, 4]
    })
    const afterForgot = rateReview('test_node_forg', RATING.FORGOT)
    expect(afterForgot.errorCount).toBe(1)
    expect(afterForgot.ratingHistory[0].rating).toBe(RATING.FORGOT)
  })

  test('四级评价流转：熟练 (MASTERED) 直接掌握并归档', () => {
    addReview({
      uid: 'test_node_mast',
      name: '二分查找基本模板',
      cycles: [1, 2, 4]
    })
    const afterMaster = rateReview('test_node_mast', RATING.MASTERED)
    expect(afterMaster.status).toBe('mastered')
    expect(afterMaster.nextReview).toBeNull()
    expect(afterMaster.mastery).toBe('mastered')
    expect(afterMaster.ratingHistory[0].rating).toBe(RATING.MASTERED)
  })
})

describe('恢复复习节点历史进度保留测试 (restoreReviewProgress)', () => {
  beforeEach(() => {
    localStorage.clear()
    importReviewData('{"version":6,"nodes":{},"archivedNodes":{}}')
  })

  test('移出复习后节点进入归档，不丢失进度与卡片', () => {
    const node = addReview({
      uid: 'node_prog_1',
      name: 'HTTP 缓存机制',
      cycles: [1, 2, 5],
      cards: [
        { id: 'c1', type: 'qa', front: '强缓存有哪些响应头？', back: 'Expires 与 Cache-Control' }
      ]
    })
    expect(node.uid).toBe('node_prog_1')

    // 完成两次复习并产生一次遗忘
    rateReview('node_prog_1', RATING.REMEMBER)
    rateReview('node_prog_1', RATING.FORGOT)

    const beforeRemove = getNode('node_prog_1')
    expect(beforeRemove.times).toBe(2)
    expect(beforeRemove.errorCount).toBe(1)
    expect(beforeRemove.cards.length).toBe(1)

    // 移出复习
    const removed = removeReview('node_prog_1')
    expect(removed).not.toBeNull()
    expect(removed.uid).toBe('node_prog_1')

    // 验证活动节点中已不存在，但在归档中完好保留
    expect(getNode('node_prog_1')).toBeNull()
    const archived = getArchivedNode('node_prog_1')
    expect(archived).not.toBeNull()
    expect(archived.times).toBe(2)
    expect(archived.errorCount).toBe(1)
    expect(archived.cards.length).toBe(1)
    expect(archived.cards[0].front).toBe('强缓存有哪些响应头？')
  })

  test('重新加入复习时自动保留并无缝恢复原进度', () => {
    addReview({
      uid: 'node_prog_2',
      name: 'Vue 响应式原理',
      cycles: [1, 3, 7],
      cards: [{ id: 'c_vue', type: 'qa', front: 'Vue 2 与 Vue 3 核心区别', back: 'Object.defineProperty vs Proxy' }]
    })
    rateReview('node_prog_2', RATING.REMEMBER)
    rateReview('node_prog_2', RATING.REMEMBER)

    // 移出复习
    removeReview('node_prog_2')
    expect(getNode('node_prog_2')).toBeNull()

    // 再次加入复习（未传 resetProgress 或传 false）
    const restored = addReview({
      uid: 'node_prog_2',
      name: 'Vue 响应式原理 (更新)'
    })

    expect(restored).not.toBeNull()
    expect(restored.restoredFromArchive).toBe(true)
    expect(restored.times).toBe(2) // 进度无缝保留，不是重置为 0
    expect(restored.cards.length).toBe(1) // 卡片未丢失
    expect(restored.cards[0].front).toBe('Vue 2 与 Vue 3 核心区别')
    expect(restored.name).toBe('Vue 响应式原理 (更新)')

    // 验证归档池中该项已清理
    expect(getArchivedNode('node_prog_2')).toBeNull()
  })

  test('显式指定 resetProgress=true 时，清除历史并从第 1 次全新开始', () => {
    addReview({
      uid: 'node_prog_3',
      name: 'Git Rebase 流程',
      cycles: [1, 2, 4]
    })
    rateReview('node_prog_3', RATING.REMEMBER)
    rateReview('node_prog_3', RATING.REMEMBER)

    removeReview('node_prog_3')

    // 重新加入但指定 resetProgress: true
    const fresh = addReview({
      uid: 'node_prog_3',
      name: 'Git Rebase 流程',
      resetProgress: true
    })

    expect(fresh.times).toBe(0)
    expect(fresh.restoredFromArchive).toBeUndefined()
    expect(getArchivedNode('node_prog_3')).toBeNull()
  })

  test('transferReviewProgress 支持回收站恢复节点进度平移', () => {
    addReview({
      uid: 'old_uid_123',
      name: '浏览器事件循环',
      cycles: [1, 3, 5],
      cards: [{ id: 'c_event', front: '宏任务与微任务顺序', back: '微任务优先于下一次宏任务' }]
    })
    rateReview('old_uid_123', RATING.REMEMBER)

    // 模拟思维导图节点删除并进入回收站，随后恢复生成新 uid
    removeReview('old_uid_123')
    const newUid = 'restored_uid_456'

    const success = transferReviewProgress('old_uid_123', newUid)
    expect(success).toBe(true)

    // 旧 uid 的归档不存在，新 uid 的归档已继承
    expect(getArchivedNode('old_uid_123')).toBeNull()
    const inheritedArchived = getArchivedNode('newUid' in {} ? '' : newUid)
    expect(inheritedArchived).not.toBeNull()
    expect(inheritedArchived.times).toBe(1)
    expect(inheritedArchived.cards[0].front).toBe('宏任务与微任务顺序')

    // 新 uid 重新加入复习
    const restoredNode = addReview({ uid: newUid, name: '浏览器事件循环' })
    expect(restoredNode.times).toBe(1)
    expect(restoredNode.cards.length).toBe(1)
  })
})

