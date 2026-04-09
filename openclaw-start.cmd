@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "APP_URL=http://127.0.0.1:3000"
set "BACKEND_URL=http://127.0.0.1:3001/api/system/detect"

cd /d "%ROOT%"

echo ==========================================
echo OpenClaw one-click starter
echo Root: %ROOT%
echo ==========================================

where node >nul 2>nul
if errorlevel 1 goto :missing_node

where npm.cmd >nul 2>nul
if errorlevel 1 goto :missing_npm

if not exist "node_modules" (
  echo.
  echo node_modules not found. Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :install_failed
)

echo.
echo Ensuring latest backend and frontend code is running...
call :free_node_port 3001 backend
if errorlevel 1 goto :port_conflict
call :free_node_port 3000 frontend
if errorlevel 1 goto :port_conflict

echo.
echo Starting backend on port 3001...
start "OpenClaw Backend" cmd /k "cd /d ""%ROOT%"" && title OpenClaw Backend && npm.cmd run dev --workspace=@openclaw-manager/backend"

echo.
echo Starting frontend on port 3000...
start "OpenClaw Frontend" cmd /k "cd /d ""%ROOT%"" && title OpenClaw Frontend && npm.cmd run dev --workspace=@openclaw-manager/web -- --host 127.0.0.1"

echo.
echo Waiting for backend and frontend to respond...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $targets=@('http://127.0.0.1:3001/api/system/detect','http://127.0.0.1:3000'); $deadline=(Get-Date).AddSeconds(60); foreach($url in $targets){ $ready=$false; while((Get-Date) -lt $deadline){ try { $resp=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3; if($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500){ $ready=$true; break } } catch {}; Start-Sleep -Seconds 2 }; if(-not $ready){ exit 1 } }; exit 0"
if errorlevel 1 goto :startup_timeout

echo.
echo Opening browser: %APP_URL%
start "" "%APP_URL%"
echo Done.
exit /b 0

:port_listening
netstat -ano | findstr /C:":%~1 " | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  exit /b 1
) else (
  exit /b 0
)

:free_node_port
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=%~1; $role='%~2'; $conns=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if(-not $conns){ exit 0 }; $blocked=$false; foreach($pid in $conns){ $proc=Get-Process -Id $pid -ErrorAction SilentlyContinue; if($proc -and $proc.ProcessName -eq 'node'){ Write-Host ('Stopping existing ' + $role + ' node process PID ' + $pid + ' on port ' + $port + '...'); Stop-Process -Id $pid -Force -ErrorAction Stop } elseif($proc){ Write-Host ('Port ' + $port + ' is occupied by non-node process ' + $proc.ProcessName + ' (PID ' + $pid + ').'); $blocked=$true } }; if($blocked){ exit 1 }; Start-Sleep -Milliseconds 800; exit 0"
if errorlevel 1 exit /b 1
exit /b 0

:missing_node
echo.
echo Node.js was not found in PATH.
echo Please install Node.js 20+ and try again.
pause
exit /b 1

:missing_npm
echo.
echo npm.cmd was not found in PATH.
echo Please install Node.js and try again.
pause
exit /b 1

:install_failed
echo.
echo Dependency installation failed.
echo Fix the npm error above and run this file again.
pause
exit /b 1

:port_conflict
echo.
echo Startup aborted because port 3000 or 3001 is occupied by another application.
echo Close the conflicting process and run this file again.
pause
exit /b 1

:startup_timeout
echo.
echo Startup timed out.
echo Frontend: %APP_URL%
echo Backend: %BACKEND_URL%
echo Check the two terminal windows for errors.
pause
exit /b 1
