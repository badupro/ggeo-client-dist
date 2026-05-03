@echo off
cls
setlocal enabledelayedexpansion

set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

echo   GGeo Client Uninstaller
echo.
echo   This will remove:
echo     - The server (running process if any)
echo     - Autostart entry (Registry HKCU\Run)
echo     - Desktop shortcut
echo     - The entire install folder: %INSTALL_DIR%
echo.
set /p ANS="  Continue? [y/N] "
if /I not "%ANS%"=="y" (
    echo   Cancelled.
    pause
    exit /b 0
)

echo.
echo   Stopping server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8484" ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>nul

echo   Removing autostart entries...
for /f "tokens=1,*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" 2^>nul ^| findstr /i "ggeo gpro"') do (
    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "%%a" /f >nul 2>nul
)

echo   Removing desktop shortcuts...
del /q "%USERPROFILE%\Desktop\GGeo Client*.lnk" 2>nul
del /q "%USERPROFILE%\OneDrive\Desktop\GGeo Client*.lnk" 2>nul
del /q "%USERPROFILE%\Desktop\GGEO Client*.lnk" 2>nul
del /q "%USERPROFILE%\OneDrive\Desktop\GGEO Client*.lnk" 2>nul

echo   Scheduling install folder removal...
start /B cmd /C "timeout /t 2 /nobreak > nul && rd /s /q ""%INSTALL_DIR%"""

echo.
echo   Uninstall complete. Folder will be deleted shortly.
echo   Re-install via: git clone https://github.com/badupro/ggeo-client-dist
echo.
pause
