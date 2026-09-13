// 探针用 simple-mind-map/src/utils/index 桩
export const simpleDeepClone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
export const throttle = fn => {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), 0)
  }
}
export const isMobile = () => false
export const createUid = () => 'uid_' + Math.random().toString(36).slice(2, 10)
export const copyRenderTree = (obj, tree) => {
  if (!tree) return obj
  return JSON.parse(
    JSON.stringify(tree, (k, v) => (k === '_node' || k === '_generalizationNode' ? undefined : v))
  )
}
