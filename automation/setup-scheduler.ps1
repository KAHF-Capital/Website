# ============================================
# KAHF Capital - Windows Task Scheduler Setup
# Run this script as Administrator to set up
# daily automated signal processing
# ============================================

Write-Host "=========================================="
Write-Host "KAHF Capital - Automation Setup"
Write-Host "=========================================="
Write-Host ""

# Configuration
$TaskName = "KAHF_DailySignals"
$TaskDescription = "Processes dark pool data and sends SMS alerts at 4:30 PM EST"
$ScriptPath = "C:\Users\kiana\OneDrive\Documents\GitHub\Website\automation\run-daily-signals.bat"
$TriggerTime = "16:30" # 4:30 PM

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'"
    exit 1
}

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Task '$TaskName' already exists."
    $response = Read-Host "Do you want to replace it? (y/n)"
    if ($response -eq 'y') {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Existing task removed."
    } else {
        Write-Host "Setup cancelled."
        exit 0
    }
}

# Create the scheduled task
Write-Host ""
Write-Host "Creating scheduled task..."
Write-Host "  Name: $TaskName"
Write-Host "  Time: $TriggerTime (Mon-Fri)"
Write-Host "  Script: $ScriptPath"
Write-Host ""

# Create trigger - runs at 4:30 PM on weekdays
$Trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime

# Create action - run the batch script
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$ScriptPath`""

# Settings - run whether logged in or not, don't stop if running long
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Description $TaskDescription `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -User "$env:USERDOMAIN\$env:USERNAME" `
        -RunLevel Highest

    Write-Host ""
    Write-Host "SUCCESS! Task created successfully." -ForegroundColor Green
    Write-Host ""
    Write-Host "The task will run automatically at $TriggerTime every weekday."
    Write-Host ""
    Write-Host "To test the task manually:"
    Write-Host "  1. Open Task Scheduler"
    Write-Host "  2. Find '$TaskName'"
    Write-Host "  3. Right-click and select 'Run'"
    Write-Host ""
    Write-Host "To set your CRON_SECRET environment variable:"
    Write-Host "  setx CRON_SECRET `"your-secret-here`""
    Write-Host ""
}
catch {
    Write-Host "ERROR: Failed to create task" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Create logs directory
$LogDir = "C:\Users\kiana\OneDrive\Documents\GitHub\Website\automation\logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
    Write-Host "Created logs directory: $LogDir"
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green

