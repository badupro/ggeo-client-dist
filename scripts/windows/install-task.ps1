# install-task.ps1 - register GGEO client as a Task Scheduler job
# that auto-starts at user logon.
#
# Usage (from PowerShell, admin):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\install-task.ps1 -GgeoRoot C:\ggeo-client
#
# What it does:
#   - Defines a Scheduled Task "GGEO Client"
#   - Trigger:  at user logon
#   - Action:   run C:\ggeo-client\venv\Scripts\python.exe run.py
#               with working dir C:\ggeo-client
#   - Run as:   currently logged-in user (no admin needed on Windows
#               because AMDS already has the right privileges)
#   - Hidden:   true (no cmd window popup; logs go to GGEO_LOG_PATH)
#
# Uninstall:
#   Unregister-ScheduledTask -TaskName "GGEO Client" -Confirm:$false

param(
    [Parameter(Mandatory=$true)]
    [string]$GgeoRoot,

    [string]$TaskName = "GGEO Client",
    [string]$LogPath = "$env:USERPROFILE\ggeo-client.log"
)

$ErrorActionPreference = "Stop"

$pythonExe = Join-Path $GgeoRoot "venv\Scripts\python.exe"
$runPy = Join-Path $GgeoRoot "run.py"

if (-not (Test-Path $pythonExe)) {
    Write-Error "python.exe not found at $pythonExe. Is the venv created?"
    exit 1
}

$action = New-ScheduledTaskAction `
    -Execute $pythonExe `
    -Argument "`"$runPy`" > `"$LogPath`" 2>&1" `
    -WorkingDirectory $GgeoRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "GGEO client auto-start at logon" `
    -Force

Write-Host "Task '$TaskName' registered. Logs will go to $LogPath."
Write-Host "To start now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "To remove:    Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
