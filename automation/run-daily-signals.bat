@echo off
REM ============================================
REM KAHF Capital - Daily Signal Automation
REM Run this with Windows Task Scheduler
REM ============================================

REM Set the working directory
cd /d "C:\Users\kiana\OneDrive\Documents\GitHub\Website"

REM Log file for tracking
set LOGFILE=automation\logs\signal-%date:~-4,4%%date:~-10,2%%date:~-7,2%.log

REM Create logs directory if it doesn't exist
if not exist "automation\logs" mkdir "automation\logs"

echo ============================================ >> %LOGFILE%
echo KAHF Daily Signal Automation >> %LOGFILE%
echo Started: %date% %time% >> %LOGFILE%
echo ============================================ >> %LOGFILE%

REM Step 1: Process any new CSV files from D:\daily
echo. >> %LOGFILE%
echo [Step 1] Processing new CSV files... >> %LOGFILE%
node process-csv.js >> %LOGFILE% 2>&1

REM Step 2: Trigger the automated scanner (local)
echo. >> %LOGFILE%
echo [Step 2] Triggering signal scanner... >> %LOGFILE%

REM Check if server is running locally
curl -s -o nul http://localhost:3000
if %ERRORLEVEL% NEQ 0 (
    echo Local server not running. Starting in background... >> %LOGFILE%
    start /B npm run dev
    timeout /t 10 /nobreak > nul
)

REM Trigger the scanner
curl -X POST -H "Authorization: Bearer %CRON_SECRET%" -H "Content-Type: application/json" http://localhost:3000/api/automated-scanner >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo ============================================ >> %LOGFILE%
echo Completed: %date% %time% >> %LOGFILE%
echo ============================================ >> %LOGFILE%

echo Daily signals automation completed. Check %LOGFILE% for details.

