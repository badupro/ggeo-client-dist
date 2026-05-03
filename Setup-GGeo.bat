@echo off
REM GGeo Client - One-Click Setup Wizard (Windows)
REM Right-click this file -> "Run as administrator".

cls
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

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

python _internal\setup.py
set EXIT_CODE=%errorlevel%

if not %EXIT_CODE% EQU 0 (
    echo.
    echo   Setup exited with code %EXIT_CODE%.
)
pause
