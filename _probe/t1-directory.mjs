// 探针 T1：目录模式下「编辑未落盘就切文件 / 刷新」是否丢新数据、是否串写
import { installEnv, sleep, settle } from './harness.mjs'
import { makeVm } from './vm.mjs'

let seq = 0
const fresh = async () => {
  const q = '?v=' + ++seq
  const mod = await import('./bundle.mjs' + q)
  return mod
}

const root = text => ({ data: { text, uid: 'uid-' + text }, children: [] })
const readMap = (fs, name) => JSON.parse(fs.read(`maps/${name}/data.smm`) || 'null')

const setup = async opts => {
  const env = installEnv(opts)
  const mod = await fresh()
  const { api, directoryStorage, store, Edit, bus, MindMapStub } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {} // 手动控制启动顺序
  edit.$refs = {}
  edit.mounted()

  const open = async name => {
    const res = await directoryStorage.openMapFile(name)
    store.commit('setCurrentSmmFile', res.fileName)
    api.clearDataCache()
    bus.$emit('setData', res.data)
    return res
  }
  const create = async (name, text) => {
    await directoryStorage.createMapFile(name, { root: root(text), layout: 'mindMap' })
  }
  // 模拟浏览器在刷新/关闭/切后台前触发的事件
  const dispatchLeave = () => {
    globalThis.visibilityState = 'hidden'
    globalThis.dispatchWindowEvent('visibilitychange')
    globalThis.dispatchWindowEvent('pagehide')
  }
  return { env, mod, api, directoryStorage, store, bus, edit, open, create, MindMapStub, dispatchLeave }
}

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// ---------- T1：编辑 A 后立刻切到 B（不 flush 的路径：ReviewFloat.locate / 复习定位） ----------
{
  const s = await setup({ serverKeys: null })
  await s.create('A', 'A-original')
  await s.create('B', 'B-original')
  await s.open('A')
  // 用户编辑 A（走真实事件链：data_change → Edit.onDataChange → storeData 防抖 800ms）
  s.edit.mindMap.setData(root('A-edited'))
  s.bus.$emit('data_change', s.edit.mindMap.renderTree)
  // 立刻切到 B —— 模拟 ReviewFloat.locate 的目录分支（无 flush）
  const opened = await s.directoryStorage.openMapFile('B')
  s.store.commit('setCurrentSmmFile', opened.fileName)
  s.api.clearDataCache()
  s.bus.$emit('setData', opened.data)
  await sleep(1400) // 等过 800ms 防抖
  const A = readMap(s.env.fs, 'A')
  const B = readMap(s.env.fs, 'B')
  const aText = A && A.root && A.root.data.text
  const bText = B && B.root && B.root.data.text
  report(
    'T1 切文件不 flush：A 的编辑应已保存且不写进 B',
    aText === 'A-edited' && bText === 'B-original',
    `A.root.text=${aText}（期望 A-edited），B.root.text=${bText}（期望 B-original）`
  )
}

// ---------- T2：编辑后立即刷新页面（防抖未到） ----------
{
  const s = await setup({ serverKeys: null })
  await s.create('A', 'A-original')
  await s.open('A')
  s.edit.mindMap.setData(root('A-edited'))
  s.bus.$emit('data_change', s.edit.mindMap.renderTree)
  await sleep(100) // 用户 100ms 后就刷新了，800ms 防抖未触发
  // 真实浏览器在刷新/关闭前会先触发 visibilitychange(hidden) 与 pagehide，
  // 应用在这两个时机立即落盘。这里忠实模拟该时机。
  s.dispatchLeave()
  await settle(80)
  const A = readMap(s.env.fs, 'A')
  const aText = A && A.root && A.root.data.text
  report(
    'T2 编辑后立即刷新：磁盘应保留最新编辑',
    aText === 'A-edited',
    `A.root.text=${aText}（期望 A-edited）—— 未落盘则读到旧值`
  )
}

// ---------- T3：视图变化（view_data_change，300ms 定时）在切换后是否写到别的文件 ----------
{
  const s = await setup({ serverKeys: null })
  await s.create('A', 'A-original')
  await s.create('B', 'B-original')
  await s.open('A')
  // 视图变化（拖动/缩放）→ Edit.onViewDataChange 排队 300ms
  s.edit.onViewDataChange({ transform: { scale: 2, x: 10, y: 20 } })
  // 150ms 后切到 B（未过 300ms）
  await sleep(150)
  const opened = await s.directoryStorage.openMapFile('B')
  s.store.commit('setCurrentSmmFile', opened.fileName)
  s.api.clearDataCache()
  s.bus.$emit('setData', opened.data)
  await sleep(1400)
  const B = readMap(s.env.fs, 'B')
  const bView = B && B.view
  const moved = !!(bView && bView.transform && bView.transform.scale === 2)
  report(
    'T3 视图变化跨文件不应串写',
    !moved,
    `B.view.transform=${JSON.stringify(bView && bView.transform)}（期望不是 A 的 scale:2）`
  )
}

// ---------- T4：启动时不会把示例占位写进本地（回归 T-门闩） ----------
{
  const s = await setup({ serverKeys: null })
  await s.create('A', 'A-original')
  await s.directoryStorage.openMapFile('A')
  s.store.commit('setCurrentSmmFile', 'A.smm')
  // 真实启动：Edit.mounted 已用示例数据 init，随后异步 resume 打开 A
  s.edit.restoreDirectoryMode = s.mod.Edit.methods.restoreDirectoryMode.bind(s.edit)
  await s.edit.restoreDirectoryMode()
  await sleep(1500)
  const A = readMap(s.env.fs, 'A')
  const aText = A && A.root && A.root.data.text
  report('T4 启动恢复不覆盖本地正文', aText === 'A-original', `A.root.text=${aText}（期望 A-original）`)
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
