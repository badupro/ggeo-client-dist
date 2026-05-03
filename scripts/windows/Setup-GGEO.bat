@echo off
REM GGeo Client - One-Click Setup Wizard (Windows)
REM
REM Pre-requisites:
REM   1. Python 3.11, 3.12, or 3.13 installed
REM      Download: https://python.org/downloads/
REM      CHECK "Add Python to PATH" during install
REM   2. iTunes installed (Apple Mobile Device Service + Bonjour)
REM   3. Host URL + API key from the GGeo Host operator
REM
REM Right-click this file -> "Run as administrator".

cls
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%..\.."
set "REPO_DIR=%CD%"
popd

cd /d "%REPO_DIR%"

where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Error: python not found in PATH.
    echo   Install Python 3.11/3.12/3.13 from https://python.org
    echo   Make sure to CHECK "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

python setup.py
set EXIT_CODE=%errorlevel%

if not %EXIT_CODE% EQU 0 (
    echo.
    echo   Setup exited with code %EXIT_CODE%.
)
pause
