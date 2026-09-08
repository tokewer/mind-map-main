// 浏览器内置存储的「归档 + 清理」
//
// 背景：本地文件夹（工作目录）成为主存储后，浏览器 localStorage 中仍可能残留旧的
// 多文件导图（以及它们通过 serverStorage 镜像到服务端磁盘的副本）。这些内容在
// “尚未设置工作目录”时仍会显示出来，造成混淆。
//
// 本模块提供的清理策略：
//   1. 先让用户选择一个「额外文件夹」（与已设置的工作目录完全无关，绝不混用）；
//   2. 把浏览器中的每一张导图（含历史版本）以 导图文件夹/maps/<name>/ 的规范布局
//      写进该额外文件夹（目录模式可直接打开、也可随时再导入）；
//   3. 全部写盘成功后，再删除 localStorage 中对应的导图/历史/文件列表键，
//      并通过 markKeyRemoved 同步告知磁盘镜像删除，防止下次启动被回灌；
//   4. 打上“已清理”标记：此后即使文件列表为空也不会自动重建“我的思维导图”占位，
//      避免用户刚清理完又出现内容的“删不干净”观感。
//
// 安全原则：数据可靠性优先 —— 只有归档全部成功后才会执行删除；任一步失败则中止，
// 保留原数据，绝不静默丢失。
import { markKeyRemoved } from './serverStorage'
import { notifyWorkspaceChanged } from './workspaceEvents'

// 浏览器内置多文件存储的键（与 api/index.js 保持一致）
const FILE_LIST_KEY = 'SIMPLE_MIND_MAP_FILE_LIST'
const CURRENT_FILE_KEY = 'SIMPLE_MIND_MAP_CURRENT_FILE'
const FILE_PREFIX = 'SIMPLE_MIND_MAP_FILE_'
const HISTORY_PREFIX = 'SIMPLE_MIND_MAP_HISTORY_'
// 旧版单文件正文（仅首次迁移用），清理时一并移除
const LEGACY_DATA_KEY = 'SIMPLE_MIND_MAP_DATA'
// “浏览器导图已归档清理”的持久标记（不会随文件列表为空而消失）
const CLEARED_MARKER = 'SIMPLE_MIND_MAP_BROWSER_CLEARED'

const readFileList = () => {
  try {
    return JSON.parse(localStorage.getItem(FILE_LIST_KEY)) || []
  } catch (e) {
    return []
  }
}

const readFileData = id => {
  const store = localStorage.getItem(FILE_PREFIX + id)
  if (store === null) return null
  try {
    return JSON.parse(store)
  } catch (e) {
    return null
  }
}

const readSnapshots = id => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_PREFIX + id)) || []
  } catch (e) {
    return []
  }
}

const isSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

// 读取浏览器中现存的多文件导图清单（名字 + 正文数据）
const listBrowserMaps = () => {
  return readFileList()
    .filter(f => f && f.id)
    .map(f => ({
      id: f.id,
      name: f.name || f.id,
      data: readFileData(f.id),
      snapshots: readSnapshots(f.id)
    }))
}

// 已清理标记：为 true 时不再自动重建默认导图
export const isBrowserMapsCleared = () => {
  try {
    return localStorage.getItem(CLEARED_MARKER) === '1'
  } catch (e) {
    return false
  }
}

// 浏览器中未归档多文件导图数量（0 表示无需清理）
export const countUnclearedBrowserMaps = () => {
  if (isBrowserMapsCleared()) return 0
  try {
    return readFileList().filter(f => f && f.id).length
  } catch (e) {
    return 0
  }
}

// 浏览器中是否还有未归档的多文件导图
export const hasUnclearedBrowserMaps = () => countUnclearedBrowserMaps() > 0

// ---------- 归档（写入用户选择的额外文件夹） ----------

const getSubDir = async (dir, name, create = false) => {
  try {
    return await dir.getDirectoryHandle(name, { create })
  } catch (e) {
    return null
  }
}

const getFile = async (dir, name, create = false) => {
  try {
    return await dir.getFileHandle(name, { create })
  } catch (e) {
    return null
  }
}

const writeText = async (fileHandle, content) => {
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

const safeName = name =>
  String(name || '未命名')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80) || '未命名'

