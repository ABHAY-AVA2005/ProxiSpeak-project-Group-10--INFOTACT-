@echo off
setlocal enabledelayedexpansion
title ProxiSpeak - Dual Instance Multi-Server Runner

echo ===================================================
echo     PROXISPEAK DUAL INSTANCE CLUSTER LAUNCHER
echo ===================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Check dependencies
if not exist "server\node_modules" (
    echo [INFO] Installing server dependencies...
    cd /d "%ROOT_DIR%server"
    call npm install
    cd /d "%ROOT_DIR%"
)

if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd /d "%ROOT_DIR%client"
    call npm install
    cd /d "%ROOT_DIR%"
)

:: Instance 1
echo [INFO] Starting Node Instance 1 on PORT 5000...
start "Instance 1 (Port 5000)" cmd /k "cd /d ""%ROOT_DIR%server"" && set PORT=5000 && npm start"

:: Instance 2
echo [INFO] Starting Node Instance 2 on PORT 5001...
start "Instance 2 (Port 5001)" cmd /k "cd /d ""%ROOT_DIR%server"" && set PORT=5001 && npm start"

timeout /t 2 /nobreak >nul

:: Frontend Client
echo [INFO] Starting Client on http://localhost:5173...
start "Frontend Client" cmd /k "cd /d ""%ROOT_DIR%client"" && npm run dev"

echo.
echo ===================================================
echo [SUCCESS] Dual instances + Frontend launched!
echo  - Instance 1: http://localhost:5000/health
echo  - Instance 2: http://localhost:5001/health
echo  - Client:     http://localhost:5173
echo ===================================================
pause

