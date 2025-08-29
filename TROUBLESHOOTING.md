# Dark Pool Scanner Troubleshooting Guide

## 🚀 New Approach (v2.0)

The scanner now uses a **smart caching system** that:

1. **Downloads ALL trades for today** (not just predetermined tickers)
2. **Finds the most active stocks** with dark pool activity
3. **Caches results for the entire day** (no more repeated API calls)
4. **Shows you what's actually trading** instead of guessing
5. **Optional 30-day historical comparison** (loads on demand)

### How It Works

1. **First visit of the day**: Takes 2-3 minutes to analyze all trades
2. **Subsequent visits**: Shows cached results instantly
3. **Manual refresh**: Forces a new analysis (takes 2-3 minutes)
4. **30-day data**: Click "Show 30-Day Data" to see historical comparisons
5. **Next day**: Automatically refreshes

### Historical Data Feature

- **Toggle button**: "Show 30-Day Data" in the header
- **Volume ratios**: Compare today's volume to 30-day average
- **Color coding**: Green (>2x), Yellow (1-2x), Red (<1x)
- **On-demand loading**: Only loads when requested (doesn't slow down main page)

## Common Issues and Solutions

### 1. 504 Gateway Timeout Error

**Problem**: The API request times out after 10 minutes, showing a 504 error.

**Causes**:
- Polygon API calls are taking too long
- Too many tickers being processed at once
- Network connectivity issues

**Solutions**:
- ✅ **Fixed**: New caching system - only analyzes once per day
- ✅ **Fixed**: Smart ticker discovery - finds most active stocks automatically
- ✅ **Fixed**: Better error handling - continues with cached data if analysis fails
- ✅ **Fixed**: Reduced API load - no more repeated calls throughout the day

### 2. JSON Parsing Error

**Problem**: "Unexpected token 'A', "An error o"... is not valid JSON"

**Causes**:
- API returning error message instead of JSON
- Network errors causing malformed responses
- Server returning HTML error pages

**Solutions**:
- ✅ **Fixed**: Added proper error handling before JSON parsing
- ✅ **Fixed**: Added try-catch blocks around JSON.parse()
- ✅ **Fixed**: Better error messages with status codes

### 3. API Key Configuration Issues

**Problem**: "Dark Pool Scanner is currently unavailable"

**Causes**:
- Missing or invalid Polygon API key
- Environment variables not set properly

**Solutions**:
1. **Check your environment setup**:
   ```bash
   npm run check-env
   ```

2. **Set up environment if needed**:
   ```bash
   npm run setup
   ```

3. **For Vercel deployment**, add environment variable:
   - Go to your Vercel project settings
   - Add `POLYGON_API_KEY` with your actual API key
   - Redeploy the project

### 4. No Data Available

**Problem**: Scanner shows "No dark pool data available"

**Causes**:
- No trades found for the selected tickers
- API rate limits exceeded
- Market closed (no recent trades)

**Solutions**:
- Try refreshing the data
- Check if markets are open
- Verify your Polygon API plan supports the required endpoints

## Environment Setup

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   npm run setup
   ```

3. **Verify configuration**:
   ```bash
   npm run check-env
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

### Production Setup (Vercel)

1. **Add environment variable in Vercel**:
   - Go to Project Settings → Environment Variables
   - Add `POLYGON_API_KEY` with your actual API key
   - Deploy to all environments (Production, Preview, Development)

2. **Redeploy the project**:
   ```bash
   vercel --prod
   ```

## API Key Requirements

### Polygon.io API Plan

The dark pool scanner requires a Polygon.io API key with access to:
- **Trades endpoint** (`/v3/trades/`)
- **Real-time data** (for current day trades)
- **Historical data** (for 30-day averages)

**Recommended plans**:
- **Starter**: Limited to 5 API calls per minute
- **Developer**: 100 API calls per minute
- **Professional**: 1000+ API calls per minute

### Getting a Polygon API Key

1. Visit [polygon.io](https://polygon.io)
2. Sign up for an account
3. Choose a plan that includes trades data
4. Copy your API key from the dashboard
5. Use the key in your environment setup

## Performance Optimizations

### Recent Improvements

1. **Reduced API timeouts**: 10-15 seconds instead of 15-20 seconds
2. **Fewer tickers**: 25 instead of 50 for refresh, 10 instead of 20 for initial load
3. **Better error handling**: Continues with existing data if refresh fails
4. **Improved frontend**: Better error messages and loading states

### Monitoring

Check the browser console and server logs for:
- API response times
- Error messages
- Rate limit warnings

## Support

If you continue to experience issues:

1. **Check the logs**: Look for specific error messages
2. **Verify API key**: Ensure it's valid and has proper permissions
3. **Test API directly**: Try calling Polygon API endpoints directly
4. **Check rate limits**: Ensure you're not exceeding API call limits

## Debug Mode

To enable more detailed logging, add this to your `.env.local`:
```
DEBUG=true
```

This will show additional information about API calls and responses.
