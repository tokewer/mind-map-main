const parseFileList = value => {
  try {
    const list = JSON.parse(value || '[]')
    return Array.isArray(list) ? list : null
  } catch (e) {
    return null
  }
}

export const mergeFileLists = (diskValue, localValue, removedFileIds = []) => {
  const diskList = parseFileList(diskValue)
  const localList = parseFileList(localValue)
  if (!diskList) return localValue
  const removed = new Set(removedFileIds)
  const merged = new Map()
  diskList.forEach(file => {
    if (file && typeof file.id === 'string' && !removed.has(file.id)) {
      merged.set(file.id, file)
    }
  })
  if (localList) {
    localList.forEach(file => {
      if (file && typeof file.id === 'string' && !removed.has(file.id)) {
        merged.set(file.id, file)
      }
    })
  }
  return JSON.stringify([...merged.values()])
}
