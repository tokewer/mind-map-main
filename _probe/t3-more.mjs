// 探针 T3：遮罩泄漏 / 防抖窗口内的旧读取 / 本地文件防抖串写
import { installEnv, sleep, settle } from './harness.mjs'
import { makeVm } from './vm.mjs'

let seq = 0
const fresh = async () => import('./bundle.mjs?v=' + ++seq)
const root = text => ({ data: { text, uid: 'uid-' + text }, children: [] })

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// ---------- T9：两次 showLoading 后只收到一次 node_tree_render_end，是否有遮罩残留 ----------
{
  const env = installEnv({ serverKeys: null })
  void env
  const mod = await fresh()
  const { api, store, bus, Edit, loadingUtils } = mod
  globalThis.__LOADING_LOG = []
  globalThis.__LOADING_OPEN = 0
  store.commit('setIsDirectoryMode', false)
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  // 快速连续两次 setData（快速切换文件）→ 每次 handleShowLoading
  edit.setData({ root: root('X'), layout: 'mindMap' })
  edit.setData({ root: root('Y'), layout: 'mindMap' })
  await settle(60) // 两次渲染结束事件都会到达
  const opens = globalThis.__LOADING_LOG.filter(l => l.action === 'open').length
  const closes = globalThis.__LOADING_LOG.filter(l => l.action === 'close').length
  report(
    'T9 连续两次 setData 后遮罩不应残留',
    opens > 0 && opens === closes,
    `Loading.service 调用 ${opens} 次，close ${closes} 次（不等则残留全屏遮罩）`
  )
  void api
  void loadingUtils
}

// ---------- T10：编辑后立刻读取（防抖窗口内）是否读到旧版本 ----------
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
  await sleep(50)
  // 防抖窗口内：getData()（走缓存）与 readFileData()（走 localStorage）分别读到什么？
  const viaGetData = api.getData()
  const viaReadFileData = api.readFileData(fileId)
  const t1 = viaGetData.root && viaGetData.root.data.text
  const t2 = viaReadFileData.root && viaReadFileData.root.data.text
  report(
    'T10 防抖窗口内 getData 与 readFileData 应一致且为新值',
    t1 === 'Edited' && t2 === 'Edited',
    `getData().root.text=${t1}，readFileData().root.text=${t2}（期望均为 Edited）`
  )
  await sleep(600)
  void env
}

// ---------- T11：本地文件 1s 防抖——A 编辑后立刻切 B，A 内容是否写进 B ----------
{
  const env = installEnv({ serverKeys: null })
  env.fs.seed('A.smm', JSON.stringify({ root: root('A-original'), layout: 'mindMap' }))
  env.fs.seed('B.smm', JSON.stringify({ root: root('B-original'), layout: 'mindMap' }))
  const mod = await fresh()
  const { bus, store, Edit, Toolbar } = mod
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  const tb = makeVm(Toolbar, { bus, store })
  tb.$refs = {}
  tb.created()
  tb.mounted()
  const aHandle = await env.fs.root.getFileHandle('A.smm')
  tb.editLocalFile({ handle: aHandle })
  await sleep(50)
  edit.mindMap.setData(root('A-edited'))
  bus.$emit('data_change', edit.mindMap.renderTree)
  await sleep(100) // 防抖 1s 未到
  const bHandle = await env.fs.root.getFileHandle('B.smm')
  tb.editLocalFile({ handle: bHandle }) // 切到 B
  await sleep(60) // 让 B 的读完成、防抖定时器尚未触发
  const B = JSON.parse(env.fs.read('B.smm'))
  const bText = B.root && B.root.data.text
  report(
    'T11 本地文件 1s 防抖不得把 A 的内容写进 B',
    bText !== 'A-edited',
    `B.root.text=${bText}（若为 A-edited 说明 A 的待写数据被写进了 B）`
  )
  await sleep(1200)
}

// ---------- T12：切换文件后，前一个文件的待写任务是否被丢弃（不写入新文件） ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { api, store, bus, Edit } = mod
  api.initFileStorage()
  store.commit('setIsDirectoryMode', false)
  // 在浏览器模式建 A、B 两个文件
  const fileA = api.createFile('A')
  const fileB = api.createFile('B')
  api.setCurrentFileId(fileA.id)
  const edit = makeVm(Edit, { bus, store })
  edit.restoreDirectoryMode = async () => {}
  edit.$refs = {}
  edit.mounted()
  edit.mindMap.setData(root('A-edited'))
  bus.$emit('data_change', edit.mindMap.renderTree)
  await sleep(100)
  api.setCurrentFileId(fileB.id) // 切到 B（未 flush）
  await sleep(700)
  const A = JSON.parse(env.ls.getItem('SIMPLE_MIND_MAP_FILE_' + fileA.id) || 'null')
  const B = JSON.parse(env.ls.getItem('SIMPLE_MIND_MAP_FILE_' + fileB.id) || 'null')
  const aText = A && A.root && A.root.data.text
  const bText = B && B.root && B.root.data.text
  report(
    'T12 浏览器模式待写任务应写回原文件 A 而非新文件 B',
    aText === 'A-edited' && bText !== 'A-edited',
    `A.root.text=${aText}（期望 A-edited），B.root.text=${bText}（不应是 A-edited）`
  )
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
