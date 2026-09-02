const SAFE_FILE_ID_RE = /^[A-Za-z0-9_.-]+$/

export const validateWorkspaceStorage = (storage, currentFileId = '') => {
  if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
    return { ok: false, message: '工作区缺少有效数据' }
  }
  if (typeof storage.SIMPLE_MIND_MAP_FILE_LIST !== 'string') {
    return { ok: false, message: '工作区缺少文件列表' }
  }

  try {
    const files = JSON.parse(storage.SIMPLE_MIND_MAP_FILE_LIST)
    if (!Array.isArray(files) || !files.length) throw new Error('empty')
    const fileIds = new Set()
    for (const file of files) {
      const id = file && file.id
      if (typeof id !== 'string' || !SAFE_FILE_ID_RE.test(id) || fileIds.has(id)) {
        throw new Error('invalid file id')
      }
      fileIds.add(id)
      const fileValue = storage['SIMPLE_MIND_MAP_FILE_' + id]
      if (typeof fileValue !== 'string') throw new Error('missing file data')
      const fileData = JSON.parse(fileValue)
      if (
        !fileData ||
        typeof fileData !== 'object' ||
        !fileData.root ||
        typeof fileData.root !== 'object'
      ) {
        throw new Error('invalid file data')
      }
    }
    if (currentFileId && !fileIds.has(currentFileId)) {
      throw new Error('invalid current file')
    }
  } catch (e) {
    return { ok: false, message: '工作区文件列表或导图数据损坏' }
  }
  return { ok: true }
}
