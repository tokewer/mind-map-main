// 探针 T2：本地磁盘文件（.smm）与浏览器 localStorage 两条路径的旧数据风险
import { installEnv, sleep, settle } from './harness.mjs'
import { makeVm } from './vm.mjs'

// 模拟真实浏览器在刷新/关闭前触发的隐藏/卸载事件
const dispatchLeave = () => {
  globalThis.visibilityState = 'hidden'
  globalThis.dispatchWindowEvent('visibilitychange')
  globalThis.dispatchWindowEvent('pagehide')
}

// mapState 在探针里是空实现，这里把组件真正依赖的 store 状态补到实例上
const makeToolbar = (mod, bus, store) => {
  const tb = makeVm(mod.Toolbar, { bus, store })
  tb.$refs = {}
  tb.isHandleLocalFile = store.state.isHandleLocalFile
  tb.isDirectoryMode = store.state.isDirectoryMode
  tb.created()
  tb.mounted()
  return tb
}

let seq = 0
const fresh = async () => import('./bundle.mjs?v=' + ++seq)
const root = text => ({ data: { text, uid: 'uid-' + text }, children: [] })

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// ---------- T5：本地文件——编辑后立刻切到另一个本地文件 ----------
{
  const env = installEnv({ serverKeys: null })
  env.fs.seed('A.smm', JSON.stringify({ root: root('A-original'), layout: 'mindMap' }))
  env.fs.seed('B.smm', JSON.stringify({ root: root('B-original'), layout: 'mindMap' }))
  const mod = await fresh()
  const { api, store, bus, Edit, MindMapStub } = mod
  const toolbarMod = await import('./bundle.mjs')
  const Toolbar = toolbarMod.Toolbar

  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()

  store.commit('setIsHandleLocalFile', true)
  const tb = makeToolbar(mod, bus, store)
  tb.isHandleLocalFile = true

  // 打开本地 A.smm
  const aHandle = await env.fs.root.getFileHandle('A.smm')
  await tb.editLocalFile({ handle: aHandle })
  await sleep(50)

  // 编辑
  edit.mindMap.setData(root('A-edited'))
  bus.$emit('data_change', edit.mindMap.renderTree)
  await sleep(50)
  // 立刻切到 B（文件树路径）
  const bHandle = await env.fs.root.getFileHandle('B.smm')
  await tb.editLocalFile({ handle: bHandle })
  await sleep(1500) // 等过 1000ms 防抖

  const A = JSON.parse(env.fs.read('A.smm'))
  const B = JSON.parse(env.fs.read('B.smm'))
  const aText = A.root && A.root.data.text
  const bText = B.root && B.root.data.text
  report(
    'T5 本地文件切换：A 的编辑应落盘且不写进 B',
    aText === 'A-edited' && bText === 'B-original',
    `A.root.text=${aText}（期望 A-edited），B.root.text=${bText}（期望 B-original）`
  )
  void api
  void MindMapStub
}

// ---------- T6：本地文件——编辑后立即刷新（浏览器会先触发隐藏/卸载事件） ----------
{
  const env = installEnv({ serverKeys: null })
  env.fs.seed('A.smm', JSON.stringify({ root: root('A-original'), layout: 'mindMap' }))
  const mod = await fresh()

  const { bus, store, Edit } = mod
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  store.commit('setIsHandleLocalFile', true)
  const tb = makeToolbar(mod, bus, store)
  const aHandle = await env.fs.root.getFileHandle('A.smm')
  await tb.editLocalFile({ handle: aHandle })
  await sleep(50)
  edit.mindMap.setData(root('A-edited'))
  bus.$emit('data_change', edit.mindMap.renderTree)
  await sleep(100) // 用户很快刷新，1s 防抖未到
  dispatchLeave()
  await settle(80)
  const A = JSON.parse(env.fs.read('A.smm'))
  const aText = A.root && A.root.data.text
  report('T6 本地文件编辑后立即刷新：应保留最新编辑', aText === 'A-edited', `A.root.text=${aText}（期望 A-edited）`)
}

// ---------- T7：浏览器模式——编辑后刷新前是否有落盘窗口 ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { api, store, bus, Edit } = mod
  api.initFileStorage()
  const fileId = api.getCurrentFileId()
  store.commit('setIsHandleLocalFile', false)
  store.commit('setIsDirectoryMode', false)

  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  edit.mindMap.setData(root('Edited'))
  bus.$emit('data_change', edit.mindMap.renderTree)
  await sleep(100) // 500ms 节流未到就刷新
  dispatchLeave()
  await settle(20)
  const stored = JSON.parse(env.ls.getItem('SIMPLE_MIND_MAP_FILE_' + fileId) || 'null')
  const text = stored && stored.root && stored.root.data.text
  report(
    'T7 浏览器模式编辑后立即刷新：应保留最新编辑',
    text === 'Edited',
    `localStorage 中 root.text=${text}（期望 Edited）`
  )
}

// ---------- T8：服务器回灌覆盖（浏览器模式启动时旧磁盘覆盖新本地） ----------
{
  // 磁盘镜像是旧内容，localStorage 是本次会话的新内容
  const serverKeys = {
    SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_default', name: 'wiki', createdAt: 1, updatedAt: 1 }]),
    SIMPLE_MIND_MAP_CURRENT_FILE: 'file_default',
    SIMPLE_MIND_MAP_FILE_file_default: JSON.stringify({ root: root('OLD-disc'), layout: 'mindMap' })
  }
  const env = installEnv({ serverKeys })
  // 先放入「本会话新编辑」的本地值，再启动（模拟刷新后 localStorage 已有新值、磁盘是旧值）
  env.ls.setItem('SIMPLE_MIND_MAP_FILE_LIST', serverKeys.SIMPLE_MIND_MAP_FILE_LIST)
  env.ls.setItem('SIMPLE_MIND_MAP_CURRENT_FILE', 'file_default')
  env.ls.setItem('SIMPLE_MIND_MAP_FILE_file_default', JSON.stringify({ root: root('NEW-local'), layout: 'mindMap' }))
  const mod = await fresh()
  const { api } = mod
  api.initFileStorage()
  const after = JSON.parse(env.ls.getItem('SIMPLE_MIND_MAP_FILE_file_default'))
  const text = after && after.root && after.root.data.text
  report(
    'T8 启动回灌不应让磁盘旧内容覆盖本地新内容',
    text === 'NEW-local',
    `回灌后 root.text=${text}（期望 NEW-local；若为 OLD-disc 则是旧数据覆盖新数据）`
  )
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
