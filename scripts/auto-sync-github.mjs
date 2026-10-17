import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const webPkgPath = path.join(rootDir, 'web/package.json')
const changelogPath = path.join(rootDir, 'CHANGELOG.md')

function run(cmd) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    return null
  }
}

function runInteractive(cmd) {
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' })
}

// 递增版本号 (SemVer Patch: x.y.z -> x.y.(z+1))
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
    console.warn('⚠️ 读取或更新 package.json 版本号失败:', err.message)
    return null
  }
}

// 获取当前版本号
function getCurrentVersion() {
  if (!fs.existsSync(webPkgPath)) return '1.1.0'
  try {
    const pkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf-8'))
    return pkg.version || '1.1.0'
  } catch (e) {
    return '1.1.0'
  }
}

// 带重试机制的 Git 命令执行
function runWithRetry(cmd, maxRetries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`执行命令 (尝试 ${attempt}/${maxRetries}): ${cmd}`)
      runInteractive(cmd)
      return true
    } catch (err) {
      console.warn(`⚠️ 第 ${attempt} 次执行失败: ${err.message}`)
      if (attempt < maxRetries) {
        console.log(`⏳ 等待 ${delayMs / 1000} 秒后自动重试...`)
        execSync(`node -e "setTimeout(() => {}, ${delayMs})"`)
      } else {
        throw err
      }
    }
  }
  return false
}

console.log('========================================================')
console.log('🚀 开始执行 GitHub 自动化检查、版本更新与同步流程...')
console.log(`📂 工作根目录: ${rootDir}`)
console.log('========================================================\n')

try {
  // 1. 检查是否存在未提交变更
  const statusOutput = run('git status --porcelain')
  const shouldBump = process.argv.includes('--bump') || (statusOutput && statusOutput.length > 0)

  let version = getCurrentVersion()
  if (shouldBump) {
    version = bumpPatchVersion() || version
  }

  // 2. 检查是否有前端代码修改需要更新构建
  const checkStatus = run('git status --porcelain')
  if (!checkStatus) {
    console.log('✨ 工作区很干净，没有检测到任何未提交的代码变更。')
    console.log('🔄 正在同步远程 master 最新状态...')
    runWithRetry('git pull --rebase origin master', 2)
    runWithRetry('git push origin master', 3)
    console.log('✅ 远程已是最新！GitHub Pages 与仓库保持完全同步。')
    process.exit(0)
  }

  console.log('📝 检测到以下文件发生变更：')
  console.log(checkStatus)

  // 3. 检查是否需要编译构建最新产物
  const needsBuild = /web\/src|simple-mind-map\/src|index\.html/.test(checkStatus)
  if (needsBuild) {
    console.log('\n🔨 检测到前端核心代码变更，正在执行生产构建打包...')
    try {
      execSync('npm run build', {
        cwd: path.join(rootDir, 'web'),
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: '--openssl-legacy-provider' }
      })
      console.log('✅ 生产构建完成，dist 产物已更新！')
    } catch (buildErr) {
      console.warn('⚠️ 生产构建遇到警告或错误，继续暂存现有文件:', buildErr.message)
    }
  }

  // 4. 暂存所有变更
  console.log('\n📦 正在暂存文件变更 (git add -A)...')
  runInteractive('git add -A')

  // 5. 生成标准提交信息
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const customArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--')).join(' ').trim()
  const commitMsg = customArgs ? `v${version}: ${customArgs} (${timestamp})` : `v${version}: update review mind-map [${timestamp}]`

  console.log(`💬 提交信息: "${commitMsg}"`)
  runInteractive(`git commit -m "${commitMsg}"`)

  // 6. 推送前先 rebase 拉取远程，防止 non-fast-forward 冲突
  console.log('\n🔄 正在拉取远端更新以防止冲突 (git pull --rebase origin master)...')
  try {
    runWithRetry('git pull --rebase origin master', 2)
  } catch (pullErr) {
    console.warn('⚠️ 远端拉取异常，尝试直接推送:', pullErr.message)
  }

  // 7. 推送至 GitHub
  console.log('\n🚀 正在推送到 GitHub master 分支 (tokewer/mind-map-main)...')
  runWithRetry('git push origin master', 3)

  console.log('\n========================================================')
  console.log(`🎉 推送完成！当前应用版本: v${version}`)
  console.log('🚀 GitHub Actions 已自动触发构建并部署至 GitHub Pages。')
  console.log('🌐 仓库页面: https://github.com/tokewer/mind-map-main')
  console.log('========================================================\n')
} catch (error) {
  console.error('\n❌ 同步过程中发生错误:', error.message)
  console.log('\n💡 排查建议：')
  console.log('  1. 网络连接：请检查网络是否能够顺畅访问 https://github.com。若有代理请确保已开启。')
  console.log('  2. Git 凭证：请确保已配置 GitHub 账户权限（SSH Key 或 Personal Access Token）。')
  console.log('  3. 分支保护：请检查远程 master 分支是否存在冲突或强制保护规则。')
  console.log('  4. 手动重试：您可以在终端运行 "node scripts/auto-sync-github.mjs" 重新同步。\n')
  process.exit(1)
}
