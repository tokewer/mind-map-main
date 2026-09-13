// 探针运行时环境：localStorage / fetch / File System Access / Date 可控
import { createFakeFs } from './stubs/fakeFs.mjs'
import { TextEncoder as TextEncoderPolyfill } from 'node:util'

export const sleep = ms => new Promise(r => setTimeout(r, ms))

// 空转：把所有已排队的微任务与定时器（<=maxMs 的）都跑完
export const settle = async (maxMs = 30) => {
  await sleep(maxMs)
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

export const createLocalStorage = () => {
  const map = new Map()
  return {
    map,
    get length() {
      return map.size
    },
    key: i => [...map.keys()][i],
    getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => {
      map.set(String(k), String(v))
    },
    removeItem: k => {
      map.delete(String(k))
    },
    clear: () => map.clear(),
    dump: () => Object.fromEntries(map)
  }
}

// 安装全局环境。serverKeys 为「磁盘镜像」的键值（模拟 data/ 目录）
export const installEnv = (opts = {}) => {
  const ls = createLocalStorage()
  const fsState = createFakeFs({ delay: opts.fsDelay || 0 })
  if (opts.seedFs) Object.entries(opts.seedFs).forEach(([p, c]) => fsState.seed(p, c))

  const serverKeys = opts.serverKeys || null // null = 服务不可用
  const fetchLog = []
  const xhrLog = []

  globalThis.localStorage = ls
  globalThis.URL = { createObjectURL: () => 'blob:fake/' + Math.random().toString(36).slice(2), revokeObjectURL() {} }
  globalThis.Blob = class Blob {
    constructor(parts) {
      this._parts = parts
    }
    get size() {
      return 1
    }
  }
  globalThis.TextEncoder = globalThis.TextEncoder || TextEncoderPolyfill
  globalThis.XMLHttpRequest = class {
    open(method, url) {
      this._url = url
    }
    send() {
      xhrLog.push(this._url)
      if (serverKeysRef.value === null) {
        this.status = 0
        throw new Error('network down')
      }
      this.status = 200
      this.responseText = JSON.stringify({ ok: true, keys: serverKeysRef.value })
    }
  }
  globalThis.fetch = async (url, init) => {
    fetchLog.push({ url, init })
    if (String(url).includes('/api/storage')) {
      if (init && init.method === 'POST') {
        const body = JSON.parse(init.body)
        // 模拟服务端全量写入
        if (serverKeysRef.value) {
          Object.assign(serverKeysRef.value, body.keys || {})
          ;(body.remove || []).forEach(k => delete serverKeysRef.value[k])
        }
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (serverKeysRef.value === null) throw new Error('network down')
      return { ok: true, json: async () => ({ ok: true, keys: serverKeysRef.value }) }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  }
  globalThis.window = globalThis
  globalThis.FileReader = class {
    readAsText(file) {
      Promise.resolve(file.text()).then(t => {
        this.result = t
        if (this.onload) this.onload()
      })
    }
  }
  const winListeners = {}
  globalThis.__WINLISTENERS = winListeners
  globalThis.addEventListener = (name, fn) => {
    ;(winListeners[name] = winListeners[name] || []).push(fn)
  }
  globalThis.removeEventListener = (name, fn) => {
    if (winListeners[name]) winListeners[name] = winListeners[name].filter(f => f !== fn)
  }
  globalThis.dispatchWindowEvent = (name, arg) => {
    ;[...(winListeners[name] || [])].forEach(fn => fn(arg))
  }
  globalThis.innerWidth = 1440
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
  globalThis.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, click() {} }),
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    removeEventListener() {}
  }
  globalThis.showDirectoryPicker = async () => fsState.root
  globalThis.showOpenFilePicker = async () => [fsState.root]
  globalThis.showSaveFilePicker = async () => fsState.root

  // 模拟「服务在会话中途恢复」：之后 fetch/XHR 都能拿到磁盘镜像内容
  const restoreServer = keys => {
    serverKeysRef.value = keys
  }
  const serverKeysRef = { value: serverKeys }

  const PROBE = {
    state: {
      isHandleLocalFile: false,
      isDirectoryMode: false,
      directoryName: '',
      currentSmmFile: '',
      directorySaveStatus: '',
      localConfig: {}
    },
    events: [],
    busHandlers: {},
    mindMapHandlers: {},
    currentData: null
  }
  globalThis.__PROBE = PROBE

  return { ls, fs: fsState, fetchLog, xhrLog, PROBE, serverKeys: serverKeysRef.value, restoreServer }
}
