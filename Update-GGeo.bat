@echo off
cls
setlocal enabledelayedexpansion

set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
cd /d "%INSTALL_DIR%"

echo   GGeo Client Update
echo.
echo   This will fetch the latest version from GitHub,
echo   rebuild the venv, and reinstall dependencies.
echo.
set /p ANS="  Continue? [Y/n] "
if /I "%ANS%"=="n" (
    echo   Cancelled.
    pause
    exit /b 0
)

where git >nul 2>nul
if errorlevel 1 (
    echo   Error: git not found in PATH.
    pause
    exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
    echo   Error: python not found in PATH.
    pause
    exit /b 1
)

echo.
echo   Stopping running server (if any)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8484" ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>nul

echo   Pulling latest from origin/main...
git fetch origin main || ( echo   git fetch failed. & pause & exit /b 1 )
git reset --hard origin/main || ( echo   git reset failed. & pause & exit /b 1 )

echo   Removing old venv...
rmdir /s /q _internal\venv 2>nul

echo   Creating fresh venv...
python -m venv _internal\venv || ( echo   venv creation failed. & pause & exit /b 1 )

echo   Installing dependencies (this may take a minute)...
_internal\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
_internal\venv\Scripts\python.exe -m pip install -r _internal\requirements.txt || ( echo   pip install failed. & pause & exit /b 1 )

echo.
set /p NEWVER=<VERSION
echo   Update complete. Version: !NEWVER!
pause
