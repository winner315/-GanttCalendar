@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GanttCalendar Web

echo ============================================
echo   GanttCalendar Web  (port 5174)
echo ============================================
echo.

if not exist "node_modules" (
  echo [1/3] first run: npm install ...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check network / npm registry.
    pause
    exit /b 1
  )
) else (
  echo [1/3] dependencies ok
)

echo [2/3] starting dev server ...
:: Minimized on purpose: a double-click from the desktop shortcut should not
:: dump a console over the screen. Restore it from the taskbar to read the log,
:: or close that window to stop the server.
start "GanttCalendar Web - dev server" /min cmd /c "cd /d %~dp0 && npm.cmd run dev"

echo [3/3] waiting for http://localhost:5174 ...
:: Poll before handing over: vite opens the browser itself once it is ready,
:: so this is only here to report a real failure instead of a blank tab.
set /a tries=0
:wait
set /a tries+=1
curl -s -o nul --max-time 1 http://localhost:5174/ && goto ready
if %tries% geq 60 (
  echo [ERROR] server did not come up within 60s.
  echo         Restore the minimized "GanttCalendar Web - dev server" window to see why.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo.
echo   Ready: http://localhost:5174
echo   To stop: close the minimized "GanttCalendar Web - dev server" window.
exit /b 0
