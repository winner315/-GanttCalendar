@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GanttCalendar - create desktop shortcut

echo This will create (or overwrite) a shortcut on your desktop:
echo   %Desktop%
echo.
echo Clean up an existing one first if you do not want it replaced.
echo.

powershell -NoProfile -File "%~dp0make-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] shortcut creation failed - see the message above.
  pause
  exit /b 1
)

echo.
echo Done. The shortcut name comes from assets\shortcut-name.txt.
pause
