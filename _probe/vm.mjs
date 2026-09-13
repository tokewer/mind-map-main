// 极简 Vue 组件实例 shim：足以驱动真实组件 methods（Edit/FileBar/ReviewFloat）
export const makeVm = (comp, ctx = {}) => {
  const vm = {
    $bus: ctx.bus,
    $store: ctx.store,
    $t: k => k,
    $nextTick: fn => Promise.resolve().then(() => fn && fn()),
    $forceUpdate: () => {},
    $message: Object.assign(() => {}, {
      success: () => {},
      warning: () => {},
      error: () => {},
      info: () => {}
    }),
    $notify: Object.assign(() => {}, { info: () => {}, warning: () => {}, error: () => {} }),
    $confirm: () => Promise.resolve(),
    $prompt: () => Promise.resolve({ value: '' }),
    $loading: () => ({ close() {} }),
    $createElement: () => ({}),
    $msgbox: () => {},
    $router: { push() {}, resolve: () => ({ href: '#' }) },
    $route: { query: {} },
    ...ctx.extra
  }
  const data = typeof comp.data === 'function' ? comp.data.call(vm) : {}
  Object.assign(vm, data)
  if (comp.computed) {
    Object.keys(comp.computed).forEach(k => {
      const fn = comp.computed[k]
      if (typeof fn !== 'function') return
      Object.defineProperty(vm, k, { get: () => fn.call(vm), configurable: true })
    })
  }
  Object.keys(comp.methods || {}).forEach(k => {
    vm[k] = comp.methods[k].bind(vm)
  })
  // 生命周期钩子（mounted / beforeDestroy 等）也挂上，便于测试按需调用
  ;['beforeCreate', 'created', 'beforeMount', 'mounted', 'beforeDestroy', 'destroyed'].forEach(h => {
    if (typeof comp[h] === 'function') vm[h] = comp[h].bind(vm)
  })
  return vm
}
