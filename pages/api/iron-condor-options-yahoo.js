import fetch from 'node-fetch';

// Yahoo Finance Iron Condor Options Data Fetcher
// This replaces Polygon.io API calls to avoid rate limiting and 500 errors

// Yahoo Finance API endpoints (unofficial but stable)
const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_OPTIONS_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';
const YAHOO_OPTIONS_ALT = 'https://query1.finance.yahoo.com/v7/finance/options';
const YAHOO_QUOTE_BASE = 'https://query1.finance.yahoo.com/v1/finance/search';

// Cache for crumb to reduce API calls
let crumbCache = null;
let crumbTimestamp = 0;
const CRUMB_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Cache for options data to reduce API calls
const optionsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get Yahoo Finance crumb for authentication
async function getYahooCrumb() {
  const now = Date.now();
  
  // Check cache first
  if (crumbCache && (now - crumbTimestamp) < CRUMB_CACHE_DURATION) {
    return crumbCache;
  }
  
  try {
    // First, get a quote page to extract the crumb
    const quoteUrl = 'https://finance.yahoo.com/quote/AAPL';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    const response = await fetch(quoteUrl, { headers });
    const html = await response.text();
    
    // Extract crumb from the HTML
    const crumbMatch = html.match(/"CrumbStore":\{"crumb":"([^"]+)"/);
    if (crumbMatch && crumbMatch[1]) {
      const crumb = crumbMatch[1].replace(/\\u002F/g, '/');
      crumbCache = crumb;
      crumbTimestamp = now;
      return crumb;
    }
    
    throw new Error('Could not extract crumb from Yahoo Finance');
  } catch (error) {
    console.error('Error getting Yahoo Finance crumb:', error.message);
    throw error;
  }
}

