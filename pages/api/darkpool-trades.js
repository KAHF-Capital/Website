const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { refresh = 'false' } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      return res.status(503).json({ 
        error: 'Dark Pool Scanner is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    // Initialize database
    db.initializeDatabase();
    
    const currentDate = new Date().toISOString().split('T')[0];
    
    // If refresh is requested, fetch new data from Polygon
    if (refresh === 'true') {
      await refreshTopTickersData(currentDate, apiKey);
    }

    // Get all today's dark pool trades grouped by ticker (top 25)
    let trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
    
    // If no data exists, try to fetch a smaller set of initial data
    if (trades.length === 0) {
      console.log('No data found, fetching initial data for top tickers...');
      await refreshTopTickersData(currentDate, apiKey, true); // limited=true
      trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
    }

    return res.status(200).json({
      date: currentDate,
      trades: trades,
      total_tickers: trades.length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in dark pool trades API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function fetchAndStoreDarkPoolTrades(ticker, date, apiKey) {
  try {
    console.log(`Fetching dark pool trades for ${ticker} on ${date}...`);
    
    // Get trades from Polygon.io with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=300&apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get trades for ${ticker} on ${date}: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No trade data for ${ticker} on ${date}`);
      return;
    }

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    console.log(`${ticker}: Found ${darkPoolTrades.length} dark pool trades out of ${data.results.length} total trades`);

    // Save each dark pool trade to database
    let savedCount = 0;
    for (const trade of darkPoolTrades) {
      const tradeData = {
        ticker: ticker.toUpperCase(),
        exchange_id: trade.exchange,
        trf_id: trade.trf_id,
        volume: trade.size || 0,
        price: trade.p || 0,
        timestamp: trade.t || new Date().toISOString(),
        trade_date: date
      };

      if (db.saveDarkPoolTrade(tradeData)) {
        savedCount++;
      }
    }

    console.log(`${ticker}: Saved ${savedCount} dark pool trades to database`);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching data for ${ticker}`);
    } else {
      console.error(`Error fetching dark pool trades for ${ticker}:`, error);
    }
  }
}

async function refreshTopTickersData(date, apiKey, limited = false) {
  try {
    // Focus on the most liquid stocks that are likely to have dark pool activity
    const tickers = limited ? [
      // Top 15 most liquid stocks for initial load
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO'
    ] : [
      // Top 30 most liquid stocks for complete refresh
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
      'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR', 'SNOW', 'ZM'
    ];

    console.log(`Refreshing data for ${tickers.length} tickers (limited: ${limited})...`);

    // Process each ticker with shorter delays
    for (const ticker of tickers) {
      try {
        await fetchAndStoreDarkPoolTrades(ticker, date, apiKey);
        
        // Shorter delay to prevent timeouts
        await new Promise(resolve => setTimeout(resolve, 30));
        
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
      }
    }

    console.log('Top tickers refresh completed');
    
  } catch (error) {
    console.error('Error refreshing top tickers data:', error);
  }
}
