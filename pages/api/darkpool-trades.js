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
      if (ticker) {
        await fetchAndStoreDarkPoolTrades(ticker, currentDate, apiKey);
      } else {
        // Refresh data for top tickers
        await refreshTopTickersData(currentDate, apiKey);
      }
    }

    // Get dark pool trades from database
    let trades;
    if (ticker) {
      // Get specific ticker data
      const tickerData = db.getTodayDarkPoolTrades(ticker.toUpperCase(), currentDate);
      if (tickerData.length > 0) {
        // Calculate summary for the specific ticker
        const totalVolume = tickerData.reduce((sum, trade) => sum + trade.volume, 0);
        trades = [{
          ticker: ticker.toUpperCase(),
          total_volume: totalVolume,
          trade_count: tickerData.length
        }];
      } else {
        trades = [];
      }
    } else {
      // Get all today's dark pool trades grouped by ticker (top 25)
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

async function refreshTopTickersData(date, apiKey) {
  try {
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

    console.log(`Refreshing data for ${tickers.length} tickers...`);

    // Process each ticker
    for (const ticker of tickers) {
      try {
        await fetchAndStoreDarkPoolTrades(ticker, date, apiKey);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
      }
    }

    console.log('Top tickers refresh completed');
    
  } catch (error) {
    console.error('Error refreshing top tickers data:', error);
  }
}
