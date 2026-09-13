// 探针用 @/store 桩：state 从 globalThis.__PROBE.state 读取，便于测试中切换模式
const commits = []
export default {
  get state() {
    return globalThis.__PROBE.state
  },
  commit(type, payload) {
    commits.push({ type, payload })
    if (type === 'setIsDirectoryMode') {
      globalThis.__PROBE.state.isDirectoryMode = payload
    }
  }
}
export const probeCommits = commits
