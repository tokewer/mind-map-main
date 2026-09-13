// 探针用 element-ui 桩：Loading 需能记录开启/关闭次数，用于验证遮罩泄漏
export const Notification = Object.assign(() => {}, { closeAll() {} })

// 日志挂到 globalThis，保证跨 bundle 边界也能观测到（模块实例不共享）
const log = () => (globalThis.__LOADING_LOG = globalThis.__LOADING_LOG || [])

export const Loading = {
  service(opts) {
    const instance = {
      opts,
      closed: false,
      close() {
        if (this.closed) return
        this.closed = true
        log().push({ action: 'close', open: (globalThis.__LOADING_OPEN = globalThis.__LOADING_OPEN || 0) })
      }
    }
    globalThis.__LOADING_OPEN = (globalThis.__LOADING_OPEN || 0) + 1
    instance.id = globalThis.__LOADING_OPEN
    log().push({ action: 'open', id: instance.id })
    return instance
  }
}
export default { Notification, Loading }
