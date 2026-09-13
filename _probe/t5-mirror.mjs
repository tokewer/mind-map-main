// 探针 T5：离线会话后磁盘镜像回灌 —— 磁盘旧内容不得覆盖浏览器中的新内容
import { installEnv, sleep, settle } from './harness.mjs'

const results = []
const report = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

let seq = 200
const fresh = async () => import('./bundle.mjs?v=' + ++seq)
const root = text => ({ data: { text, uid: 'uid-' + text }, children: [] })
const FILE = 'SIMPLE_MIND_MAP_FILE_file_default'

// 场景（真实用户路径）：
//  1) 上一次会话离线（server.py 未启动）：编辑保存在 localStorage，磁盘镜像停在旧内容；
//  2) 本次启动服务仍不可用 → initialPullPending = true；
//  3) 用户这次没再编辑（changedSinceInitialPull = false）；
//  4) 服务恢复（用户启动了 server.py），周期同步探测到 → prepareServerSave 走
//     pullFromServer(preferDisk = !changedSinceInitialPull) = preferDisk=true 回灌。
// 期望：浏览器里较新的内容不被磁盘旧内容覆盖。
{
  const diskKeys = {
    SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_default', name: 'wiki', createdAt: 1, updatedAt: 1 }]),
    SIMPLE_MIND_MAP_CURRENT_FILE: 'file_default',
    [FILE]: JSON.stringify({ root: root('OLD-disk'), layout: 'mindMap' })
  }
  const env = installEnv({ serverKeys: null })
  env.ls.setItem('SIMPLE_MIND_MAP_FILE_LIST', diskKeys.SIMPLE_MIND_MAP_FILE_LIST)
  env.ls.setItem('SIMPLE_MIND_MAP_CURRENT_FILE', 'file_default')
  env.ls.setItem(FILE, JSON.stringify({ root: root('NEW-local'), layout: 'mindMap' }))

  const mod = await fresh()
  mod.api.initFileStorage() // 服务不可用 → initialPullPending=true
  const before = JSON.parse(env.ls.getItem(FILE)).root.data.text

  // 服务恢复
  env.restoreServer(diskKeys)
  // 忠实还原周期同步：先强制重探测（此时才会把 serverAvailable 置 true），再走保存前准备
  const probed = await mod.serverStorage.probeServer(true)
  await mod.serverStorage.flushServerSave()
  await settle(30)

  const after = JSON.parse(env.ls.getItem(FILE)).root.data.text
  report(
    'T13 服务恢复回灌：磁盘旧内容不得覆盖浏览器新内容',
    before === 'NEW-local' && after === 'NEW-local',
    `probeServer=${probed}，回灌前=${before}，回灌后=${after}（期望均为 NEW-local；变成 OLD-disk 即旧数据覆盖新数据）`
  )
  await sleep(10)
}

// 对照场景：本次会话确实编辑过（changedSinceInitialPull=true）时，必须以本地为准
{
  const diskKeys = {
    SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_default', name: 'wiki', createdAt: 1, updatedAt: 1 }]),
    SIMPLE_MIND_MAP_CURRENT_FILE: 'file_default',
    [FILE]: JSON.stringify({ root: root('OLD-disk'), layout: 'mindMap' })
  }
  const env = installEnv({ serverKeys: null })
  env.ls.setItem('SIMPLE_MIND_MAP_FILE_LIST', diskKeys.SIMPLE_MIND_MAP_FILE_LIST)
  env.ls.setItem('SIMPLE_MIND_MAP_CURRENT_FILE', 'file_default')
  env.ls.setItem(FILE, JSON.stringify({ root: root('OLD-local'), layout: 'mindMap' }))

  const mod = await fresh()
  mod.api.initFileStorage()
  // 本次会话编辑 → 标记 changedSinceInitialPull
  mod.serverStorage.scheduleServerAutoSave()
  env.ls.setItem(FILE, JSON.stringify({ root: root('NEWEST-local'), layout: 'mindMap' }))
  env.restoreServer(diskKeys)
  await mod.serverStorage.probeServer(true)
  await mod.serverStorage.flushServerSave()
  await settle(30)
  const after = JSON.parse(env.ls.getItem(FILE)).root.data.text
  report(
    'T14 本次会话已编辑时：不得被磁盘内容回退',
    after === 'NEWEST-local',
    `回灌后=${after}（期望 NEWEST-local）`
  )
  await sleep(10)
}

// 必须保持的既有行为：全新浏览器（localStorage 为空）时，从磁盘回填
{
  const diskKeys = {
    SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_default', name: 'wiki', createdAt: 1, updatedAt: 1 }]),
    SIMPLE_MIND_MAP_CURRENT_FILE: 'file_default',
    [FILE]: JSON.stringify({ root: root('FROM-disk'), layout: 'mindMap' })
  }
  const env = installEnv({ serverKeys: diskKeys }) // 服务可用、localStorage 为空
  const mod = await fresh()
  mod.api.initFileStorage()
  const after = JSON.parse(env.ls.getItem(FILE) || 'null')
  const text = after && after.root && after.root.data.text
  const cur = env.ls.getItem('SIMPLE_MIND_MAP_CURRENT_FILE')
  report(
    'T15 全新浏览器（本地为空）仍应从磁盘回填',
    text === 'FROM-disk' && cur === 'file_default',
    `回填后 root.text=${text}，current=${cur}（期望 FROM-disk / file_default）`
  )
}

// 浏览器被清缓存（本地无该键）时也应从磁盘补齐，不影响既有恢复能力
{
  const diskKeys = {
    SIMPLE_MIND_MAP_FILE_LIST: JSON.stringify([{ id: 'file_default', name: 'wiki', createdAt: 1, updatedAt: 1 }]),
    SIMPLE_MIND_MAP_CURRENT_FILE: 'file_default',
    [FILE]: JSON.stringify({ root: root('FROM-disk2'), layout: 'mindMap' })
  }
  const env = installEnv({ serverKeys: diskKeys })
  // 本地只有文件清单（清单存在），但正文键缺失 → 正文应被补齐
  env.ls.setItem('SIMPLE_MIND_MAP_FILE_LIST', diskKeys.SIMPLE_MIND_MAP_FILE_LIST)
  const mod = await fresh()
  mod.api.initFileStorage()
  const after = JSON.parse(env.ls.getItem(FILE) || 'null')
  const text = after && after.root && after.root.data.text
  report('T16 正文键缺失时仍应从磁盘补齐', text === 'FROM-disk2', `回填后 root.text=${text}（期望 FROM-disk2）`)
}

console.log('\n==== 汇总 ====')
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`))
const failed = results.filter(r => !r.pass).length
console.log(`通过 ${results.length - failed}/${results.length}`)
process.exit(failed ? 1 : 0)
