@echo off
rem ------ silent self-hide: a direct double-click is relayed to a hidden
rem window via wscript, so no console ever flashes ------------------------
rem NOTE: keep ALL echoed text ASCII here. Under cmd, multi-byte output
rem (e.g. chcp 65001 + Chinese) can restart cmd's line reparse mid-byte,
rem which surfaces as "xxx is not recognized" or "... unexpected". ASCII
rem echo/rem lines guarantee this script parses reliably.
if not "%~1"=="hidden" (
  if not exist logs mkdir logs
  start "" wscript.exe "%~dp0run-hidden.vbs" start
  exit /b
)

cd /d "%~dp0"
title GanttCalendar Web (hidden)

echo ============================================
echo   GanttCalendar Web   (api 8010 + web 5174)
echo ============================================
echo.
echo   All windows hidden. Logs: %~dp0logs\*.log

rem ---------- 1/4 frontend deps ----------
if not exist "node_modules" (
  echo [1/4] first run: npm install ...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed. See logs\startup.log
    goto :err
  )
) else (
  echo [1/4] frontend deps ok
)

rem ---------- 2/4 backend venv + .env ----------
if not exist ".venv\Scripts\python.exe" (
  echo [2/4] first run: creating .venv and installing backend deps ...
  python -m venv .venv
  if errorlevel 1 (
    echo [ERROR] python -m venv failed
    goto :err
  )
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [ERROR] pip install failed
    goto :err
  )
) else (
  echo [2/4] backend venv ok
)

if not exist ".env" (
  echo.
  echo [WARN] web\.env not found - backend cannot connect to MySQL.
  echo.
) else (
  echo [2/4] .env found
)

rem ---------- 3/4 backend on 8010 ----------
echo [3/4] check port 8010 ...
netstat -ano | findstr ":8010" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo   backend already running, reuse.
) else (
  echo   starting backend uvicorn (hidden) ...
  start "" wscript.exe "%~dp0run-hidden.vbs" api
)

rem ---------- 4/4 frontend on 5174 ----------
echo [4/4] check port 5174 ...
netstat -ano | findstr ":5174" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo   frontend already running, reuse.
) else (
  echo   starting dev server (hidden) ...
  start "" wscript.exe "%~dp0run-hidden.vbs" web
)

echo.
echo waiting for services ...
set /a tries=0
:wait
set /a tries+=1
curl -s -o nul --max-time 1 http://localhost:5174/ && goto ready
if %tries% geq 60 (
  echo [ERROR] frontend did not come up within 60s. See logs\web-server.log
  goto :err
)
ping -n 2 127.0.0.1 >nul
goto wait

:ready
echo.
echo   Web:  http://localhost:5174
echo   API:  http://127.0.0.1:8010/api/health
echo   Logs: %~dp0logs\startup.log / api-server.log / web-server.log
echo   Stop: Task Manager (ports 8010/5174)
exit /b 0

:err
echo.
echo   Startup FAILED. Inspect logs\*.log
ping -n 6 127.0.0.1 >nul
exit /b 1
