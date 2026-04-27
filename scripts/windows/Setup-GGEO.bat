@echo off
REM GGEO Client - One-Click Setup Wizard (Windows)
REM
REM Sebelum jalankan:
REM   1. Clone repo (mis. ke C:\ggeo-client)
REM   2. Install Python 3.11+ dari https://python.org
REM      CENTANG "Add Python to PATH"
REM   3. Install iTunes (untuk Apple Mobile Device Service + Bonjour)
REM   4. Punya Host URL + API key dari operator GGEO Host
REM      (host admin -> Clients -> [Add] -> copy api_key)
REM
REM Cara pakai:
REM   Double-click Setup-GGEO.bat dari File Explorer.
REM   Wizard akan membuat venv, install deps, prompt host URL + api_key,
REM   buat client_admin account, save config, BUAT SHORTCUT, opt-in
REM   autostart. Setelah selesai double-click "GGEO Client" di Desktop.

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

REM Cek Python
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: python tidak ada di PATH.
    echo Install Python 3.11+ dari https://python.org
    echo CENTANG "Add Python to PATH" saat install.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo Python detected: %PY_VER%
echo.

REM Run wizard - semua langkah (venv, deps, host, shortcut, autostart)
REM di dalam setup.py.
python setup.py

set EXIT_CODE=%errorlevel%
echo.
echo ==================================================
if %EXIT_CODE% EQU 0 (
    echo   Setup berhasil! Tutup window ini.
    echo.
    echo   Untuk jalankan server, double-click "GGEO Client" di Desktop.
) else (
    echo   Setup error ^(exit %EXIT_CODE%^). Lihat pesan di atas.
)
echo ==================================================
pause
