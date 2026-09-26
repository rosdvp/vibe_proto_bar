@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)

start "Speakeasy prototype" cmd /k "npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173/"

endlocal
