# Troubleshooting Guide

This guide helps you resolve common issues with the Dark Pool Scanner.

## 🚨 Critical Issues

### 1. 504 Gateway Timeout Error

**Symptoms:**
- `GET /api/darkpool-trades` returns 504 Gateway Timeout
- Page loads but no data appears
- Console shows timeout errors

**Causes:**
- API requests taking too long to complete
- Too many concurrent API calls to Polygon.io
- Large data requests exceeding serverless function limits

**Solutions:**

#### Immediate Fixes:
1. **Check API Key Configuration**
   ```bash
   # Verify your environment variable
   echo $POLYGON_API_KEY
   ```

2. **Test Health Endpoint**
   ```bash
   curl https://your-domain.com/api/health
   ```

3. **Clear Browser Cache**
   - Hard refresh the page (Ctrl+F5)
   - Clear browser cache and cookies

#### Long-term Solutions:
1. **Upgrade Polygon.io Plan**
   - Free tier: 5 calls/minute
   - Basic plan: 5 calls/minute
   - Starter plan: 5 calls/minute
   - Consider upgrading for higher limits

2. **Optimize API Usage**
   - The app now uses 30-day historical data instead of 90-day
   - Reduced concurrent API calls to 3 at a time
   - Implemented better caching

3. **Deploy to Vercel Pro**
   - Higher serverless function timeout limits
   - Better performance for API-intensive applications

### 2. 500 Internal Server Error

**Symptoms:**
- `GET /api/darkpool-trades` returns 500 Internal Server Error
- Console shows server error messages

**Solutions:**
1. **Check Server Logs**
   - View Vercel function logs
   - Look for specific error messages

2. **Verify Environment Variables**
   - Ensure `POLYGON_API_KEY` is set correctly
   - Check for typos in the API key

3. **Test API Key**
   ```bash
   curl "https://api.polygon.io/v3/trades/AAPL?date=2024-01-15&limit=10&apiKey=YOUR_API_KEY"
   ```

### 3. Chrome Extension Error

**Symptoms:**
- `Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`

**Solution:**
- This error is from a browser extension, not your website
- Disable browser extensions to isolate the issue
- The error doesn't affect your website's functionality

## 🔧 Performance Issues

### Slow Loading Times

**Causes:**
- Large API responses
- Too many API calls
- Network latency

**Solutions:**
1. **Enable Caching**
   - The app now caches results for better performance
   - First load may be slow, subsequent loads will be faster

2. **Use Refresh Sparingly**
   - Only refresh when necessary
   - Data updates automatically every 15 minutes

3. **Check Network Connection**
   - Ensure stable internet connection
   - Try different network if possible

### API Rate Limiting

**Symptoms:**
- 429 Too Many Requests errors
- Inconsistent data loading

**Solutions:**
1. **Reduce Refresh Frequency**
   - Don't refresh more than once per minute
   - Let the app use cached data

2. **Upgrade Polygon.io Plan**
   - Higher rate limits available with paid plans

3. **Monitor Usage**
   - Check Polygon.io dashboard for usage statistics

## 🛠️ Development Issues

### Local Development Problems

**Common Issues:**
1. **PowerShell Execution Policy**
   ```powershell
   # Run as Administrator
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Node.js Version**
   ```bash
   # Ensure Node.js 18+
   node --version
   ```

3. **Missing Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

### Build Errors

**Solutions:**
1. **Clear Cache**
   ```bash
   npm run build -- --no-cache
   ```

2. **Check Dependencies**
   ```bash
   npm audit fix
   ```

3. **Update Packages**
   ```bash
   npm update
   ```

## 📊 Monitoring and Debugging

### Health Check Endpoint

Test the health of your API:
```bash
curl https://your-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "environment": "production",
  "hasApiKey": true,
  "apiKeyConfigured": true,
  "version": "1.1.0"
}
```

### Browser Developer Tools

1. **Network Tab**
   - Monitor API calls
   - Check response times
   - Look for failed requests

2. **Console Tab**
   - View error messages
   - Check for JavaScript errors
   - Monitor API responses

3. **Application Tab**
   - Check localStorage for cached data
   - Verify environment variables

## 🚀 Deployment Issues

### Vercel Deployment Problems

1. **Environment Variables**
   - Set `POLYGON_API_KEY` in Vercel dashboard
   - Redeploy after adding environment variables

2. **Function Timeout**
   - Vercel free tier: 10 seconds
   - Vercel pro: 60 seconds
   - Consider upgrading for longer operations

3. **Build Failures**
   - Check build logs in Vercel dashboard
   - Verify all dependencies are installed

### Other Platforms

1. **Netlify**
   - Set environment variables in Netlify dashboard
   - Use Netlify functions for API routes

2. **Railway**
   - Set environment variables in Railway dashboard
   - Monitor resource usage

## 📞 Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide**
2. **Test the health endpoint**
3. **Check browser console for errors**
4. **Verify your API key is working**
5. **Try on a different network**

### When to Contact Support

- Health endpoint returns unhealthy status
- API key is valid but getting 500 errors
- Build failures that can't be resolved
- Performance issues after optimization

### Useful Information to Include

- Error messages from browser console
- Health endpoint response
- API key status (without sharing the actual key)
- Browser and operating system
- Steps to reproduce the issue

## 🔄 Recent Optimizations

### v1.1.0 Performance Improvements

1. **Reduced API Calls**
   - Limited to top 10 tickers for initial load
   - Reduced historical data from 90 to 30 days
   - Implemented concurrency limiting

2. **Better Timeout Handling**
   - 8-second timeout for individual API calls
   - 30-second timeout for main requests
   - Graceful fallbacks for failed requests

3. **Enhanced Caching**
   - Better cache management
   - Automatic cache invalidation
   - Reduced redundant API calls

4. **Error Recovery**
   - Retry logic with exponential backoff
   - Graceful degradation when services fail
   - Better user feedback for errors

---

**Note**: If you continue to experience issues after trying these solutions, please check the main README.md for additional troubleshooting steps.
