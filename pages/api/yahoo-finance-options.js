import fetch from 'node-fetch';

// Yahoo Finance Options Data Fetcher
// This replaces Polygon.io API calls to avoid rate limiting

// Yahoo Finance API endpoints (unofficial but stable)
const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_OPTIONS_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';

// Cache for options data to reduce API calls
const optionsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get current stock price from Yahoo Finance
async function getCurrentPrice(ticker) {
  try {
    const url = `${YAHOO_FINANCE_BASE}/${ticker}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      throw new Error('No price data available');
    }
    
    const result = data.chart.result[0];
    const currentPrice = result.meta.regularMarketPrice;
    
    return {
      price: currentPrice,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
      timestamp: result.meta.regularMarketTime
    };
  } catch (error) {
    console.error(`Error fetching current price for ${ticker}:`, error.message);
    throw error;
  }
}

// Get available expiration dates for a ticker
async function getExpirationDates(ticker) {
  try {
    const url = `${YAHOO_OPTIONS_BASE}/${ticker}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance options API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.optionChain || !data.optionChain.result || data.optionChain.result.length === 0) {
      throw new Error('No options data available');
    }
    
    const result = data.optionChain.result[0];
    const expirations = result.expirationDates || [];
    
    // Convert timestamps to date strings
    const expirationDates = expirations.map(timestamp => {
      const date = new Date(timestamp * 1000);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    });
    
    return expirationDates.sort();
  } catch (error) {
    console.error(`Error fetching expiration dates for ${ticker}:`, error.message);
    throw error;
  }
}

