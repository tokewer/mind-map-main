// 探针 T6：工作目录模式下复习节点与导图保存在同一文件夹（maps/<导图名>/review.json + <根目录>/review.json）
import { installEnv, settle } from './harness.mjs'

let seq = 0
const fresh = async () => import('./bundle.mjs?v=' + ++seq)
const root = text => ({ data: { text, uid: 'uid-' + text }, children: [] })
const readJson = (fs, p) => JSON.parse(fs.read(p) || 'null')

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// ---------- R1：工作目录模式下新增复习节点、评价、卡片、重点标记直接写入 maps/<导图名>/review.json ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { directoryStorage, store, reviewApi } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await directoryStorage.createMapFile('高等数学', { root: root('高数总览'), layout: 'mindMap' })
  await directoryStorage.createMapFile('线性代数', { root: root('线代总览'), layout: 'mindMap' })
  store.commit('setCurrentSmmFile', '高等数学.smm')
  await reviewApi.syncReviewFromDirectory()

  // 在「高等数学」新增复习节点、添加卡片、完成一次复习
  reviewApi.addReview({
    uid: 'node-math-1',
    name: '极限定义',
    path: '高数总览/极限定义',
    fileId: '高等数学.smm',
    fileName: '高等数学',
    cycles: [1, 3, 7]
  })
  reviewApi.addCard('node-math-1', {
    type: 'qa',
    front: 'ε-δ 定义是什么？',
    back: '对任意 ε>0，存在 δ>0...'
  })
  reviewApi.rateReview('node-math-1', reviewApi.RATING.REMEMBER)

  // 在「线性代数」通过卡片管理直接为未入库节点添加卡片（应自动创建复习节点并保存到线性代数文件夹）
  reviewApi.addCard(
    'node-la-1',
    { type: 'qa', front: '什么是特征值？', back: 'Ax = λx' },
    {
      name: '特征值与特征向量',
      path: '线代总览/特征值与特征向量',
      fileId: '线性代数.smm',
      fileName: '线性代数'
    }
  )

  // 新增未绑定导图的手动复习项与自定义预设（应写入根目录 review.json）
  reviewApi.addPreset({ name: '考前冲刺', cycles: [1, 2, 4] })
  reviewApi.addReview({
    uid: 'node-manual-1',
    name: '背诵公式表',
    path: '背诵公式表',
    fileId: '',
    fileName: '手动添加'
  })

  await reviewApi.flushReviewWrites()
  await settle(30)

  const mathReview = readJson(env.fs, 'maps/高等数学/review.json')
  const laReview = readJson(env.fs, 'maps/线性代数/review.json')
  const rootReview = readJson(env.fs, 'review.json')

  const mathNode = mathReview && mathReview.nodes && mathReview.nodes['node-math-1']
  const laNode = laReview && laReview.nodes && laReview.nodes['node-la-1']
  const manualNode = rootReview && rootReview.nodes && rootReview.nodes['node-manual-1']
  const hasCustomPreset =
    rootReview &&
    Array.isArray(rootReview.presets) &&
    rootReview.presets.some(p => p.name === '考前冲刺')

  report(
    'R1 复习节点与导图保存在同一文件夹 maps/<导图名>/review.json',
    !!(
      mathNode &&
      mathNode.times === 1 &&
      mathNode.cards &&
      mathNode.cards.length === 1 &&
      !mathReview.nodes['node-la-1'] &&
      laNode &&
      laNode.cards &&
      laNode.cards.length === 1 &&
      manualNode &&
      hasCustomPreset
    ),
    `高等数学节点数=${Object.keys((mathReview && mathReview.nodes) || {}).length}，线性代数节点数=${
      Object.keys((laReview && laReview.nodes) || {}).length
    }，根目录未归属节点数=${Object.keys((rootReview && rootReview.nodes) || {}).length}`
  )
}

