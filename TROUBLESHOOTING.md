# Dark Pool Scanner Troubleshooting Guide

## Common Issues and Solutions

### 1. 504 Gateway Timeout Error

**Problem**: The API request times out after 10 minutes, showing a 504 error.

**Causes**:
- Polygon API calls are taking too long
- Too many tickers being processed at once
- Network connectivity issues

**Solutions**:
- ✅ **Fixed**: Reduced timeout from 15-20 seconds to 10-15 seconds per API call
- ✅ **Fixed**: Reduced number of tickers from 50 to 25 for refresh, 20 to 10 for initial load
- ✅ **Fixed**: Added better error handling to continue with existing data if refresh fails
- ✅ **Fixed**: Added proper headers to API requests

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
- **Historical data** (for 90-day averages)

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
