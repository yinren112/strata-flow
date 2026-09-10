@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Opening the standalone offline edition instead.
  start "" "STRATA-Offline.html"
  exit /b
)
node scripts\launch.mjs
pause
