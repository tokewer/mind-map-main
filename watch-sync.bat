@echo off
chcp 65001 >nul
echo ========================================================
echo   复习思维导图 - 程序文件改动自动上传 GitHub 监听中
echo ========================================================
echo.
echo 只要程序源码或文件发生修改并保存，后台会自动 git commit 并 push 到 GitHub！
echo 保持此窗口打开即可实现全自动实时上传。
echo.

cd /d "%~dp0"
node scripts/watch-and-sync.mjs

echo.
pause
