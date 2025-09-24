import fetch from 'node-fetch';

// Yahoo Finance API endpoints
const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required' });
  }

  try {
    // Clean ticker symbol (remove any suffixes like :1)
    const cleanTicker = ticker.split(':')[0].toUpperCase();
    
    // Get current price and previous close from Yahoo Finance
    const url = `${YAHOO_FINANCE_BASE}/${cleanTicker}`;
    const response = await fetch(url, { 
      timeout: 10000 
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
    
    const currentPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.previousClose || 0;

    if (!currentPrice || !previousClose) {
      return res.status(404).json({ error: 'Stock data not found' });
    }

    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    res.status(200).json({
      ticker: cleanTicker,
      currentPrice,
      previousClose,
      change,
      changePercent
    });

  } catch (error) {
    console.error('Error fetching stock price change:', error);
    res.status(500).json({ error: 'Failed to fetch stock price change: ' + error.message });
  }
}
