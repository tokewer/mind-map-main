// Mock 基础浏览器全局变量供 bun test 使用
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
  createEvent: () => ({
    initEvent: () => {},
    timeStamp: 0
  }),
  addEventListener: () => {},
  removeEventListener: () => {}
}
globalThis.window = globalThis
globalThis.navigator = { userAgent: 'node' }
