// 复习列表展示树：父子关系使用 UID，不从展示路径推导。

const UNASSIGNED_FILE = '__unassigned__'

export const getReviewFileKey = node => node && node.fileId ? node.fileId : UNASSIGNED_FILE

export const getReviewFileName = node => {
  return node && node.fileName ? node.fileName : '未归属'
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
