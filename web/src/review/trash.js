import { notifyWorkspaceChanged } from '@/api/workspaceEvents'

// 回收站：被删除的节点数据暂存于此，可恢复
const TRASH_KEY = 'MIND_MAP_TRASH'

const load = () => {
  try {
    const raw = localStorage.getItem(TRASH_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

const save = list => {
  try {
    localStorage.setItem(TRASH_KEY, JSON.stringify(list))
    notifyWorkspaceChanged()
  } catch (e) {
    console.log(e)
  }
}

// 加入回收站（最多保留 50 条）
export const addToTrash = nodeData => {
  if (!nodeData || !nodeData.data) return
  const list = load()
  list.unshift({
    id: 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    data: nodeData,
    time: Date.now()
  })
  if (list.length > 50) list.length = 50
  save(list)
}

export const getTrashList = () => {
  return load()
}

export const removeFromTrash = id => {
  const list = load().filter(t => t.id !== id)
  save(list)
}

export const clearTrash = () => {
  save([])
}
