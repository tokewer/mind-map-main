// 探针 T4：真实生命周期循环 —— 多次保存 / 关闭 / 重新打开 / 刷新
// 覆盖三种存储模式，验证「新数据不会被旧数据覆盖，重开后读到最新版本」。
import { installEnv, sleep, settle } from './harness.mjs'
import { makeVm } from './vm.mjs'

let seq = 0
const fresh = async () => import('./bundle.mjs?v=' + ++seq)
const root = (text, n = 0) => ({
  data: { text, uid: 'uid-root' },
  children: n ? [{ data: { text: 'child' + n, uid: 'uid-c' + n }, children: [] }] : []
})

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

const dispatchLeave = () => {
  globalThis.visibilityState = 'hidden'
  globalThis.dispatchWindowEvent('visibilitychange')
  globalThis.dispatchWindowEvent('pagehide')
}
const backOnline = () => {
  globalThis.visibilityState = 'visible'
  globalThis.dispatchWindowEvent('visibilitychange')
}

const latest = data => (data && data.root && data.root.data ? data.root.data.text : null)

// ---------- L1：工作目录模式，20 轮「编辑→刷新→重开」 ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { api, directoryStorage, store, bus, Edit } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await directoryStorage.createMapFile('A', { root: root('v0'), layout: 'mindMap' })

  let edit = null
  let ok = true
  let detail = ''
  for (let i = 1; i <= 20 && ok; i++) {
    // 每一轮视为一次「新会话」：先销毁上一个页面实例（注销其事件监听）
    if (edit) edit.beforeDestroy()
    // 打开（等价于一次新会话的启动恢复）
    const res = await directoryStorage.openMapFile('A')
    store.commit('setCurrentSmmFile', res.fileName)
    api.clearDataCache()
    edit = makeVm(Edit, { bus, store })
    edit.restoreDirectoryMode = async () => {}
    edit.$refs = {}
    edit.mounted()
    bus.$emit('setData', res.data)
    backOnline()

    // 编辑并立刻「刷新」
    edit.mindMap.setData(root('v' + i, i))
    bus.$emit('data_change', edit.mindMap.renderTree)
    await sleep(5)
    dispatchLeave()
    await settle(40)

    // 校验磁盘
    const onDisk = JSON.parse(env.fs.read('maps/A/data.smm'))
    if (latest(onDisk) !== 'v' + i) {
      ok = false
      detail = `第 ${i} 轮后磁盘为 ${latest(onDisk)}，期望 v${i}`
    }
  }
  report('L1 工作目录：20 轮编辑+刷新后磁盘始终为最新版本', ok, detail || '20 轮全部为最新版本')
}

// ---------- L2：工作目录模式，切换文件不丢数据 ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { api, directoryStorage, store, bus, Edit } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await directoryStorage.createMapFile('A', { root: root('A0'), layout: 'mindMap' })
  await directoryStorage.createMapFile('B', { root: root('B0'), layout: 'mindMap' })
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()

  let ok = true
  let detail = ''
  for (let i = 1; i <= 10; i++) {
    // A：编辑后立刻切到 B（不经过 FileBar 的 flush）
    const a = await directoryStorage.openMapFile('A')
    store.commit('setCurrentSmmFile', a.fileName)
    api.clearDataCache()
    bus.$emit('setData', a.data)
    edit.mindMap.setData(root('A-v' + i, i))
    bus.$emit('data_change', edit.mindMap.renderTree)

    const b = await directoryStorage.openMapFile('B')
    store.commit('setCurrentSmmFile', b.fileName)
    api.clearDataCache()
    bus.$emit('setData', b.data)
    edit.mindMap.setData(root('B-v' + i, i))
    bus.$emit('data_change', edit.mindMap.renderTree)

    await sleep(1100) // 等过 800ms 防抖
    const diskA = latest(JSON.parse(env.fs.read('maps/A/data.smm')))
    const diskB = latest(JSON.parse(env.fs.read('maps/B/data.smm')))
    if (diskA !== 'A-v' + i || diskB !== 'B-v' + i) {
      ok = false
      detail = `第 ${i} 轮 A=${diskA}(期望 A-v${i})，B=${diskB}(期望 B-v${i})`
      break
    }
  }
  report('L2 工作目录：来回切换 10 轮，两张图各自保留最新内容', ok, detail || '10 轮全部正确')
}

