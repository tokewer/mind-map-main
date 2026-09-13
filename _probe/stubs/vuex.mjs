// 探针用 vuex 桩：提供真实可用的 Store（含 mutations 派发），使 store.js 可原样执行
export class Store {
  constructor(opts = {}) {
    this.state = opts.state || {}
    this._mutations = opts.mutations || {}
    this._actions = opts.actions || {}
    this.installed = true
  }
  commit(type, payload) {
    const fn = this._mutations[type]
    if (!fn) throw new Error('unknown mutation: ' + type)
    fn(this.state, payload)
  }
  dispatch() {
    return Promise.resolve()
  }
}
export const mapState = () => ({})
export default { Store, install() {} }
