@echo off
REM Dark Pool Scanner - Daily Deployment Script (Windows)
REM This script processes new CSV files and deploys to Vercel

echo 🚀 Dark Pool Scanner - Daily Deployment
echo ======================================

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the Website directory.
    pause
    exit /b 1
)

REM Step 1: Process new CSV files
echo.
echo 📊 Step 1: Processing new CSV files...
node process-csv.js

if %errorlevel% neq 0 (
    echo ❌ Error: CSV processing failed
    pause
    exit /b 1
)

REM Step 2: Check if there are any new processed files
echo.
echo 🔍 Step 2: Checking for new processed data...

REM Count processed files (Windows version)
set /a PROCESSED_COUNT=0
for %%f in (data\processed\*.json) do set /a PROCESSED_COUNT+=1
echo Found %PROCESSED_COUNT% processed JSON files

if %PROCESSED_COUNT% equ 0 (
    echo ⚠️  No processed data found. Skipping deployment.
    pause
    exit /b 0
)

REM Step 3: Build the project
echo.
echo 🔨 Step 3: Building project...
npm run build

if %errorlevel% neq 0 (
    echo ❌ Error: Build failed
    pause
    exit /b 1
)

REM Step 4: Deploy to Vercel
echo.
echo 🚀 Step 4: Deploying to Vercel...

REM Check if Vercel CLI is installed
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Vercel CLI not found. Please install it with: npm i -g vercel
    pause
    exit /b 1
)

REM Deploy to Vercel
vercel --prod

if %errorlevel% neq 0 (
    echo ❌ Error: Deployment failed
    pause
    exit /b 1
)

echo.
echo ✅ Deployment completed successfully!
echo 🌐 Your updated dark pool scanner is now live!
echo.
echo 📊 Summary:
echo    - Processed CSV files: 
for %%f in (data\daily\*.csv) do set /a CSV_COUNT+=1
echo    - Generated JSON files: %PROCESSED_COUNT%
echo    - Deployment: Successful

pause



















