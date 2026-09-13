# 思绪思维导图 - 一键启动器
#
# 行为：
#   1. 如果「学习工具中心」管理器正在运行 —— 交给它启动并打开，
#      这样导图会和其它工具共用统一入口、支持挂起/恢复。
#   2. 否则按老办法，自己用 8080 端口启动（原来的用法完全不变）。
#
# 两种情况都会在浏览器里打开页面，用户不需要关心区别。

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PORT = 8080
$URL = "http://127.0.0.1:$PORT"

# 管理器的位置（相对本目录：..\..\程序管理）
$centerRoot = Join-Path (Split-Path -Parent (Split-Path -Parent $root)) '程序管理'
$centerExe = Join-Path $centerRoot '学习工具中心.exe'

function Test-Port($port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $c)
}

function Test-ManagerRunning {
    # 管理器的身份接口：只有它会返回 StudyToolCenter
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$PORT/api/manager-ping" `
            -UseBasicParsing -TimeoutSec 2 -Proxy $null
        return ($resp.StatusCode -eq 200 -and $resp.Content -match 'StudyToolCenter')
    } catch {
        return $false
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "       思绪思维导图 - 启动中" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ---------- 首选：交给「学习工具中心」 ----------
if ((Test-ManagerRunning) -and (Test-Path $centerExe)) {
    Write-Host "检测到「学习工具中心」正在运行，交给它启动…" -ForegroundColor Green
    try {
        $body = @{}
        Invoke-RestMethod -Uri "http://127.0.0.1:$PORT/api/apps/mindmap/activate" `
            -Method Post -TimeoutSec 180 -Proxy $null | Out-Null
        Write-Host "已就绪，正在打开浏览器…" -ForegroundColor Green
        # 管理器会把它挂到统一入口（127.0.0.2:8080）；用别名地址打开，
        # 这样和从管理器首页点进来是完全一样的地址。
        Start-Process "http://127.0.0.2:$PORT"
        Write-Host ""
        Write-Host "运行中。要停止或挂起，请到「学习工具中心」页面操作。"
        exit 0
    } catch {
        Write-Host "[提示] 通过管理器启动失败，改用独立方式启动…" -ForegroundColor Yellow
    }
}

# ---------- 兜底：原来的独立启动方式 ----------
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 Python，请先安装 Python 3.10 及以上版本。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

if (Test-Port $PORT) {
    $ownerPid = (Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1).OwningProcess
    $ownerProc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
    $isPyServer = $null -ne $ownerProc -and $ownerProc.Name -match 'python' -and $ownerProc.CommandLine -match 'server\.py'
    if (-not $isPyServer) {
        Write-Host "[警告] 端口 $PORT 已被其他程序占用，无法启动本服务。" -ForegroundColor Red
        if ($ownerProc) { Write-Host "占用进程：$($ownerProc.Name) (PID $ownerPid)" -ForegroundColor Red }
        Write-Host ""
        Write-Host "提示：如果占用者是「学习工具中心」，说明管理器正在运行，" -ForegroundColor Yellow
        Write-Host "      它刚刚可能还没就绪。请稍等几秒再双击本启动器，" -ForegroundColor Yellow
        Write-Host "      或者直接双击「学习工具中心.exe」统一启动。      " -ForegroundColor Yellow
        Read-Host "按回车退出"
        exit 1
    }
    # 占用者是本项目 server.py 的进程：
    # - 命令行指向当前目录（本启动器新版本用完整路径启动）且 server.py 未更新 → 复用，直接打开
    # - 否则（其他目录的旧进程 / 旧版相对路径启动 / 代码已更新未重启）→ 杀掉并重启当前目录最新版
    $cmdline = [string]$ownerProc.CommandLine
    $isCurrentRoot = $cmdline.ToLower().Contains($root.TrimEnd('\').ToLower())
    $serverFileTime = (Get-Item "$root\server.py" -ErrorAction SilentlyContinue).LastWriteTime
    $procStartTime = $ownerProc.CreationDate
    $shouldRestart = -not $isCurrentRoot -or ($serverFileTime -gt $procStartTime)
    if ($shouldRestart) {
        Write-Host "检测到旧版/其他目录的服务进程 (PID $ownerPid)，正在重启以加载当前目录的最新版本..." -ForegroundColor Yellow
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-Port $PORT)) { break }
        }
    } else {
        Write-Host "服务已在运行，正在打开浏览器..." -ForegroundColor Green
        Start-Process $URL
        exit 0
    }
}

Write-Host "正在启动服务，请稍候..."
Start-Process python -ArgumentList "$root\server.py" -WorkingDirectory $root -WindowStyle Minimized

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Port $PORT) { $ready = $true; break }
}
if (-not $ready) {
    Write-Host "[错误] 服务启动失败。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Write-Host "服务已就绪，正在打开浏览器..." -ForegroundColor Green
Start-Process $URL
Write-Host ""
Write-Host "运行中。任务栏最小化的黑色窗口就是服务，关闭它即可停止。"
Write-Host "再次双击「启动思绪思维导图.bat」可重新打开。"
