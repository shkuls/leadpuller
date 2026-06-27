@echo off
setlocal

set REPO_URL=https://github.com/shkuls/leadpuller.git
set APP_DIR=%~dp0leadpuller

:: ── 1. Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed. Opening the download page...
    echo Please install Node.js ^(LTS^) and re-run this script.
    start https://nodejs.org/en/download/
    pause
    exit /b 1
)

:: ── 2. Check Git ──────────────────────────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo Git is not installed. Opening the download page...
    echo Please install Git and re-run this script.
    start https://git-scm.com/download/win
    pause
    exit /b 1
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
if not exist "%LOCALAPPDATA%\ms-playwright\chromium*" (
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
