@echo off
setlocal enabledelayedexpansion
title ProxiSpeak - Development Runner

echo ===================================================
echo             PROXISPEAK STARTUP LAUNCHER
echo ===================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: 1. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check Server Dependencies
if not exist "server\node_modules" (
    echo [INFO] Installing server dependencies...
    cd /d "%ROOT_DIR%server"
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install server dependencies.
        pause
        exit /b 1
    )
    cd /d "%ROOT_DIR%"
)

:: 3. Check Client Dependencies
if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd /d "%ROOT_DIR%client"
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install client dependencies.
        pause
        exit /b 1
    )
    cd /d "%ROOT_DIR%"
)

:: 4. Launch Backend Server in a new window
echo [INFO] Starting Backend Server on port 5000...
start "ProxiSpeak Server (Backend)" cmd /k "cd /d ""%ROOT_DIR%server"" && npm run dev"

:: Short delay to let backend bind its port
timeout /t 2 /nobreak >nul

:: 5. Launch Frontend Client in a new window
echo [INFO] Starting Frontend Client (Vite)...
start "ProxiSpeak Client (Frontend)" cmd /k "cd /d ""%ROOT_DIR%client"" && npm run dev"

echo.
echo ===================================================
echo [SUCCESS] Both Server and Client are launching!
echo  - Server: http://localhost:5000 (Health: http://localhost:5000/health)
echo  - Client: http://localhost:5173
echo ===================================================
echo.
echo You can close this window at any time.
pause

