// 探针用 Vue 桩：提供一个可真实工作的 $bus，使组件之间的 setData 等事件真正串联。
const handlers = {}

const bus = {
  $on(name, fn) {
    ;(handlers[name] = handlers[name] || []).push(fn)
  },
  $off(name, fn) {
    if (!handlers[name]) return
    if (!fn) {
      delete handlers[name]
      return
    }
    handlers[name] = handlers[name].filter(f => f !== fn)
  },
  $emit(name, ...args) {
    if (globalThis.__PROBE) {
      globalThis.__PROBE.events.push({ name, argc: args.length })
    }
    ;[...(handlers[name] || [])].forEach(fn => fn(...args))
  }
}

export const resetBus = () => {
  Object.keys(handlers).forEach(k => delete handlers[k])
}
export const busHandlerCount = () => Object.values(handlers).reduce((n, l) => n + l.length, 0)

const Vue = {
  use() {},
  prototype: {
    $bus: bus,
    getCurrentData: () => (globalThis.__PROBE ? globalThis.__PROBE.currentData : null)
  }
}
export default Vue