// ---------- L3：浏览器模式，20 轮编辑+刷新 ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { api, store, bus, Edit } = mod
  api.initFileStorage()
  store.commit('setIsDirectoryMode', false)
  store.commit('setIsHandleLocalFile', false)
  const fileId = api.getCurrentFileId()
  let ok = true
  let detail = ''
  for (let i = 1; i <= 20; i++) {
    const edit = makeVm(Edit, { bus, store })
    edit.restoreDirectoryMode = async () => {}
    edit.$refs = {}
    edit.mounted()
    edit.mindMap.setData(root('v' + i, i))
    bus.$emit('data_change', edit.mindMap.renderTree)
    await sleep(5)
    dispatchLeave()
    await settle(20)
    const stored = JSON.parse(env.ls.getItem('SIMPLE_MIND_MAP_FILE_' + fileId))
    if (latest(stored) !== 'v' + i) {
      ok = false
      detail = `第 ${i} 轮 localStorage 为 ${latest(stored)}，期望 v${i}`
      break
    }
  }
  report('L3 浏览器存储：20 轮编辑+刷新后始终为最新版本', ok, detail || '20 轮全部为最新版本')
}

// ---------- L4：本地磁盘文件，多轮「编辑→切文件→切回」 ----------
{
  const env = installEnv({ serverKeys: null })
  env.fs.seed('A.smm', JSON.stringify({ root: root('A0'), layout: 'mindMap' }))
  env.fs.seed('B.smm', JSON.stringify({ root: root('B0'), layout: 'mindMap' }))
  const mod = await fresh()
  const { store, bus, Edit, Toolbar } = mod
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  store.commit('setIsHandleLocalFile', true)
  const tb = makeVm(Toolbar, { bus, store })
  tb.$refs = {}
  tb.isHandleLocalFile = true
  tb.created()
  tb.mounted()

  let ok = true
  let detail = ''
  for (let i = 1; i <= 10; i++) {
    const aHandle = await env.fs.root.getFileHandle('A.smm')
    await tb.editLocalFile({ handle: aHandle })
    await sleep(20)
    edit.mindMap.setData(root('A-v' + i, i))
    bus.$emit('data_change', edit.mindMap.renderTree)
    // 立刻切到 B，再切回 A —— 两个切换点都不能丢数据
    const bHandle = await env.fs.root.getFileHandle('B.smm')
    await tb.editLocalFile({ handle: bHandle })
    await sleep(20)
    const aHandle2 = await env.fs.root.getFileHandle('A.smm')
    await tb.editLocalFile({ handle: aHandle2 })
    await sleep(20)

    const diskA = latest(JSON.parse(env.fs.read('A.smm')))
    if (diskA !== 'A-v' + i) {
      ok = false
      detail = `第 ${i} 轮 A.smm=${diskA}，期望 A-v${i}`
      break
    }
    // 切回 A 后编辑器读到的也必须是刚写的最新内容
    const inEditor = latest(edit.mindMap.getData())
    if (inEditor !== 'A-v' + i) {
      ok = false
      detail = `第 ${i} 轮重开后编辑器读到 ${inEditor}，期望 A-v${i}`
      break
    }
  }
  report('L4 本地磁盘文件：10 轮切换后重开始终读到最新内容', ok, detail || '10 轮全部正确')
  void Edit
}

// ---------- L5：遮罩不泄漏（连续多次 setData） ----------
{
  installEnv({ serverKeys: null })
  globalThis.__LOADING_LOG = []
  globalThis.__LOADING_OPEN = 0
  const mod = await fresh()
  const { store, bus, Edit } = mod
  store.commit('setIsDirectoryMode', false)
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  for (let i = 0; i < 6; i++) {
    edit.setData({ root: root('x' + i), layout: 'mindMap' })
  }
  await settle(60)
  const opens = globalThis.__LOADING_LOG.filter(l => l.action === 'open').length
  const closes = globalThis.__LOADING_LOG.filter(l => l.action === 'close').length
  report(
    'L5 连续 6 次 setData 后 loading 遮罩不应残留',
    opens > 0 && opens === closes,
    `open=${opens}，close=${closes}（相等且 >0 表示每次开启都被关闭）`
  )
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