// Get options data for a specific ticker and expiration
async function getOptionsData(ticker, expirationDate) {
  const cacheKey = `${ticker}-${expirationDate}`;
  const now = Date.now();
  
  // Check cache first
  if (optionsCache.has(cacheKey)) {
    const cached = optionsCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  try {
    // Convert date to timestamp
    const expirationTimestamp = Math.floor(new Date(expirationDate).getTime() / 1000);
    const url = `${YAHOO_OPTIONS_BASE}/${ticker}?date=${expirationTimestamp}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance options API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.optionChain || !data.optionChain.result || data.optionChain.result.length === 0) {
      throw new Error('No options data available for this expiration');
    }
    
    const result = data.optionChain.result[0];
    const currentPrice = result.quote.regularMarketPrice;
    
    // Find ATM strike price (closest to current price)
    const calls = result.options[0]?.calls || [];
    const puts = result.options[0]?.puts || [];
    
    if (calls.length === 0 || puts.length === 0) {
      throw new Error('No options contracts available');
    }
    
    // Find the strike closest to current price
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
      throw new Error('Could not find ATM strike price');
    }
    
    // Find call and put options at ATM strike
    const atmCall = calls.find(call => call.strike === atmStrike);
    const atmPut = puts.find(put => put.strike === atmStrike);
    
    if (!atmCall || !atmPut) {
      throw new Error('Could not find ATM call and put options');
    }
    
    // Calculate straddle premium (use mid price)
    const callMid = (atmCall.bid + atmCall.ask) / 2;
    const putMid = (atmPut.bid + atmPut.ask) / 2;
    const totalPremium = callMid + putMid;
    
    const optionsData = {
      ticker,
      expirationDate,
      currentPrice,
      strikePrice: atmStrike,
      callOption: {
        strike: atmCall.strike,
        bid: atmCall.bid,
        ask: atmCall.ask,
        mid: callMid,
        volume: atmCall.volume,
        openInterest: atmCall.openInterest
      },
      putOption: {
        strike: atmPut.strike,
        bid: atmPut.bid,
        ask: atmPut.ask,
        mid: putMid,
        volume: atmPut.volume,
        openInterest: atmPut.openInterest
      },
      totalPremium,
      dataQuality: 'high' // Yahoo Finance data is generally reliable
    };
    
    // Cache the result
    optionsCache.set(cacheKey, {
      data: optionsData,
      timestamp: now
    });
    
    return optionsData;
  } catch (error) {
    console.error(`Error fetching options data for ${ticker} ${expirationDate}:`, error.message);
    throw error;
  }
}

// Estimate straddle premium when exact options data is not available
function estimateStraddlePremium(currentPrice, daysToExpiration, volatility = 0.3) {
  // Simple Black-Scholes approximation for straddle premium
  const timeToExpiration = daysToExpiration / 365;
  const sqrtTime = Math.sqrt(timeToExpiration);
  
  // Approximate ATM straddle premium using volatility
  // This is a simplified calculation - in reality, you'd use the full Black-Scholes formula
  const estimatedPremium = currentPrice * volatility * sqrtTime * 0.4; // 0.4 is an empirical factor
  
  return Math.max(estimatedPremium, currentPrice * 0.01); // Minimum 1% of stock price
}

// Get straddle data with fallback to estimation
async function getStraddleData(ticker, expirationDate = null, daysToExpiration = 30) {
  try {
    // Get current price first
    const priceData = await getCurrentPrice(ticker);
    const currentPrice = priceData.price;
    
    // Get available expiration dates
    let availableExpirations = [];
    try {
      availableExpirations = await getExpirationDates(ticker);
    } catch (error) {
      console.warn(`Could not get expiration dates for ${ticker}:`, error.message);
    }
    
    // If no expiration date provided, return available expirations without forcing a selection
    if (!expirationDate) {
      return {
        ticker,
        currentPrice,
        availableExpirations,
        message: 'Please select an expiration date from the available options',
        source: 'expiration_list',
        dataQuality: 'none'
      };
    }
    
    // Check if the requested expiration date is available
    if (availableExpirations.length > 0 && !availableExpirations.includes(expirationDate)) {
      return {
        ticker,
        currentPrice,
        requestedExpiration: expirationDate,
        availableExpirations,
        message: `Requested expiration date ${expirationDate} is not available`,
        source: 'expiration_not_available',
        dataQuality: 'none'
      };
    }
    
    // Try to get real options data for the specified expiration
    try {
      const optionsData = await getOptionsData(ticker, expirationDate);
      return {
        ...optionsData,
        availableExpirations,
        source: 'yahoo_finance',
        executionDate: new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      console.warn(`Could not get options data for ${ticker} ${expirationDate}, using estimation:`, error.message);
      
      // Fallback to estimation
      const estimatedPremium = estimateStraddlePremium(currentPrice, daysToExpiration);
      
      return {
        ticker,
        expirationDate,
        currentPrice,
        strikePrice: currentPrice,
        totalPremium: estimatedPremium,
        availableExpirations,
        source: 'estimation',
        executionDate: new Date().toISOString().split('T')[0],
        dataQuality: 'medium',
        note: 'Premium estimated using Black-Scholes approximation'
      };
    }
    
  } catch (error) {
    console.error(`Error getting straddle data for ${ticker}:`, error.message);
    throw error;
  }
}

// Batch process multiple tickers with rate limiting
async function getBatchStraddleData(tickers, maxConcurrent = 3, delayMs = 1000) {
  const results = [];
  
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (ticker) => {
      try {
        const straddleData = await getStraddleData(ticker.ticker, null, 30);
        return {
          ...ticker,
          straddleData
        };
      } catch (error) {
        console.error(`Error processing ${ticker.ticker}:`, error.message);
        return {
          ...ticker,
          error: error.message,
          straddleData: null
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches to be respectful to Yahoo Finance
    if (i + maxConcurrent < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration, batch } = req.query;

  try {
    if (batch === 'true') {
      // Batch processing for automation
      const { tickers } = req.body || {};
      
      if (!tickers || !Array.isArray(tickers)) {
        return res.status(400).json({ 
          error: 'Missing tickers array in request body for batch processing'
        });
      }
      
      const results = await getBatchStraddleData(tickers);
      
      return res.status(200).json({
        timestamp: new Date().toISOString(),
        totalTickers: tickers.length,
        results: results
      });
    } else if (ticker) {
      // Single ticker processing
      const straddleData = await getStraddleData(ticker, expiration);
      
      return res.status(200).json(straddleData);
    } else {
      return res.status(400).json({ 
        error: 'Missing required parameter: ticker or batch=true'
      });
    }

  } catch (error) {
    console.error('Error in yahoo-finance-options API:', error);
    return res.status(500).json({
      error: 'Failed to fetch options data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
