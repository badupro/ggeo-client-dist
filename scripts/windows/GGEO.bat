@echo off
REM GGEO client launcher for Windows.
REM
REM Windows does not need Administrator rights the way macOS does --
REM Apple Mobile Device Service handles the tunnel itself -- so this
REM script just cd's into the repo, activates venv, and runs the
REM server in a regular cmd window.
REM
REM Setup:
REM   1. Install Python 3.11 + create venv:
REM        cd C:\path\to\ggeo-client
REM        python -m venv venv
REM        venv\Scripts\activate.bat
REM        pip install -r requirements.txt
REM        python setup.py
REM   2. Install iTunes (for Apple Mobile Device Service + usbmuxd).
REM   3. Edit GGEO_ROOT below to the absolute path of your checkout.
REM   4. Put this .bat on the Desktop (or anywhere) and double-click.
REM
REM To stop: close the console window or press Ctrl+C.

set GGEO_ROOT=C:\ggeo-client

cd /d "%GGEO_ROOT%"
if errorlevel 1 (
    echo Could not cd to %GGEO_ROOT%. Edit GGEO_ROOT in this script.
    pause
    exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
    echo venv not found at %GGEO_ROOT%\venv
    echo Run: python -m venv venv ^&^& venv\Scripts\activate ^&^& python setup.py
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
echo Starting GGEO client (Ctrl+C to stop cleanly)
python run.py
pause