// Get current stock price from Yahoo Finance
async function getCurrentPrice(ticker) {
  try {
    const url = `${YAHOO_FINANCE_BASE}/${ticker}`;
    
    // Add headers to mimic a browser request (same as straddle calculator)
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com'
    };
    
    const response = await fetch(url, { headers });
    
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
    // Get crumb for authentication
    const crumb = await getYahooCrumb();
    const url = `${YAHOO_OPTIONS_BASE}/${ticker}?crumb=${crumb}`;
    
    // Add headers to mimic a browser request (same as straddle calculator)
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com'
    };
    
    const response = await fetch(url, { headers });
    
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
    // Get crumb for authentication
    const crumb = await getYahooCrumb();
    
    // Convert date to timestamp
    const expirationTimestamp = Math.floor(new Date(expirationDate).getTime() / 1000);
    const url = `${YAHOO_OPTIONS_BASE}/${ticker}?date=${expirationTimestamp}&crumb=${crumb}`;
    
    // Add headers to mimic a browser request
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com'
    };
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance options API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.optionChain || !data.optionChain.result || data.optionChain.result.length === 0) {
      throw new Error('No options data available for this expiration');
    }
    
    const result = data.optionChain.result[0];
    const currentPrice = result.quote.regularMarketPrice;
    
    // Get calls and puts
    const calls = result.options[0]?.calls || [];
    const puts = result.options[0]?.puts || [];
    
    if (calls.length === 0 || puts.length === 0) {
      throw new Error('No options contracts available');
    }
    
    // Find ATM strike price (closest to current price, rounded to nearest $5)
    const strikeIncrement = 5;
    const atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;
    
    // Set up Iron Condor strikes (10 dollar wings by default)
    const wingWidth = 10;
    const shortCallStrike = atmStrike;
    const shortPutStrike = atmStrike;
    const longCallStrike = atmStrike + wingWidth;
    const longPutStrike = atmStrike - wingWidth;
    
    // Find the specific contracts for our Iron Condor
    const shortCall = calls.find(call => call.strike === shortCallStrike);
    const shortPut = puts.find(put => put.strike === shortPutStrike);
    const longCall = calls.find(call => call.strike === longCallStrike);
    const longPut = puts.find(put => put.strike === longPutStrike);
    
    // Check if we have all required contracts
    const missingContracts = [];
    if (!shortCall) missingContracts.push(`Short Call ${shortCallStrike}`);
    if (!shortPut) missingContracts.push(`Short Put ${shortPutStrike}`);
    if (!longCall) missingContracts.push(`Long Call ${longCallStrike}`);
    if (!longPut) missingContracts.push(`Long Put ${longPutStrike}`);
    
    if (missingContracts.length > 0) {
      return {
        error: 'Missing required contracts',
        missingContracts,
        availableStrikes: {
          calls: [...new Set(calls.map(c => c.strike))].sort((a, b) => a - b),
          puts: [...new Set(puts.map(p => p.strike))].sort((a, b) => a - b)
        },
        requestedStrikes: {
          shortCall: shortCallStrike,
          shortPut: shortPutStrike,
          longCall: longCallStrike,
          longPut: longPutStrike
        }
      };
    }
    
    // Calculate Iron Condor premiums using mid prices
    const shortCallPrice = (shortCall.bid + shortCall.ask) / 2;
    const shortPutPrice = (shortPut.bid + shortPut.ask) / 2;
    const longCallPrice = (longCall.bid + longCall.ask) / 2;
    const longPutPrice = (longPut.bid + longPut.ask) / 2;
    
    const callCredit = shortCallPrice - longCallPrice;
    const putCredit = shortPutPrice - longPutPrice;
    const callDebit = longCallPrice; // Cost to buy the long call
    const putDebit = longPutPrice;   // Cost to buy the long put
    const totalCredit = callCredit + putCredit;
    const totalDebit = callDebit + putDebit;
    
    // Debug logging to help identify issues
    console.log(`Iron Condor Premiums for ${ticker}:`, {
      shortCall: { strike: shortCallStrike, bid: shortCall.bid, ask: shortCall.ask, mid: shortCallPrice },
      shortPut: { strike: shortPutStrike, bid: shortPut.bid, ask: shortPut.ask, mid: shortPutPrice },
      longCall: { strike: longCallStrike, bid: longCall.bid, ask: longCall.ask, mid: longCallPrice },
      longPut: { strike: longPutStrike, bid: longPut.bid, ask: longPut.ask, mid: longPutPrice },
      credits: { callCredit, putCredit, totalCredit },
      debits: { callDebit, putDebit, totalDebit }
    });
    
    const optionsData = {
      ticker: ticker.toUpperCase(),
      currentPrice,
      expiration: expirationDate,
      requestedExpiration: expirationDate,
      executionDate: new Date().toISOString().split('T')[0],
      strikes: {
        shortCall: shortCallStrike,
        shortPut: shortPutStrike,
        longCall: longCallStrike,
        longPut: longPutStrike
      },
      premiums: {
        shortCallPrice,
        shortPutPrice,
        longCallPrice,
        longPutPrice,
        callCredit,
        putCredit,
        callDebit,
        putDebit,
        totalCredit,
        totalDebit
      },
      contracts: {
        shortCall: `${ticker}${expirationDate.replace(/-/g, '')}C${shortCallStrike}000`,
        shortPut: `${ticker}${expirationDate.replace(/-/g, '')}P${shortPutStrike}000`,
        longCall: `${ticker}${expirationDate.replace(/-/g, '')}C${longCallStrike}000`,
        longPut: `${ticker}${expirationDate.replace(/-/g, '')}P${longPutStrike}000`
      },
      wingWidth,
      isNetCredit: totalCredit > 0,
      source: 'yahoo_finance',
      dataQuality: 'high'
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

// Get Iron Condor data with fallback to estimation
async function getIronCondorData(ticker, expirationDate = null) {
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
    
    // If no expiration date provided, return available expirations
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
        availableExpirations,
        requestedExpiration: expirationDate,
        message: `Requested expiration date ${expirationDate} is not available. Please check Yahoo Finance options for ${ticker} to see available dates.`,
        yahooFinanceUrl: `https://finance.yahoo.com/quote/${ticker}/options`,
        source: 'expiration_not_available',
        dataQuality: 'none'
      };
    }
    
    // Try to get real options data for the specified expiration
    try {
      const optionsData = await getOptionsData(ticker, expirationDate);
      
      // If we got an error about missing contracts, return it
      if (optionsData.error) {
        return {
          ...optionsData,
          ticker,
          currentPrice,
          availableExpirations,
          requestedExpiration: expirationDate
        };
      }
      
      return {
        ...optionsData,
        availableExpirations,
        requestedExpiration: expirationDate
      };
    } catch (error) {
      console.warn(`Could not get options data for ${ticker} ${expirationDate}, using estimation:`, error.message);
      
      // Fallback to estimation (similar to straddle calculator)
      const estimatedData = estimateIronCondorData(ticker, currentPrice, expirationDate);
      
      return {
        ...estimatedData,
        availableExpirations,
        requestedExpiration: expirationDate,
        source: 'estimation',
        dataQuality: 'medium',
        note: 'Options data estimated due to Yahoo Finance API limitations'
      };
    }
    
  } catch (error) {
    console.error(`Error getting iron condor data for ${ticker}:`, error.message);
    throw error;
  }
}