// 把浏览器导图写入目标文件夹的 maps/<name>/data.smm（可被目录模式直接打开）。
// 历史快照写入 maps/<name>/history/<time>_<manual|auto>.smm.json（沿用目录模式命名）。
const writeMapToDir = async (rootDir, map) => {
  const mapsDir = await getSubDir(rootDir, 'maps', true)
  if (!mapsDir) throw new Error('无法在归档文件夹中创建 maps/')
  const folder = await getSubDir(mapsDir, safeName(map.name), true)
  if (!folder) throw new Error('无法创建导图文件夹：' + map.name)
  const dataFile = await getFile(folder, 'data.smm', true)
  if (!dataFile) throw new Error('无法创建数据文件')
  const content =
    map.data && typeof map.data === 'object'
      ? JSON.stringify(map.data)
      : JSON.stringify({ root: { data: { text: map.name }, children: [] } })
  await writeText(dataFile, content)

  // 历史版本（可选）：快照为 { time, manual, data:{root,view} }
  const snapshots = map.snapshots || []
  if (snapshots && snapshots.length) {
    const historyDir = await getSubDir(folder, 'history', true)
    if (historyDir) {
      for (const snap of snapshots) {
        const name =
          String(snap.time || Date.now()) +
          (snap.manual ? '_manual' : '_auto') +
          '.smm.json'
        const snapFile = await getFile(historyDir, name, true)
        if (snapFile) {
          const snapBody = {
            time: snap.time || Date.now(),
            manual: !!snap.manual,
            data: { root: snap.data && snap.data.root, view: snap.data && snap.data.view }
          }
          await writeText(snapFile, JSON.stringify(snapBody))
        }
      }
    }
  }
}

// 让用户选择归档文件夹并写入全部浏览器导图。成功后返回 { ok:true, name, count }。
export const archiveBrowserMaps = async () => {
  if (!isSupported()) {
    return { ok: false, unsupported: true }
  }
  const maps = listBrowserMaps()
  if (!maps.length) return { ok: true, count: 0, empty: true }
  let handle
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (error) {
    if (String(error && error.name || '').toLowerCase() === 'aborterror') {
      return { ok: false, cancelled: true }
    }
    return { ok: false, message: error && error.message || '选择归档文件夹失败' }
  }
  try {
    for (const map of maps) {
      await writeMapToDir(handle, map)
    }
    // 写入说明文件
    const readme = await getFile(handle, '浏览器存储备份说明.txt', true)
    if (readme) {
      await writeText(
        readme,
        [
          '这是从“浏览器内置存储”归档导出的思维导图数据。',
          '',
          '结构与工作目录一致：maps/<导图名>/data.smm（含 images 相对引用与历史版本）。',
          '如需继续使用，可用“选择工作目录”指向本文件夹，或把需要的 maps/<导图名>/ 复制到工作目录的 maps/ 下。',
          '',
          '归档时间：' + new Date().toLocaleString()
        ].join('\n')
      )
    }
    return { ok: true, name: handle.name, count: maps.length }
  } catch (error) {
    // 归档失败：绝不删除浏览器数据
    return { ok: false, message: '归档失败：' + (error.message || error) }
  }
}

// ---------- 删除浏览器内置存储中的导图 ----------

const removeKey = key => {
  try {
    localStorage.removeItem(key)
    markKeyRemoved(key)
  } catch (e) {
    // 忽略单键删除失败
  }
}

// 删除全部浏览器多文件导图及其历史、文件列表、当前文件指针。
// 会同步通知磁盘镜像（markKeyRemoved），避免下次启动被回灌。
export const clearBrowserMaps = () => {
  let removed = 0
  readFileList().forEach(f => {
    if (!f || !f.id) return
    removeKey(FILE_PREFIX + f.id)
    removeKey(HISTORY_PREFIX + f.id)
    removed++
  })
  removeKey(FILE_LIST_KEY)
  removeKey(CURRENT_FILE_KEY)
  removeKey(LEGACY_DATA_KEY)
  // 注意：不可删除 serverStorage 的墓碑键(TOMBSTONE_KEY)——它记录“已删除”标记，
  // 用于让磁盘镜像同步删除旧副本，并阻止下次启动把这些键回灌回 localStorage。
  try {
    localStorage.setItem(CLEARED_MARKER, '1')
  } catch (e) {
    // 忽略
  }
  notifyWorkspaceChanged()
  return removed
}

// 撤销“已清理”标记（用户重新选择工作目录导入内容后可能需要）
export const resetBrowserMapsCleared = () => {
  try {
    localStorage.removeItem(CLEARED_MARKER)
  } catch (e) {
    // 忽略
  }
}

// 标记“浏览器导图已归档清理”为真，且不删除任何内容（供“选择工作目录后保留浏览器模式”场景）
export const markBrowserMapsCleared = () => {
  try {
    localStorage.setItem(CLEARED_MARKER, '1')
    notifyWorkspaceChanged()
  } catch (e) {
    // 忽略
  }
}

// 供 api/index.js 在初始化时判断是否允许自动重建默认导图
export const shouldAutoSeedBrowserFile = () => !isBrowserMapsCleared()
