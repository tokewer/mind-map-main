// GitHub 云端自动同步模块
// 提供在浏览器端直接通过 GitHub REST API 读写仓库内容，安全、静默同步思维导图与复习数据

const STORAGE_CONFIG_KEY = 'MIND_MAP_GITHUB_SYNC_CONFIG'

const DEFAULT_CONFIG = {
  enabled: false,
  token: '',
  repo: 'tokewer/mind-map-main',
  branch: 'master',
  pathPrefix: 'data/'
}

// 获取 GitHub 同步配置
export const getGitHubSyncConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(raw)
    }
  } catch (e) {
    return { ...DEFAULT_CONFIG }
  }
}

// 保存 GitHub 同步配置
export const saveGitHubSyncConfig = config => {
  try {
    const next = {
      ...getGitHubSyncConfig(),
      ...(config || {})
    }
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(next))
    return next
  } catch (e) {
    console.error('Failed to save github sync config', e)
    return getGitHubSyncConfig()
  }
}

// Unicode 安全的 Base64 编码
export const utf8ToBase64 = str => {
  return window.btoa(unescape(encodeURIComponent(str)))
}

// Unicode 安全的 Base64 解码
export const base64ToUtf8 = b64 => {
  return decodeURIComponent(escape(window.atob(b64)))
}

// 获取远端文件信息（包括 SHA 与内容）
export const getRemoteFile = async (filePath) => {
  const config = getGitHubSyncConfig()
  if (!config.token || !config.repo) {
    throw new Error('未配置 GitHub Token 或仓库名')
  }
  const cleanPath = (config.pathPrefix + filePath).replace(/^\/+/, '')
  const url = `https://api.github.com/repos/${config.repo}/contents/${cleanPath}?ref=${config.branch || 'master'}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  })
  if (res.status === 404) {
    return null // 文件不存在
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `请求失败 HTTP ${res.status}`)
  }
  return await res.json()
}

// 上传/更新远端文件
export const uploadRemoteFile = async (filePath, contentStr, commitMessage = '') => {
  const config = getGitHubSyncConfig()
  if (!config.token || !config.repo) {
    throw new Error('未配置 GitHub Token 或仓库名')
  }
  const cleanPath = (config.pathPrefix + filePath).replace(/^\/+/, '')
  const url = `https://api.github.com/repos/${config.repo}/contents/${cleanPath}`

  // 先查当前文件的 SHA（如果存在则必须传 sha 才能更新）
  let sha = undefined
  try {
    const existing = await getRemoteFile(filePath)
    if (existing && existing.sha) {
      sha = existing.sha
    }
  } catch (e) {
    // 忽略获取错误，若不存在则为新建
  }

  const base64Content = utf8ToBase64(contentStr)
  const body = {
    message: commitMessage || `auto: sync ${filePath} from web [${new Date().toLocaleString()}]`,
    content: base64Content,
    branch: config.branch || 'master'
  }
  if (sha) {
    body.sha = sha
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `上传失败 HTTP ${res.status}`)
  }

  return await res.json()
}

let syncDebounceTimer = null

// 自动防抖同步思维导图与复习数据到 GitHub
export const triggerAutoGitHubSync = (getDataFn, getReviewDataFn) => {
  const config = getGitHubSyncConfig()
  if (!config.enabled || !config.token || !config.repo) return

  clearTimeout(syncDebounceTimer)
  syncDebounceTimer = setTimeout(async () => {
    try {
      if (typeof getDataFn === 'function') {
        const mapData = getDataFn()
        if (mapData) {
          await uploadRemoteFile('mindMap.json', JSON.stringify(mapData, null, 2), 'auto: sync mindMap data')
        }
      }
      if (typeof getReviewDataFn === 'function') {
        const reviewData = getReviewDataFn()
        if (reviewData) {
          await uploadRemoteFile('review.json', JSON.stringify(reviewData, null, 2), 'auto: sync review data')
        }
      }
      console.log('✅ GitHub 自动静默同步成功')
    } catch (e) {
      console.warn('⚠️ GitHub 自动同步失败:', e.message)
    }
  }, 3500)
}

export default {
  getGitHubSyncConfig,
  saveGitHubSyncConfig,
  getRemoteFile,
  uploadRemoteFile,
  triggerAutoGitHubSync
}
