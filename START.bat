@echo off
setlocal

set REPO_URL=https://github.com/shkuls/leadpuller.git
set APP_DIR=%~dp0leadpuller

:: ── 1. Install Node.js if missing ────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js not found. Installing...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo Failed to install Node.js. Please install it manually from https://nodejs.org and re-run.
        pause
        exit /b 1
    )
    :: Refresh PATH so node is available in this session
    for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_PATH=%%i
    if "%NODE_PATH%"=="" (
        echo Node.js installed. Please close and re-run this script.
        pause
        exit /b 0
    )
)

:: ── 2. Install Git if missing ─────────────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo Git not found. Installing...
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo Failed to install Git. Please install it manually from https://git-scm.com and re-run.
        pause
        exit /b 1
    )
    echo Git installed. Please close and re-run this script.
    pause
    exit /b 0
)

:: ── 3. Clone or pull latest code ─────────────────────────────────────────────
if not exist "%APP_DIR%\.git" (
    echo Downloading LeadPuller...
    git clone "%REPO_URL%" "%APP_DIR%"
    if errorlevel 1 (
        echo Failed to download. Check your internet connection and try again.
        pause
        exit /b 1
    )
) else (
    echo Updating LeadPuller...
    git -C "%APP_DIR%" pull --ff-only
)

:: ── 4. Install npm packages if needed ────────────────────────────────────────
if not exist "%APP_DIR%\node_modules" (
    echo Installing packages...
    pushd "%APP_DIR%"
    call npm install
    popd
)

:: ── 5. Install Playwright browser if needed ──────────────────────────────────
set PLAYWRIGHT_INSTALLED=0
for /d %%D in ("%LOCALAPPDATA%\ms-playwright\chromium-*") do set PLAYWRIGHT_INSTALLED=1
if "%PLAYWRIGHT_INSTALLED%"=="0" (
    echo Installing browser ^(one-time, may take a minute^)...
    pushd "%APP_DIR%"
    call npx playwright install chromium
    popd
)

:: ── 6. Start server and open browser ─────────────────────────────────────────
echo.
echo Starting LeadPuller...
pushd "%APP_DIR%"
start "" http://localhost:3456
node server.js
popd

endlocal
