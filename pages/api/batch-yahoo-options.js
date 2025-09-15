import fetch from 'node-fetch';

// Batch Yahoo Finance Options Data Fetcher
// Optimized for processing multiple tickers efficiently

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_OPTIONS_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';

// Configuration
const BATCH_CONFIG = {
  maxConcurrent: parseInt(process.env.YAHOO_MAX_CONCURRENT) || 3,
  delayBetweenBatches: parseInt(process.env.YAHOO_BATCH_DELAY) || 2000,
  requestTimeout: parseInt(process.env.YAHOO_REQUEST_TIMEOUT) || 10000,
  maxRetries: parseInt(process.env.YAHOO_MAX_RETRIES) || 2
};

// Cache for options data
const optionsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get current price for a ticker
async function getCurrentPrice(ticker) {
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
    return {
      price: result.meta.regularMarketPrice,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName
    };
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error.message);
    throw error;
  }
}

// Get options data for a ticker with caching
async function getOptionsData(ticker, currentPrice) {
  const cacheKey = `${ticker}-${currentPrice}`;
  const now = Date.now();
  
  // Check cache first
  if (optionsCache.has(cacheKey)) {
    const cached = optionsCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  try {
    // Get expiration dates first
    const expirationsResponse = await fetch(`${YAHOO_OPTIONS_BASE}/${ticker}`, {
      timeout: BATCH_CONFIG.requestTimeout
    });
    
    if (!expirationsResponse.ok) {
      throw new Error(`Expirations API error: ${expirationsResponse.status}`);
    }
    
    const expirationsData = await expirationsResponse.json();
    
    if (!expirationsData.optionChain?.result?.[0]) {
      throw new Error('No options chain available');
    }
    
    const expirations = expirationsData.optionChain.result[0].expirationDates || [];
    
    if (expirations.length === 0) {
      throw new Error('No expiration dates available');
    }
    
    // Find the closest expiration to 30 days out
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 30);
    
    let closestExpiration = expirations[0];
    let minDistance = Infinity;
    
    expirations.forEach(timestamp => {
      const expDate = new Date(timestamp * 1000);
      const distance = Math.abs(expDate - targetDate);
      if (distance < minDistance) {
        minDistance = distance;
        closestExpiration = timestamp;
      }
    });
    
    // Get options data for the closest expiration
    const optionsResponse = await fetch(`${YAHOO_OPTIONS_BASE}/${ticker}?date=${closestExpiration}`, {
      timeout: BATCH_CONFIG.requestTimeout
    });
    
    if (!optionsResponse.ok) {
      throw new Error(`Options API error: ${optionsResponse.status}`);
    }
    
    const optionsData = await optionsResponse.json();
    
    if (!optionsData.optionChain?.result?.[0]) {
      throw new Error('No options data available');
    }
    
    const result = optionsData.optionChain.result[0];
    const calls = result.options[0]?.calls || [];
    const puts = result.options[0]?.puts || [];
    
    if (calls.length === 0 || puts.length === 0) {
      throw new Error('No options contracts available');
    }
    
    // Find ATM strike
    let atmStrike = null;
    let minDistance = Infinity;
    
    calls.forEach(call => {
      const distance = Math.abs(call.strike - currentPrice);
      if (distance < minDistance) {
        minDistance = distance;
        atmStrike = call.strike;
      }
    });
    
    if (!atmStrike) {
      throw new Error('Could not find ATM strike');
    }
    
    // Find ATM call and put
    const atmCall = calls.find(call => call.strike === atmStrike);
    const atmPut = puts.find(put => put.strike === atmStrike);
    
    if (!atmCall || !atmPut) {
      throw new Error('Could not find ATM call and put options');
    }
    
    // Calculate straddle premium
    const callMid = (atmCall.bid + atmCall.ask) / 2;
    const putMid = (atmPut.bid + atmPut.ask) / 2;
    const totalPremium = callMid + putMid;
    
    const resultData = {
      ticker,
      currentPrice,
      strikePrice: atmStrike,
      totalPremium,
      callBid: atmCall.bid,
      callAsk: atmCall.ask,
      putBid: atmPut.bid,
      putAsk: atmPut.ask,
      expirationDate: new Date(closestExpiration * 1000).toISOString().split('T')[0],
      source: 'yahoo_finance',
      dataQuality: 'high'
    };
    
    // Cache the result
    optionsCache.set(cacheKey, {
      data: resultData,
      timestamp: now
    });
    
    return resultData;
    
  } catch (error) {
    console.error(`Error fetching options data for ${ticker}:`, error.message);
    throw error;
  }
}

