const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
    
    // List of popular tickers to monitor
    const tickers = [
      // Major tech stocks
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
      'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR', 'SNOW', 'ZM',
      'SHOP', 'SQ', 'ROKU', 'SPOT', 'UBER', 'LYFT', 'DASH', 'ABNB', 'COIN', 'HOOD',
      
      // ETFs and indices
      'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'ARKK', 'TQQQ', 'SQQQ', 'UVXY', 'VIXY',
      
      // Financial stocks
      'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'COF', 'AXP',
      
      // Healthcare
      'JNJ', 'PFE', 'UNH', 'ABBV', 'MRK', 'TMO', 'DHR', 'ABT', 'BMY', 'AMGN',
      
      // Consumer
      'HD', 'LOW', 'WMT', 'TGT', 'COST', 'SBUX', 'NKE', 'MCD', 'DIS',
      
      // Energy
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'HAL', 'BKR',
      
      // Industrial
      'CAT', 'DE', 'BA', 'LMT', 'RTX', 'GE', 'MMM', 'HON', 'UPS', 'FDX'
    ];

    const results = {
      date: currentDate,
      total_tickers: tickers.length,
      processed: 0,
      successful: 0,
      failed: 0,
      total_darkpool_trades: 0,
      start_time: new Date().toISOString()
    };

    // Process each ticker
    for (const ticker of tickers) {
      try {
        console.log(`Processing ${ticker}...`);
        
        const trades = await fetchAndStoreDarkPoolTrades(ticker, currentDate, apiKey);
        
        if (trades > 0) {
          results.successful++;
          results.total_darkpool_trades += trades;
        } else {
          results.failed++;
        }
        
        results.processed++;
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        results.failed++;
        results.processed++;
      }
    }

    results.end_time = new Date().toISOString();
    results.duration_ms = new Date(results.end_time) - new Date(results.start_time);

    console.log(`Dark pool refresh completed: ${results.successful}/${results.total_tickers} successful, ${results.total_darkpool_trades} total trades`);

    return res.status(200).json(results);

  } catch (error) {
    console.error('Error in dark pool refresh API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function fetchAndStoreDarkPoolTrades(ticker, date, apiKey) {
  try {
    // Get trades from Polygon.io
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
    if (!response.ok) {
      console.log(`Failed to get trades for ${ticker} on ${date}: ${response.status}`);
      return 0;
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No trade data for ${ticker} on ${date}`);
      return 0;
    }

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    if (darkPoolTrades.length === 0) {
      return 0;
    }

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

    console.log(`${ticker}: Saved ${savedCount} dark pool trades`);
    return savedCount;
    
  } catch (error) {
    console.error(`Error fetching dark pool trades for ${ticker}:`, error);
    return 0;
  }
}


