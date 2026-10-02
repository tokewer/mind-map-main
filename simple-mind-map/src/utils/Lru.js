// LRU缓存类
export default class Lru {
  constructor(max) {
    this.max = max || 1000
    this.size = 0
    this.pool = new Map()
  }

  add(key, value) {
    const isExist = this.has(key)
    if (isExist) {
      this.delete(key)
    } else if (this.size >= this.max) {
      // 达到容量上限时淘汰最旧未使用的缓存项，保障新节点可被缓存复用
      const keys = this.pool.keys()
      const oldest = keys.next()
      if (oldest && oldest.value !== undefined) {
        this.delete(oldest.value)
      }
    }
    // 添加
    this.pool.set(key, value)
    this.size++
    return true
  }

  delete(key) {
    if (this.pool.has(key)) {
      this.pool.delete(key)
      this.size--
    }
  }

  has(key) {
    return this.pool.has(key)
  }

  get(key) {
    if (this.pool.has(key)) {
      return this.pool.get(key)
    }
  }

  clear() {
    this.size = 0
    this.pool = new Map()
  }
}
