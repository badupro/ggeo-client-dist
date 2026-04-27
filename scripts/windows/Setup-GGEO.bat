@echo off
REM GGEO Client - One-Click Setup Wizard (Windows)
REM
REM Pre-requisites:
REM   1. Clone repo (e.g., to C:\ggeo-client)
REM   2. Install Python 3.11+ from https://python.org
REM      CHECK "Add Python to PATH" during install
REM   3. Install iTunes (for Apple Mobile Device Service + Bonjour)
REM   4. Host URL + API key from the GGEO Host operator
REM      (host admin -^> Clients -^> [Add] -^> copy api_key)
REM
REM Usage:
REM   Double-click Setup-GGEO.bat from File Explorer.
REM   The wizard creates the venv, installs dependencies, prompts for
REM   host URL + api_key, creates a client_admin account, saves config,
REM   creates a desktop shortcut, and optionally enables autostart.
REM   When setup finishes, double-click "GGEO Client" on the Desktop.

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%..\.."
set "REPO_DIR=%CD%"
popd

echo ==================================================
echo   GGEO Client - One-Click Setup (Windows)
echo ==================================================
echo   Repo: %REPO_DIR%
echo.

cd /d "%REPO_DIR%"

REM Check Python
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: python not found in PATH.
    echo Install Python 3.11+ from https://python.org
    echo Make sure to CHECK "Add Python to PATH" during install.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo Python detected: %PY_VER%
echo.

REM Run wizard - all steps (venv, deps, host, shortcut, autostart)
REM are inside setup.py.
python setup.py

set EXIT_CODE=%errorlevel%
echo.
echo ==================================================
if %EXIT_CODE% EQU 0 (
    echo   Setup complete.
    echo.
    echo   To start the server, double-click "GGEO Client" on the Desktop.
) else (
    echo   Setup failed ^(exit %EXIT_CODE%^). See messages above.
)
echo ==================================================
pause
