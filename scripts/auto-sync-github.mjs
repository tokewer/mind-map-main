import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function run(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'pipe'] }).trim()
}

function runInteractive(cmd) {
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' })
}

console.log('🚀 开始执行 GitHub 自动化检查与同步流程...')
console.log(`📂 工作根目录: ${rootDir}`)

try {
  // 1. 检查 git 状态
  const statusOutput = run('git status --porcelain')
  if (!statusOutput) {
    console.log('✨ 工作区很干净，没有检测到任何未提交的代码变更。')
    console.log('🔄 正在同步远程 master 最新状态...')
    runInteractive('git push origin master')
    console.log('✅ 远程已是最新！GitHub Pages 处于同步状态。')
    process.exit(0)
  }

  console.log('📝 检测到以下文件发生变更：')
  console.log(statusOutput)

  // 2. 添加所有变更
  console.log('\n📦 正在暂存文件变更 (git add -A)...')
  runInteractive('git add -A')

  // 3. 生成带时间戳的提交信息
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const customMsg = process.argv.slice(2).join(' ').trim()
  const commitMsg = customMsg ? `${customMsg} (${timestamp})` : `auto: update review mind-map [${timestamp}]`

  console.log(`💬 提交信息: "${commitMsg}"`)
  runInteractive(`git commit -m "${commitMsg}"`)

  // 4. 推送到远程
  console.log('\n🚀 正在推送到 GitHub master 分支...')
  runInteractive('git push origin master')

  console.log('\n🎉 推送完成！GitHub Actions 已自动触发构建并部署至 GitHub Pages。')
  console.log('🌐 仓库页面: https://github.com/tokewer/mind-map-main')
} catch (error) {
  console.error('\n❌ 同步过程中发生错误:', error.message)
  process.exit(1)
}
