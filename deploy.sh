#!/bin/bash

# Dark Pool Scanner - Daily Deployment Script
# This script processes new CSV files and deploys to Vercel

echo "🚀 Dark Pool Scanner - Daily Deployment"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the Website directory."
    exit 1
fi

# Step 1: Process new CSV files
echo ""
echo "📊 Step 1: Processing new CSV files..."
node process-csv.js

if [ $? -ne 0 ]; then
    echo "❌ Error: CSV processing failed"
    exit 1
fi

# Step 2: Check if there are any new processed files
echo ""
echo "🔍 Step 2: Checking for new processed data..."

# Count processed files
PROCESSED_COUNT=$(find data/processed -name "*.json" | wc -l)
echo "Found $PROCESSED_COUNT processed JSON files"

if [ $PROCESSED_COUNT -eq 0 ]; then
    echo "⚠️  No processed data found. Skipping deployment."
    exit 0
fi

# Step 3: Build the project
echo ""
echo "🔨 Step 3: Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed"
    exit 1
fi

# Step 4: Deploy to Vercel
echo ""
echo "🚀 Step 4: Deploying to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Error: Vercel CLI not found. Please install it with: npm i -g vercel"
    exit 1
fi

# Deploy to Vercel
vercel --prod

if [ $? -ne 0 ]; then
    echo "❌ Error: Deployment failed"
    exit 1
fi

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Your updated dark pool scanner is now live!"
echo ""
echo "📊 Summary:"
echo "   - Processed CSV files: $(find data/daily -name "*.csv" | wc -l)"
echo "   - Generated JSON files: $PROCESSED_COUNT"
echo "   - Deployment: Successful"


























