@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   PaiQi GanTeTu - YiJianQiDong (5174)
echo ============================================

if not exist "node_modules" (
  echo [1/2] npm install...
  call npm.cmd install
  if errorlevel 1 ( echo [ERROR] npm install fail & pause & exit /b 1 )
) else (
  echo [1/2] deps ok
)

echo [2/2] starting vite dev server ...
start "gantt-web-vite" cmd /k "cd /d %~dp0 && npm.cmd run dev"
echo.
echo   URL: http://localhost:5174
echo close window "gantt-web-vite" to stop.
exit /b 0
