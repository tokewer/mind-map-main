import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import chokidar from 'chokidar'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function run(cmd) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    return ''
  }
}

function runInteractive(cmd) {
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' })
}

let syncTimer = null
let isSyncing = false

function doSync() {
  if (isSyncing) return
  isSyncing = true
  try {
    const status = run('git status --porcelain')
    if (!status) {
      isSyncing = false
      return
    }
    console.log('\n========================================')
    console.log('⚡ 检测到项目程序文件发生变更，开始自动同步上传...')
    console.log(status)
    
    // 暂存所有修改
    runInteractive('git add -A')
    
    // 生成提交信息
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const commitMsg = `auto: update app files [${timestamp}]`
    
    runInteractive(`git commit -m "${commitMsg}"`)
    console.log(`\n🚀 正在自动推送至 GitHub: tokewer/mind-map-main (master)...`)
    runInteractive('git push origin master')
    console.log(`✅ 程序更新已成功自动上传至 GitHub！`)
    console.log('========================================\n')
  } catch (err) {
    console.error('❌ 自动同步上传出错:', err.message)
  } finally {
    isSyncing = false
  }
}

console.log('👀 正在启动程序文件变动实时监听服务...')
console.log(`📂 监听目录: ${rootDir}`)
console.log('💡 只要您修改并保存了项目代码或程序文件，系统将在 5 秒后自动提交并上传至 GitHub 仓库！')

// 监听代码和程序目录，忽略 git、临时缓存、node_modules
const watcher = chokidar.watch([
  path.join(rootDir, 'web/src'),
  path.join(rootDir, 'simple-mind-map/src'),
  path.join(rootDir, 'index.html'),
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'server.py')
], {
  ignored: [
    /(^|[\/\\])\../, // 忽略隐藏文件/目录（如 .git）
    '**/node_modules/**',
    '**/.ai-memory/**',
    '**/dist/**'
  ],
  persistent: true,
  ignoreInitial: true
})

watcher.on('all', (event, filePath) => {
  console.log(`[文件变动] ${event}: ${path.relative(rootDir, filePath)}`)
  clearTimeout(syncTimer)
  syncTimer = setTimeout(doSync, 5000) // 5 秒防抖，等待连续保存完成
})
