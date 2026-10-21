// 存储模式配置：管理本地存储与浏览器存储的边界与行为
// 默认模式（新模式）：只读取本地存储，不自动开设浏览器存储，彻底杜绝浏览器旧缓存覆盖替换本地文件造成丢失。
// 想要使用浏览器存储需要在设置里面手动打开。

export const STORAGE_CONFIG_KEY = 'SIMPLE_MIND_MAP_STORAGE_CONFIG'

export const DEFAULT_STORAGE_CONFIG = {
  enableBrowserStorage: false
}

// 跨组件通知存储模式变更事件名
export const STORAGE_CONFIG_CHANGE_EVENT = 'storage_config_change'

/**
 * 获取存储模式配置
 * @returns {{ enableBrowserStorage: boolean }}
 */
export const getStorageConfig = () => {
  try {
    if (typeof localStorage === 'undefined') {
      return { enableBrowserStorage: false }
    }
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY)
    if (!raw) {
      return { enableBrowserStorage: false }
    }
    const cfg = JSON.parse(raw)
    return {
      enableBrowserStorage: cfg && cfg.enableBrowserStorage === true
    }
  } catch (e) {
    return { enableBrowserStorage: false }
  }
}

/**
 * 判断是否开启了浏览器缓存存储（默认：false，即只读取本地存储，不自动开设浏览器存储）
 * @returns {boolean}
 */
export const isBrowserStorageEnabled = () => {
  return getStorageConfig().enableBrowserStorage === true
}

/**
 * 设置存储模式配置
 * @param {{ enableBrowserStorage?: boolean }} config
 * @returns {{ enableBrowserStorage: boolean }}
 */
export const setStorageConfig = (config = {}) => {
  try {
    const cur = getStorageConfig()
    const next = {
      ...cur,
      ...config
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(next))
    }
    return next
  } catch (e) {
    return { enableBrowserStorage: false }
  }
}