// ---------- R2：清空 localStorage 后重开工作目录，从本地 review.json 完整恢复复习节点 ----------
{
  const env = installEnv({ serverKeys: null })
  // 模拟磁盘上已有导图与同目录的 review.json，而浏览器 localStorage 完全为空
  env.fs.seed(
    'maps/计算机网络/data.smm',
    JSON.stringify({ root: root('TCP/IP'), layout: 'mindMap' })
  )
  env.fs.seed(
    'maps/计算机网络/review.json',
    JSON.stringify({
      version: 1,
      fileName: '计算机网络',
      fileId: '计算机网络.smm',
      nodes: {
        'uid-tcp': {
          uid: 'uid-tcp',
          name: '三次握手',
          path: 'TCP/IP/三次握手',
          fileId: '计算机网络.smm',
          fileName: '计算机网络',
          cycles: [1, 3, 7],
          times: 2,
          nextCycleIndex: 2,
          status: 'reviewing',
          cards: [{ id: 'c1', type: 'qa', front: '三次握手过程？', back: 'SYN -> SYN+ACK -> ACK' }]
        }
      }
    })
  )

  const mod = await fresh()
  const { directoryStorage, store, reviewApi } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await reviewApi.syncReviewFromDirectory()

  const node = reviewApi.getNode('uid-tcp')
  const count = reviewApi.getFileNodeCount('计算机网络.smm')
  report(
    'R2 浏览器无缓存时从 maps/<导图名>/review.json 完整恢复复习数据',
    !!(node && node.name === '三次握手' && node.cards.length === 1 && count === 1),
    `恢复节点=${node && node.name}，卡片数=${node && node.cards && node.cards.length}，导图关联数=${count}`
  )
}

// ---------- R3：首次接入工作目录时自动把 localStorage 旧复习节点迁移到对应导图文件夹 ----------
{
  const env = installEnv({ serverKeys: null })
  // 预置旧版 localStorage 文件列表与复习数据
  env.ls.setItem(
    'SIMPLE_MIND_MAP_FILE_LIST',
    JSON.stringify([{ id: 'file_legacy_1', name: '操作系统' }])
  )
  env.ls.setItem(
    'MIND_MAP_REVIEW_DATA',
    JSON.stringify({
      version: 5,
      defaultCycles: [2, 5, 10],
      nodes: {
        'uid-os-1': {
          uid: 'uid-os-1',
          name: '进程调度',
          path: '操作系统/进程调度',
          fileId: 'file_legacy_1',
          fileName: '操作系统',
          cycles: [2, 5, 10],
          times: 1
        }
      }
    })
  )
  env.fs.seed(
    'maps/操作系统/data.smm',
    JSON.stringify({ root: root('操作系统'), layout: 'mindMap' })
  )

  const mod = await fresh()
  const { directoryStorage, store, reviewApi } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await reviewApi.syncReviewFromDirectory()
  await reviewApi.flushReviewWrites()

  const osReview = readJson(env.fs, 'maps/操作系统/review.json')
  const migratedNode = osReview && osReview.nodes && osReview.nodes['uid-os-1']
  report(
    'R3 首次打开工作目录自动迁移 localStorage 复习数据到 maps/<导图名>/review.json',
    !!(
      migratedNode &&
      migratedNode.fileId === '操作系统.smm' &&
      migratedNode.fileName === '操作系统'
    ),
    `maps/操作系统/review.json 中节点=${migratedNode && migratedNode.name}，fileId=${
      migratedNode && migratedNode.fileId
    }`
  )
}

// ---------- R4：重命名导图文件夹同步迁移并更新 review.json ----------
{
  const env = installEnv({ serverKeys: null })
  const mod = await fresh()
  const { directoryStorage, store, reviewApi } = mod
  await directoryStorage.openDirectoryPicker()
  store.commit('setIsDirectoryMode', true)
  await directoryStorage.createMapFile('旧名称', { root: root('中心'), layout: 'mindMap' })
  await reviewApi.syncReviewFromDirectory()
  reviewApi.addReview({
    uid: 'uid-r4',
    name: '节点A',
    fileId: '旧名称.smm',
    fileName: '旧名称'
  })
  await reviewApi.flushReviewWrites()

  const ren = await directoryStorage.renameMapFile('旧名称.smm', '新名称')
  reviewApi.renameFileForReviews('旧名称.smm', '新名称', ren.fileName)
  await reviewApi.flushReviewWrites()

  const newReview = readJson(env.fs, 'maps/新名称/review.json')
  const oldReview = readJson(env.fs, 'maps/旧名称/review.json')
  const n = newReview && newReview.nodes && newReview.nodes['uid-r4']
  report(
    'R4 重命名导图后 review.json 随文件夹移动并更新归属文件名',
    !!(oldReview === null && n && n.fileId === '新名称.smm' && n.fileName === '新名称'),
    `旧路径存在=${oldReview !== null}，新路径节点 fileId=${n && n.fileId}`
  )
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
