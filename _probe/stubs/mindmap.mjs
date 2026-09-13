// 探针用 simple-mind-map 桩：保留关键语义（handleData 空对象返回 null、
// setData/setFullData 流程、node_tree_render_end 事件），以便真实复现上层时序。
export default class MindMap {
  static usePlugin() {
    return MindMap
  }
  constructor(opts = {}) {
    this.opts = opts
    this.renderTree = null
    this._handlers = {}
    this.renderCount = 0
    this.view = { reset() {} }
    this.renderer = {
      setData: d => {
        this.renderTree = this.handleData(d)
      },
      activeNodeList: [],
      findNodeByUid: () => null,
      expandToNodeUid: (uid, cb) => cb && cb(),
      clearActiveNodeList() {},
      textEdit: { show() {}, hideEditTextBox() {} },
      hasRichTextPlugin: () => false
    }
    this.keyCommand = { addShortcut: () => {} }
    this.command = {}
    if (opts.data) this.renderTree = opts.data
  }
  // 与 simple-mind-map 真实实现一致：undefined / 空对象 → null
  handleData(data) {
    if (data === undefined || data === null) return null
    if (typeof data === 'object' && Object.keys(data).length <= 0) return null
    return data
  }
  on(name, fn) {
    ;(this._handlers[name] = this._handlers[name] || []).push(fn)
  }
  emit(name, ...args) {
    ;(this._handlers[name] || []).forEach(fn => fn(...args))
    if (globalThis.__PROBE) {
      const extra = globalThis.__PROBE.mindMapHandlers && globalThis.__PROBE.mindMapHandlers[name]
      ;(extra || []).forEach(fn => fn(...args))
    }
  }
  setData(data) {
    this.renderer.setData(data)
    this.render()
  }
  setFullData(data) {
    if (!data || !data.root) {
      this.setData(data)
      return
    }
    this.renderer.setData(data.root)
    this.layout = data.layout
    this.theme = data.theme
    this.viewData = data.view
    this.render()
  }
  render() {
    this.renderCount++
    setTimeout(() => {
      this.emit('node_tree_render_end')
    }, 0)
  }
  reRender() {
    this.render()
  }
  getData() {
    return {
      root: this.renderTree,
      layout: this.layout || this.opts.layout,
      theme: this.theme || { template: this.opts.theme, config: this.opts.themeConfig },
      view: this.viewData || this.opts.viewData
    }
  }
  getConfig() {
    return { layout: this.layout || this.opts.layout }
  }
  addPlugin() {}
  removePlugin() {}
  destroy() {}
  resize() {}
  execCommand() {}
  usePlugin() {
    return this.constructor
  }
}
