import fetch from 'node-fetch';

// Yahoo Finance Available Expirations API
// Returns all available expiration dates for a ticker without forcing a selection

const YAHOO_OPTIONS_BASE = 'https://query2.finance.yahoo.com/v7/finance/options';

// Get available expiration dates for a ticker
async function getAvailableExpirations(ticker) {
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
    
    if (expirations.length === 0) {
      throw new Error('No expiration dates available');
    }
    
    // Convert timestamps to date strings and sort them
    const expirationDates = expirations
      .map(timestamp => {
        const date = new Date(timestamp * 1000);
        return {
          timestamp: timestamp,
          date: date.toISOString().split('T')[0], // YYYY-MM-DD format
          displayDate: date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          }),
          daysFromNow: Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24))
        };
      })
      .filter(exp => exp.daysFromNow > 0) // Only future dates
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by date ascending
    
    return {
      ticker,
      totalExpirations: expirationDates.length,
      expirations: expirationDates,
      source: 'yahoo_finance',
      lastUpdated: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error fetching expiration dates for ${ticker}:`, error.message);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ 
      error: 'Missing required parameter: ticker'
    });
  }

  try {
    const result = await getAvailableExpirations(ticker);
    
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in available-expirations-yahoo API:', error);
    return res.status(500).json({
      error: 'Failed to fetch available expiration dates',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}


