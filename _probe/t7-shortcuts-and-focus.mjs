// 模拟浏览器环境
const listeners = {}
global.window = {
  addEventListener: (ev, fn) => {
    listeners[ev] = listeners[ev] || []
    listeners[ev].push(fn)
  },
  removeEventListener: (ev, fn) => {
    if (listeners[ev]) {
      listeners[ev] = listeners[ev].filter(f => f !== fn)
    }
  }
}
const lsData = {}
global.localStorage = {
  getItem: k => lsData[k] || null,
  setItem: (k, v) => { lsData[k] = String(v) },
  removeItem: k => { delete lsData[k] }
}

import KeyCommand from '../simple-mind-map/src/core/command/keyCommand.js'
import { getReviewShortcuts, saveReviewShortcuts, formatKeyEventToShortcut } from '../web/src/review/reviewShortcuts.js'

console.log('🧪 开始运行切屏失焦恢复与复习快捷键探针测试...')

// 1. 测试 KeyCommand 切屏与恢复
const fakeRenderer = { activeNodeList: [] }
const fakeMindMap = {
  opt: { enableShortcutOnlyWhenMouseInSvg: true },
  renderer: fakeRenderer,
  editNodeClassList: ['smm-node'],
  on: () => {}
}

const kc = new KeyCommand({ mindMap: fakeMindMap })

// 初始状态
if (kc.isInSvg !== false) throw new Error('初始 isInSvg 应为 false')

// 模拟选中节点时触发切屏 (blur)
fakeRenderer.activeNodeList = [{ uid: 'node_1' }]
kc.onWindowBlur()
if (kc.isInSvg !== false) throw new Error('window blur 后 isInSvg 应被重置为 false')

// 模拟切回窗口 (focus)
kc.onWindowFocus()
if (kc.isInSvg !== true) throw new Error('有激活节点时切回窗口，isInSvg 应被自动校准为 true')

// 测试快捷键触发
let triggered = false
kc.addShortcut('Alt+r', () => {
  triggered = true
})

kc.onKeydown({
  target: { classList: { contains: () => false } }, // 非 input
  keyCode: 82, // 'r'
  altKey: true,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  stopPropagation: () => {},
  preventDefault: () => {}
})

if (!triggered) throw new Error('Alt+r 快捷键未能正确触发！')
console.log('✅ 测试 1 通过：切屏失焦后自动校准焦点状态，键盘快捷键顺利恢复并执行')

// 2. 测试快捷键格式化器
const mockEvent1 = { keyCode: 82, altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }
const str1 = formatKeyEventToShortcut(mockEvent1)
if (str1 !== 'Alt + r') throw new Error(`formatKeyEventToShortcut 预期 "Alt + r"，实际 "${str1}"`)

const mockEvent2 = { keyCode: 49, altKey: true, ctrlKey: true, shiftKey: true, metaKey: false }
const str2 = formatKeyEventToShortcut(mockEvent2)
if (str2 !== 'Control + Alt + Shift + 1') throw new Error(`formatKeyEventToShortcut 预期 "Control + Alt + Shift + 1"，实际 "${str2}"`)
console.log('✅ 测试 2 通过：多键组合格式化（Alt+R, Ctrl+Alt+Shift+1）正确解析')

// 3. 测试默认配置与自定义保存
const defaults = getReviewShortcuts()
if (!defaults.toggleReview || !defaults.openReviewDialog) throw new Error('默认复习快捷键不完整')

saveReviewShortcuts({ toggleReview: 'Control + Alt + r' })
const modified = getReviewShortcuts()
if (modified.toggleReview !== 'Control + Alt + r') throw new Error('自定义快捷键保存失败')
console.log('✅ 测试 3 通过：复习快捷键自定义持久化正常')

console.log('🎉 所有切屏与快捷键测试全部通过 (3/3)！')
