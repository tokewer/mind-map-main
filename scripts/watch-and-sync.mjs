import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import chokidar from 'chokidar'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const webPkgPath = path.join(rootDir, 'web/package.json')

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

function bumpPatchVersion() {
  if (!fs.existsSync(webPkgPath)) return null
  try {
    const pkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf-8'))
    const oldVersion = pkg.version || '1.0.0'
    const parts = oldVersion.split('.').map(n => parseInt(n, 10))
    if (parts.length === 3 && !parts.some(isNaN)) {
      parts[2] += 1
      pkg.version = parts.join('.')
    } else {
      pkg.version = '1.1.0'
    }
    fs.writeFileSync(webPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    console.log(`📌 版本号自动更新: ${oldVersion} -> ${pkg.version}`)
    return pkg.version
  } catch (err) {
    return null
  }
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

    // 自动更新版本号
    const version = bumpPatchVersion() || '1.1.0'

    // 暂存所有修改
    runInteractive('git add -A')

    // 生成提交信息
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const commitMsg = `auto: v${version} update app files [${timestamp}]`

    runInteractive(`git commit -m "${commitMsg}"`)

    // 拉取防冲突
    try {
      execSync('git pull --rebase origin master', { cwd: rootDir, stdio: 'inherit' })
    } catch (e) {}

    console.log(`\n🚀 正在自动推送至 GitHub: tokewer/mind-map-main (master)...`)
    execSync('git push origin master', { cwd: rootDir, stdio: 'inherit' })
    console.log(`✅ 程序更新 (v${version}) 已成功自动上传至 GitHub！`)
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

const watcher = chokidar.watch([
  path.join(rootDir, 'web/src'),
  path.join(rootDir, 'simple-mind-map/src'),
  path.join(rootDir, 'index.html'),
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'server.py')
], {
  ignored: [
    /(^|[\/\\])\../,
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
  syncTimer = setTimeout(doSync, 5000)
})
