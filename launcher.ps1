# 思绪思维导图 - 一键启动器
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PORT = 8080
$URL = "http://127.0.0.1:$PORT"

function Test-Port($port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $c)
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "       思绪思维导图 - 启动中" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

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