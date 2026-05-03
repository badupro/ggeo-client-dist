@echo off
cls
set "LOG=%~dp0_internal\data\ggeo.log"

if not exist "%LOG%" (
    echo   Log file not found:
    echo   %LOG%
    echo.
    echo   Has the server been started yet?
    echo.
    pause
    exit /b 0
)

echo   Tailing GGeo log (Ctrl+C to exit):
echo   %LOG%
echo.
powershell -NoProfile -Command "Get-Content '%LOG%' -Wait -Tail 50"
