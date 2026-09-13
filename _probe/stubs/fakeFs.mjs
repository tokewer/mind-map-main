// 探针用 File System Access API 假文件系统。
// 目的：让 directoryStorage.js 的真实代码在 Node 中按真实异步时序执行，
// 并可注入延迟，从而复现「旧数据覆盖新数据」的竞态。
// 操作日志 __FS.log 用于断言写入顺序与内容。

export const createFakeFs = (opts = {}) => {
  const log = []
  let delay = opts.delay || 0
  const gate = opts.gate || null // async (op, path) => void，可挂起特定操作

  const state = {
    log,
    setDelay: d => {
      delay = d
    },
    // 直接写入（模拟用户/外部程序改动磁盘，或初始文件内容）
    seed(path, content) {
      files.set(path, content)
    },
    read(path) {
      return files.has(path) ? files.get(path) : null
    },
    dump(path) {
      const t = files.get(path)
      return t === null || t === undefined ? null : t
    },
    paths: () => [...files.keys()].sort()
  }

  const files = new Map()
  const dirs = new Set(['']) // 相对路径，'' 为根

  const wait = async (op, path) => {
    log.push({ t: Date.now(), op, path })
    if (gate) await gate(op, path)
    if (delay) await new Promise(r => setTimeout(r, delay))
  }

  const norm = (parent, name) => (parent ? parent + '/' + name : name)

  class FakeFileHandle {
    constructor(path) {
      this.kind = 'file'
      this.name = path.split('/').pop()
      this._path = path
    }
    async getFile() {
      await wait('getFile', this._path)
      const content = files.has(this._path) ? files.get(this._path) : ''
      return {
        name: this.name,
        text: async () => content,
        arrayBuffer: async () => new TextEncoder().encode(content).buffer,
        slice: () => new Blob([content])
      }
    }
    async createWritable() {
      await wait('createWritable', this._path)
      let buf = ''
      const path = this._path
      return {
        write: async c => {
          buf += typeof c === 'string' ? c : ''
        },
        close: async () => {
          await wait('write:' + truncate(buf), path)
          files.set(path, buf)
        },
        abort: async () => {}
      }
    }
    async remove() {
      await wait('removeFile', this._path)
      files.delete(this._path)
    }
  }

  class FakeDirHandle {
    constructor(path) {
      this.kind = 'directory'
      this.name = path ? path.split('/').pop() : 'root'
      this._path = path
    }
    async queryPermission() {
      return 'granted'
    }
    async requestPermission() {
      return 'granted'
    }
    async getDirectoryHandle(name, o = {}) {
      await wait('getDirectoryHandle', norm(this._path, name))
      const p = norm(this._path, name)
      if (dirs.has(p)) return new FakeDirHandle(p)
      if (!o.create) return null
      dirs.add(p)
      return new FakeDirHandle(p)
    }
    async getFileHandle(name, o = {}) {
      await wait('getFileHandle', norm(this._path, name))
      const p = norm(this._path, name)
      if (files.has(p)) return new FakeFileHandle(p)
      if (!o.create) return null
      files.set(p, '')
      return new FakeFileHandle(p)
    }
    async *entries() {
      const prefix = this._path ? this._path + '/' : ''
      const seen = new Set()
      for (const d of [...dirs].sort()) {
        if (d === this._path) continue
        if (!d.startsWith(prefix)) continue
        const rest = d.slice(prefix.length)
        if (!rest || rest.includes('/')) continue
        if (seen.has(rest)) continue
        seen.add(rest)
        yield [rest, new FakeDirHandle(d)]
      }
      for (const f of [...files.keys()].sort()) {
        if (!f.startsWith(prefix)) continue
        const rest = f.slice(prefix.length)
        if (!rest || rest.includes('/')) continue
        if (seen.has(rest)) continue
        seen.add(rest)
        yield [rest, new FakeFileHandle(f)]
      }
    }
    async remove(o = {}) {
      await wait('removeDir', this._path)
      const prefix = this._path + '/'
      ;[...files.keys()].forEach(k => {
        if (k.startsWith(prefix)) files.delete(k)
      })
      ;[...dirs].forEach(d => {
        if (d === this._path || d.startsWith(prefix)) dirs.delete(d)
      })
    }
    async move(parent, newName) {
      await wait('move', this._path + '->' + norm(parent._path, newName))
      const oldPrefix = this._path
      const newPrefix = norm(parent._path, newName)
      const fileMoves = []
      ;[...files.keys()].forEach(k => {
        if (k === oldPrefix || k.startsWith(oldPrefix + '/')) {
          fileMoves.push([k, newPrefix + k.slice(oldPrefix.length)])
        }
      })
      fileMoves.forEach(([from, to]) => {
        files.set(to, files.get(from))
        files.delete(from)
      })
      const dirMoves = []
      ;[...dirs].forEach(d => {
        if (d === oldPrefix || d.startsWith(oldPrefix + '/')) {
          dirMoves.push([d, newPrefix + d.slice(oldPrefix.length)])
        }
      })
      dirMoves.forEach(([from, to]) => {
        dirs.delete(from)
        dirs.add(to)
      })
    }
  }

  const root = new FakeDirHandle('')
  state.root = root
  return state
}

const truncate = s => (s.length > 40 ? s.slice(0, 40) + '…' : s)
