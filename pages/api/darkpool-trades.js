const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticker, refresh = 'false' } = req.query;
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
      await fetchAndStoreDarkPoolTrades(ticker, currentDate, apiKey);
    }

    // Get dark pool trades from database
    let trades;
    if (ticker) {
      trades = db.getTodayDarkPoolTrades(ticker.toUpperCase(), currentDate);
    } else {
      // Get all today's dark pool trades grouped by ticker
      trades = db.getAllTodayDarkPoolTrades(currentDate);
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
    
    // Get trades from Polygon.io
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
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
    console.error(`Error fetching dark pool trades for ${ticker}:`, error);
  }
}
