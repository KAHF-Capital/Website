import fetch from 'node-fetch';

// Yahoo Finance Stock Price API
// This replaces Polygon.io API calls to avoid rate limiting and 500 errors

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Cache for stock prices to reduce API calls
const priceCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get current stock price from Yahoo Finance
async function getCurrentPrice(ticker) {
  const cacheKey = ticker.toUpperCase();
  const now = Date.now();
  
  // Check cache first
  if (priceCache.has(cacheKey)) {
    const cached = priceCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
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
    const previousClose = result.meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    const priceData = {
      ticker: ticker.toUpperCase(),
      price: currentPrice,
      previousClose,
      change,
      changePercent,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
      timestamp: result.meta.regularMarketTime,
      source: 'yahoo_finance'
    };
    
    // Cache the result
    priceCache.set(cacheKey, {
      data: priceData,
      timestamp: now
    });
    
    return priceData;
  } catch (error) {
    console.error(`Error fetching current price for ${ticker}:`, error.message);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  try {
    const priceData = await getCurrentPrice(ticker);
    
    return res.status(200).json(priceData);

  } catch (error) {
    console.error('Error in stock-price-yahoo API:', error);
    return res.status(500).json({
      error: 'Failed to fetch stock price',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
