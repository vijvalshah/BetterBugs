@echo off
setlocal enabledelayedexpansion

:: ============================================
:: BetterBugs Automated Setup Script (Windows)
:: ============================================

echo ========================================
echo   BetterBugs Automated Setup
echo ========================================
echo.

:: Check if running as administrator (for port access)
:: Not required for basic setup, but good to know

:: ============================================
:: Step 1: Check Prerequisites
:: ============================================
echo [1/7] Checking prerequisites...

:: Check Go
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo   ERROR: Go is not installed or not in PATH
    echo   Please install Go 1.22+ from https://go.dev/dl/
    exit /b 1
)
for /f "tokens=2" %%i in ('go version') do set GO_VERSION=%%i
echo   Go: %GO_VERSION%

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   ERROR: Node.js is not installed or not in PATH
    echo   Please install Node.js 18+ from https://nodejs.org/
    exit /b 1
)
for /f "tokens=1" %%i in ('node -v') do set NODE_VERSION=%%i
echo   Node.js: %NODE_VERSION%

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo   WARNING: Python not found in PATH - MCP server will not be available
    set PYTHON_AVAILABLE=0
) else (
    for /f "tokens=1" %%i in ('python --version') do set PYTHON_VERSION=%%i
    echo   Python: %PYTHON_VERSION%
    set PYTHON_AVAILABLE=1
)

echo   All prerequisites met!
echo.

:: ============================================
:: Step 2: Setup API
:: ============================================
echo [2/7] Setting up API server...

cd /d "%~dp0apps\api"

if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo   Created .env from template
    ) else (
        echo   WARNING: No .env.example found
    )
)

go mod tidy >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Failed to install Go dependencies
    exit /b 1
)
echo   API dependencies installed

:: ============================================
:: Step 3: Setup Dashboard
:: ============================================
echo [3/7] Setting up Dashboard...

cd /d "%~dp0apps\dashboard"

if not exist "node_modules" (
    call npm install >nul 2>&1
    if %errorlevel% neq 0 (
        echo   ERROR: Failed to install Dashboard dependencies
        exit /b 1
    )
    echo   Dashboard dependencies installed
) else (
    echo   Dashboard dependencies already installed
)

:: ============================================
:: Step 4: Setup Extension
:: ============================================
echo [4/7] Setting up Extension...

cd /d "%~dp0apps\extension"

if not exist "node_modules" (
    call npm install >nul 2>&1
    if %errorlevel% neq 0 (
        echo   ERROR: Failed to install Extension dependencies
        exit /b 1
    )
)

call npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Failed to build Extension
    exit /b 1
)
echo   Extension built successfully

:: ============================================
:: Step 5: Setup MCP Server
:: ============================================
echo [5/7] Setting up MCP Server...

cd /d "%~dp0apps\mcp-server"

if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo   Created .env from template
    )
)

if %PYTHON_AVAILABLE% equ 1 (
    pip install -r requirements.txt >nul 2>&1
    if %errorlevel% neq 0 (
        echo   WARNING: Failed to install MCP dependencies
    ) else (
        echo   MCP dependencies installed
    )
)

:: ============================================
:: Step 6: Start Services
:: ============================================
echo [6/7] Starting services...
echo.

echo   ========================================
echo   Starting API Server (port 3001)...
echo   ========================================
start "BetterBugs API" cmd /k "cd /d "%~dp0apps\api" && go run main.go"

:: Wait for API to start
timeout /t 3 /nobreak >nul

echo   ========================================
echo   Starting Dashboard (port 3002)...
echo   ========================================
start "BetterBugs Dashboard" cmd /k "cd /d "%~dp0apps\dashboard" && npm run dev"

:: ============================================
:: Step 7: Verify Services
:: ============================================
echo [7/7] Verifying services...
echo.

:: Check API
curl -s http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] API Server running on http://localhost:3001
) else (
    echo   [WARN] API Server not responding yet
)

:: Check Dashboard
curl -s -o nul -w "%%{http_code}" http://localhost:3002 2>nul | findstr "200" >nul
if %errorlevel% equ 0 (
    echo   [OK] Dashboard running on http://localhost:3002
) else (
    echo   [WARN] Dashboard not responding yet
)

:: ============================================
:: Summary
:: ============================================
echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo   Services:
echo   - API:       http://localhost:3001
echo   - Dashboard: http://localhost:3002
echo   - Swagger:   http://localhost:3001/docs/index.html
echo.

if %PYTHON_AVAILABLE% equ 1 (
    echo   To start MCP Server manually:
    echo   cd apps\mcp-server
    echo   python server.py
    echo.
)

echo   To load the Extension:
echo   1. Open Chrome and go to chrome://extensions
echo   2. Enable Developer mode
echo   3. Click Load unpacked
echo   4. Select: apps\extension\dist
echo.
echo   Configuration:
echo   - API Base URL: http://localhost:3001/api/v1
echo   - Project ID: dev-project
echo   - Project Key: dev-key
echo.

echo Press any key to exit...
pause >nul