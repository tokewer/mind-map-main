// 复习列表展示树：父子关系使用 UID，不从展示路径推导。

const UNASSIGNED_FILE = '__unassigned__'

export const getReviewFileKey = node => node && node.fileId ? node.fileId : UNASSIGNED_FILE

export const getReviewFileName = node => {
  return node && node.fileName ? node.fileName : '未归属'
}

// 目录模式身份归一（修复同科目裂成多组 + 定位失效）：
// 复习记录写死“加入那一刻”的 fileId。同一张科目图会因存储体系切换被记成多种身份——
// 浏览器旧代次 file_xxx / file_default 与目录模式规范 <科目>.smm —— 于是复习列表出现
// 多个“化学/语文”，且旧 fileId 在工作目录中找不到对应文件导致定位失败。
// 本函数不改存储，只在展示层把记录派生为目录模式规范身份（fileId=<科目>.smm），
// 使同科目记录归并到同一组、并可被 openMapFile 命中现役科目图。
export const toDirectorySubjectNode = node => {
  if (!node || typeof node !== 'object') return node
  const fid = node.fileId || ''
  const name = String(node.fileName || '').trim()
  // fileId 已是目录规范（<科目>.smm）或无科目名（未归属/空）→ 保持原样
  if (fid.toLowerCase().endsWith('.smm')) return node
  if (!name || name === '未归属') return node
  // 浏览器旧代次 fileId 且带科目名 → 归一到 <科目>.smm（fileName 去扩展名）
  const canonical = name.toLowerCase().endsWith('.smm') ? name : name + '.smm'
  if (canonical === fid) return node
  return { ...node, fileId: canonical, fileName: name.replace(/\.smm$/i, '') }
}

// 归一列表：目录模式下把每条复习记录派生为目录规范身份，供分组/筛选/定位使用。
export const toDirectorySubjectList = (list, isDirectoryMode = false) => {
  if (!isDirectoryMode) return list || []
  return (list || []).map(n => toDirectorySubjectNode(n))
}

// 判断一条复习记录是否属于「当前打开的这张导图」。
// 必须用 fileId 归属（而非只比 uid）：uid 在「另存为 / 复制文件」后会被沿用，
// 只按 uid 匹配会把 A 文件的复习状态（发光、掌握度上色）画到 B 文件上——即跨文件串台。
// 兼容旧数据：任一方缺 fileId（早期记录未打归属）时退化为按 uid 匹配，避免漏显示。
export const isReviewNodeInFile = (node, currentFileId, isDirectoryMode = false) => {
  if (!node) return false
  const normalized = isDirectoryMode ? toDirectorySubjectNode(node) : node
  const recordId = normalized && normalized.fileId ? normalized.fileId : ''
  const currentId = currentFileId || ''
  if (!recordId || !currentId) return true
  return recordId === currentId
}

// 从持久化导图数据建立 childUid -> parentUid 映射。
export const buildParentMap = data => {
  const result = {}
  const walk = (node, parentUid = '') => {
    if (!node || typeof node !== 'object') return
    const currentUid = node.data && node.data.uid ? node.data.uid : ''
    const nextParent = currentUid || parentUid
    if (currentUid && parentUid) result[currentUid] = parentUid
    const children = node.children || (node.data && node.data.children) || []
    if (Array.isArray(children)) children.forEach(child => walk(child, nextParent))
  }
  walk(data && data.root)
  return result
}

const validParent = (node, parent, byUid) => {
  if (!parent || parent.uid === node.uid) return false
  if (getReviewFileKey(parent) !== getReviewFileKey(node)) return false
  return byUid[parent.uid] === parent
}

// 将复习记录复制为展示对象，按文件分组并以 DFS 顺序输出。
// parentMaps 的键为 fileId，值为 childUid -> parentUid 映射。
export const buildReviewGroups = (items, parentMaps = {}) => {
  const groups = new Map()
  ;(items || []).forEach(item => {
    if (!item || !item.uid) return
    const key = getReviewFileKey(item)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        fileId: item.fileId || '',
        fileName: getReviewFileName(item),
        list: []
      })
    }
    groups.get(key).list.push({ ...item, level: 0 })
  })

  groups.forEach(group => {
    const byUid = {}
    group.list.forEach(item => { byUid[item.uid] = item })
    const children = {}
    group.list.forEach(item => {
      const map = parentMaps[group.fileId] || {}
      const parentUid = item.parentUid || map[item.uid] || ''
      const parent = byUid[parentUid]
      if (validParent(item, parent, byUid)) {
        item.parentUid = parent.uid
        if (!children[parent.uid]) children[parent.uid] = []
        children[parent.uid].push(item)
      } else {
        item.parentUid = ''
      }
    })

    const roots = group.list.filter(item => !item.parentUid)
    const ordered = []
    const visited = new Set()
    const append = (item, level) => {
      if (visited.has(item.uid)) return
      visited.add(item.uid)
      ordered.push({ ...item, level })
      ;(children[item.uid] || []).forEach(child => append(child, level + 1))
    }
    roots.forEach(item => append(item, 0))
    // 覆盖断链、环或异常重复 UID，保证所有记录仍可见。
    group.list.forEach(item => append(item, 0))
    group.list = ordered
  })
  return [...groups.values()]
}

export { UNASSIGNED_FILE }