// Estimate Iron Condor data when real options data is not available
function estimateIronCondorData(ticker, currentPrice, expirationDate) {
  // Calculate days to expiration
  const expiration = new Date(expirationDate);
  const today = new Date();
  const daysToExpiration = Math.ceil((expiration - today) / (1000 * 60 * 60 * 24));
  
  // Simple estimation based on current price and time to expiration
  const volatility = 0.25; // 25% annual volatility (typical for stocks)
  const timeToExpiration = daysToExpiration / 365;
  const sqrtTime = Math.sqrt(timeToExpiration);
  
  // Estimate ATM option prices using simplified Black-Scholes
  const estimatedOptionPrice = currentPrice * volatility * sqrtTime * 0.4;
  
  // Set up Iron Condor strikes (10 dollar wings by default)
  const wingWidth = 10;
  const strikeIncrement = 5;
  const atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;
  
  const shortCallStrike = atmStrike;
  const shortPutStrike = atmStrike;
  const longCallStrike = atmStrike + wingWidth;
  const longPutStrike = atmStrike - wingWidth;
  
  // Estimate premiums (shorter strikes have higher premiums)
  const shortCallPrice = estimatedOptionPrice;
  const shortPutPrice = estimatedOptionPrice;
  const longCallPrice = estimatedOptionPrice * 0.3; // Longer strikes are cheaper
  const longPutPrice = estimatedOptionPrice * 0.3;
  
  const callCredit = shortCallPrice - longCallPrice;
  const putCredit = shortPutPrice - longPutPrice;
  const callDebit = longCallPrice; // Cost to buy the long call
  const putDebit = longPutPrice;   // Cost to buy the long put
  const totalCredit = callCredit + putCredit;
  const totalDebit = callDebit + putDebit;
  
  return {
    ticker: ticker.toUpperCase(),
    currentPrice,
    expiration: expirationDate,
    executionDate: new Date().toISOString().split('T')[0],
    strikes: {
      shortCall: shortCallStrike,
      shortPut: shortPutStrike,
      longCall: longCallStrike,
      longPut: longPutStrike
    },
    premiums: {
      shortCallPrice,
      shortPutPrice,
      longCallPrice,
      longPutPrice,
      callCredit,
      putCredit,
      callDebit,
      putDebit,
      totalCredit,
      totalDebit
    },
    contracts: {
      shortCall: `${ticker}${expirationDate.replace(/-/g, '')}C${shortCallStrike}000`,
      shortPut: `${ticker}${expirationDate.replace(/-/g, '')}P${shortPutStrike}000`,
      longCall: `${ticker}${expirationDate.replace(/-/g, '')}C${longCallStrike}000`,
      longPut: `${ticker}${expirationDate.replace(/-/g, '')}P${longPutStrike}000`
    },
    wingWidth,
    isNetCredit: totalCredit > 0
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  try {
    const ironCondorData = await getIronCondorData(ticker, expiration);
    
    // If we have an error about missing contracts, return 404
    if (ironCondorData.error) {
      return res.status(404).json(ironCondorData);
    }
    
    // If we have a message indicating no data, return 200 with the message
    if (ironCondorData.message) {
      return res.status(200).json(ironCondorData);
    }
    
    // Return successful data
    return res.status(200).json(ironCondorData);

  } catch (error) {
    console.error('Error in iron-condor-options-yahoo API:', error);
    return res.status(500).json({
      error: 'Failed to fetch iron condor options',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
