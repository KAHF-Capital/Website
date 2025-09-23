import fetch from 'node-fetch';

// Batch Performance Data Fetcher
// Optimized for processing multiple tickers efficiently

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Configuration
const BATCH_CONFIG = {
  maxConcurrent: parseInt(process.env.YAHOO_MAX_CONCURRENT) || 5,
  delayBetweenBatches: parseInt(process.env.YAHOO_BATCH_DELAY) || 200,
  requestTimeout: parseInt(process.env.YAHOO_REQUEST_TIMEOUT) || 10000,
  maxRetries: parseInt(process.env.YAHOO_MAX_RETRIES) || 2
};

// Cache for performance data
const performanceCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get performance data for a single ticker
async function getTickerPerformance(ticker) {
  try {
    const url = `${YAHOO_FINANCE_BASE}/${ticker}`;
    const response = await fetch(url, { 
      timeout: BATCH_CONFIG.requestTimeout 
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.chart?.result?.[0]) {
      throw new Error('No price data available');
    }
    
    const result = data.chart.result[0];
    const meta = result.meta;
    
    // Calculate performance
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    return {
      ticker,
      currentPrice,
      previousClose,
      change,
      changePercent,
      currency: meta.currency,
      exchange: meta.exchangeName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching performance for ${ticker}:`, error.message);
    throw error;
  }
}

// Process a single ticker with retry logic
async function processTickerWithRetry(ticker, retries = BATCH_CONFIG.maxRetries) {
  const cacheKey = `perf-${ticker}`;
  const now = Date.now();
  
  // Check cache first
  if (performanceCache.has(cacheKey)) {
    const cached = performanceCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const performanceData = await getTickerPerformance(ticker);
      
      // Cache the result
      performanceCache.set(cacheKey, {
        data: performanceData,
        timestamp: now
      });
      
      return performanceData;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed for ${ticker}:`, error.message);
      
      if (attempt === retries) {
        // Final attempt failed, return error
        return {
          ticker,
          error: error.message,
          currentPrice: null,
          previousClose: null,
          change: null,
          changePercent: null
        };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Process multiple tickers in batches
async function processBatchTickers(tickers) {
  const results = [];
  
  for (let i = 0; i < tickers.length; i += BATCH_CONFIG.maxConcurrent) {
    const batch = tickers.slice(i, i + BATCH_CONFIG.maxConcurrent);
    
    console.log(`Processing performance batch ${Math.floor(i / BATCH_CONFIG.maxConcurrent) + 1}: ${batch.join(', ')}`);
    
    const batchPromises = batch.map(ticker => 
      processTickerWithRetry(ticker)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches
    if (i + BATCH_CONFIG.maxConcurrent < tickers.length) {
      console.log(`Waiting ${BATCH_CONFIG.delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_CONFIG.delayBetweenBatches));
    }
  }
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or invalid tickers array'
      });
    }

    console.log(`Starting batch performance fetch for ${tickers.length} tickers`);
    
    const startTime = Date.now();
    const results = await processBatchTickers(tickers);
    const duration = Date.now() - startTime;
    
    // Count results by status
    const successResults = results.filter(r => !r.error).length;
    const errorResults = results.filter(r => r.error).length;
    
    console.log(`Batch performance processing complete in ${duration}ms: ${successResults} successful, ${errorResults} errors`);
    
    const response = {
      timestamp: new Date().toISOString(),
      config: BATCH_CONFIG,
      totalTickers: tickers.length,
      processingTime: duration,
      results: {
        successful: successResults,
        errors: errorResults
      },
      data: results
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in batch-performance API:', error);
    return res.status(500).json({
      error: 'Failed to process batch performance data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