// Estimate straddle premium (fallback)
function estimateStraddlePremium(currentPrice, daysToExpiration = 30) {
  const timeToExpiration = daysToExpiration / 365;
  const sqrtTime = Math.sqrt(timeToExpiration);
  const volatility = 0.3; // Assume 30% volatility
  const estimatedPremium = currentPrice * volatility * sqrtTime * 0.4;
  
  return Math.max(estimatedPremium, currentPrice * 0.01); // Minimum 1% of stock price
}

// Process a single ticker with retry logic
async function processTickerWithRetry(ticker, retries = BATCH_CONFIG.maxRetries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Get current price
      const priceData = await getCurrentPrice(ticker);
      const currentPrice = priceData.price;
      
      // Try to get options data
      try {
        const optionsData = await getOptionsData(ticker, currentPrice);
        return {
          ticker,
          currentPrice,
          strikePrice: optionsData.strikePrice,
          totalPremium: optionsData.totalPremium,
          source: 'yahoo_finance',
          dataQuality: 'high',
          expirationDate: optionsData.expirationDate,
          callBid: optionsData.callBid,
          callAsk: optionsData.callAsk,
          putBid: optionsData.putBid,
          putAsk: optionsData.putAsk
        };
      } catch (optionsError) {
        console.warn(`Options data unavailable for ${ticker}, using estimation:`, optionsError.message);
        
        // Fallback to estimation
        const estimatedPremium = estimateStraddlePremium(currentPrice);
        return {
          ticker,
          currentPrice,
          strikePrice: currentPrice,
          totalPremium: estimatedPremium,
          source: 'estimation',
          dataQuality: 'medium',
          note: 'Options data unavailable, using estimation'
        };
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed for ${ticker}:`, error.message);
      
      if (attempt === retries) {
        // Final attempt failed, return error
        return {
          ticker,
          error: error.message,
          source: 'error',
          dataQuality: 'none'
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
    
    console.log(`Processing batch ${Math.floor(i / BATCH_CONFIG.maxConcurrent) + 1}: ${batch.map(t => t.ticker).join(', ')}`);
    
    const batchPromises = batch.map(ticker => 
      processTickerWithRetry(ticker.ticker)
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

    console.log(`Starting batch Yahoo Finance options fetch for ${tickers.length} tickers`);
    
    const startTime = Date.now();
    const results = await processBatchTickers(tickers);
    const duration = Date.now() - startTime;
    
    // Count results by source
    const yahooResults = results.filter(r => r.source === 'yahoo_finance').length;
    const estimationResults = results.filter(r => r.source === 'estimation').length;
    const errorResults = results.filter(r => r.source === 'error').length;
    
    console.log(`Batch processing complete in ${duration}ms: ${yahooResults} Yahoo Finance, ${estimationResults} estimated, ${errorResults} errors`);
    
    const response = {
      timestamp: new Date().toISOString(),
      config: BATCH_CONFIG,
      totalTickers: tickers.length,
      processingTime: duration,
      results: {
        yahooFinance: yahooResults,
        estimated: estimationResults,
        errors: errorResults
      },
      data: results
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in batch-yahoo-options API:', error);
    return res.status(500).json({
      error: 'Failed to process batch options data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
