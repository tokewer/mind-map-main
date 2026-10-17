# 复习思维导图 - 一键启动器 (增强自愈与多模式自适应版)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$DEFAULT_PORT = 8080
$PORT = $DEFAULT_PORT
$URL = "http://127.0.0.1:$PORT"

function Test-Port($port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $c)
}

function Find-FreePort($startPort) {
    for ($p = $startPort; $p -le ($startPort + 50); $p++) {
        if (-not (Test-Port $p)) {
            return $p
        }
    }
    return $startPort
}

function Test-ManagerRunning {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$DEFAULT_PORT/api/manager-ping" -UseBasicParsing -TimeoutSec 2 -Proxy $null
        return ($resp.StatusCode -eq 200 -and $resp.Content -match 'StudyToolCenter')
    } catch {
        return $false
    }
}

function Register-MindMapToManager {
    try {
        $regBody = @{
            id = 'mindmap'
            name = '思绪思维导图'
            emoji = '📚'
            description = '复习用思维导图，支持细粒度复习与历史版本'
            command = 'python'
            args = @('server.py', '8081')
            workingDirectory = $root
            port = 8081
            aliasIndex = 2
            healthUrl = '/'
            startTimeout = 45
            stopTimeout = 8
            url = ''
            mode = 'proxy'
            enabled = $true
            allowSuspend = $true
            openBrowser = $true
            shortcut = 'Ctrl+1'
        }
        $jsonStr = $regBody | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "http://127.0.0.1:$DEFAULT_PORT/api/apps" -Method Post -Body $jsonStr -ContentType 'application/json; charset=utf-8' -TimeoutSec 10 -Proxy $null | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "       复习思维导图 - 启动中" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ---------- 首选：交给「学习工具中心」 ----------
if (Test-ManagerRunning) {
    Write-Host "检测到「学习工具中心」正在运行，正在激活..." -ForegroundColor Green
    $activateSuccess = $false
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$DEFAULT_PORT/api/apps/mindmap/activate" -Method Post -TimeoutSec 180 -Proxy $null | Out-Null
        $activateSuccess = $true
    } catch {
        Write-Host "正在自动同步思维导图配置至管理器..." -ForegroundColor Yellow
        if (Register-MindMapToManager) {
            try {
                Invoke-RestMethod -Uri "http://127.0.0.1:$DEFAULT_PORT/api/apps/mindmap/activate" -Method Post -TimeoutSec 180 -Proxy $null | Out-Null
                $activateSuccess = $true
            } catch {}
        }
    }

    if ($activateSuccess) {
        Write-Host "已就绪，正在打开浏览器..." -ForegroundColor Green
        Start-Process "http://127.0.0.2:$DEFAULT_PORT"
        Write-Host ""
        Write-Host "运行中。要停止或挂起，请到「学习工具中心」页面操作。"
        exit 0
    } else {
        Write-Host "[提示] 通过管理器启动未就绪，改用独立方式启动..." -ForegroundColor Yellow
    }
}

# ---------- 兜底：独立启动方式 ----------
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 Python，请先安装 Python 3.10 及以上版本。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

if (Test-Port $PORT) {
    $ownerPid = (Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    $ownerProc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
    $isPyServer = $null -ne $ownerProc -and $ownerProc.Name -match 'python' -and $ownerProc.CommandLine -match 'server.py'

    if ($isPyServer) {
        $cmdline = [string]$ownerProc.CommandLine
        $isCurrentRoot = $cmdline.ToLower().Contains($root.TrimEnd('\').ToLower())
        $serverFileTime = (Get-Item "$root\server.py" -ErrorAction SilentlyContinue).LastWriteTime
        $procStartTime = $ownerProc.CreationDate
        $shouldRestart = -not $isCurrentRoot -or ($serverFileTime -gt $procStartTime)

        if ($shouldRestart) {
            Write-Host "检测到旧版服务进程 (PID $ownerPid)，正在重启以加载最新版本..." -ForegroundColor Yellow
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
    } else {
        $freePort = Find-FreePort 8081
        Write-Host "端口 $PORT 已被其他服务占用，自动切换到独立可用端口 $freePort..." -ForegroundColor Yellow
        $PORT = $freePort
        $URL = "http://127.0.0.1:$PORT"
    }
}

Write-Host "正在启动服务 (端口 $PORT)，请稍候..."
Start-Process python -ArgumentList "$root\server.py --port=$PORT" -WorkingDirectory $root -WindowStyle Minimized

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
