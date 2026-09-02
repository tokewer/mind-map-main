import { describe, expect, test } from 'bun:test'
import { mergeFileLists } from '../web/src/api/storageMerge.js'
import { validateWorkspaceStorage } from '../web/src/api/workspaceValidation.js'

const fileData = text => JSON.stringify({
  root: { data: { text }, children: [] },
  view: {}
})

describe('mergeFileLists', () => {
  test('keeps disk files and offline-created local files', () => {
    const disk = JSON.stringify([
      { id: 'file_disk', name: '磁盘文件', updatedAt: 1 }
    ])
    const local = JSON.stringify([
      { id: 'file_offline_1', name: '离线文件', updatedAt: 2 }
    ])

    expect(JSON.parse(mergeFileLists(disk, local))).toEqual([
      { id: 'file_disk', name: '磁盘文件', updatedAt: 1 },
      { id: 'file_offline_1', name: '离线文件', updatedAt: 2 }
    ])
  })

  test('uses local metadata when the same file changed offline', () => {
    const disk = JSON.stringify([
      { id: 'file_shared', name: '旧名称', updatedAt: 1 }
    ])
    const local = JSON.stringify([
      { id: 'file_shared', name: '离线新名称', updatedAt: 3 }
    ])

    expect(JSON.parse(mergeFileLists(disk, local))).toEqual([
      { id: 'file_shared', name: '离线新名称', updatedAt: 3 }
    ])
  })

  test('does not restore a file deleted while offline', () => {
    const disk = JSON.stringify([
      { id: 'file_deleted', name: '已删除文件', updatedAt: 1 },
      { id: 'file_kept', name: '保留文件', updatedAt: 1 }
    ])
    const local = JSON.stringify([
      { id: 'file_kept', name: '保留文件', updatedAt: 2 }
    ])

    expect(JSON.parse(mergeFileLists(disk, local, ['file_deleted']))).toEqual([
      { id: 'file_kept', name: '保留文件', updatedAt: 2 }
    ])
  })
})

describe('validateWorkspaceStorage', () => {
  test('accepts a complete workspace', () => {
    const storage = {
      SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_a', name: 'A' }]),
      SIMPLE_MIND_MAP_CURRENT_FILE: 'file_a',
      SIMPLE_MIND_MAP_FILE_file_a: fileData('A')
    }

    expect(validateWorkspaceStorage(storage, 'file_a')).toEqual({ ok: true })
  })

  test('rejects a listed file whose data is missing', () => {
    const storage = {
      SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_a', name: 'A' }]),
      SIMPLE_MIND_MAP_CURRENT_FILE: 'file_a'
    }

    expect(validateWorkspaceStorage(storage, 'file_a').ok).toBe(false)
  })

  test('rejects malformed file data and invalid current file', () => {
    const malformed = {
      SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_a', name: 'A' }]),
      SIMPLE_MIND_MAP_FILE_file_a: '{bad json'
    }
    const invalidCurrent = {
      SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_a', name: 'A' }]),
      SIMPLE_MIND_MAP_FILE_file_a: fileData('A')
    }

    expect(validateWorkspaceStorage(malformed, 'file_a').ok).toBe(false)
    expect(validateWorkspaceStorage(invalidCurrent, 'file_missing').ok).toBe(false)
  })
})
