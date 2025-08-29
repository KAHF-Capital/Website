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
    
    // Get current date and check if it's time to refresh (4:00 PM ET)
    const now = new Date();
    const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const isRefreshTime = etTime.getHours() === 16 && etTime.getMinutes() < 5; // 4:00-4:05 PM ET
    
    const currentDate = now.toISOString().split('T')[0];
    
    // If refresh is requested or it's refresh time, fetch new data from Polygon
    if (refresh === 'true' || isRefreshTime) {
      console.log('Refreshing dark pool data...');
      await refreshTopTickersData(currentDate, apiKey);
    }

    // Get all today's dark pool trades grouped by ticker (top 25)
    let trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
    
    // If no data exists, fetch initial data
    if (trades.length === 0) {
      console.log('No data found, fetching initial data for top tickers...');
      await refreshTopTickersData(currentDate, apiKey, true); // limited=true
      trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
    }

    // Add 90-day historical data for each ticker
    const tradesWithHistory = await Promise.all(
      trades.map(async (trade) => {
        try {
          const historicalData = await get90DayDarkPoolHistory(trade.ticker, apiKey);
          return {
            ...trade,
            avg_90day_volume: historicalData.avgVolume,
            avg_90day_trades: historicalData.avgTrades,
            volume_ratio: historicalData.avgVolume > 0 ? trade.total_volume / historicalData.avgVolume : 0
          };
        } catch (error) {
          console.error(`Error fetching historical data for ${trade.ticker}:`, error);
          return {
            ...trade,
            avg_90day_volume: 0,
            avg_90day_trades: 0,
            volume_ratio: 0
          };
        }
      })
    );

    return res.status(200).json({
      date: currentDate,
      trades: tradesWithHistory,
      total_tickers: tradesWithHistory.length,
      last_updated: new Date().toISOString(),
      next_refresh: getNextRefreshTime()
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
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout for more data
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=50000&apiKey=${apiKey}`,
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

async function get90DayDarkPoolHistory(ticker, apiKey) {
  try {
    console.log(`Fetching 90-day historical data for ${ticker}...`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Get historical trades from Polygon.io
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${startDateStr}&timestamp.lte=${endDateStr}&limit=50000&apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get historical trades for ${ticker}: ${response.status}`);
      return { avgVolume: 0, avgTrades: 0 };
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No historical trade data for ${ticker}`);
      return { avgVolume: 0, avgTrades: 0 };
    }

    // Filter dark pool trades and group by date
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    // Group by date and calculate daily totals
    const dailyData = {};
    darkPoolTrades.forEach(trade => {
      const tradeDate = new Date(trade.t).toISOString().split('T')[0];
      if (!dailyData[tradeDate]) {
        dailyData[tradeDate] = { volume: 0, trades: 0 };
      }
      dailyData[tradeDate].volume += trade.size || 0;
      dailyData[tradeDate].trades += 1;
    });

    // Calculate averages
    const days = Object.keys(dailyData).length;
    if (days === 0) {
      return { avgVolume: 0, avgTrades: 0 };
    }

    const totalVolume = Object.values(dailyData).reduce((sum, day) => sum + day.volume, 0);
    const totalTrades = Object.values(dailyData).reduce((sum, day) => sum + day.trades, 0);

    console.log(`${ticker}: 90-day average - ${Math.round(totalVolume / days)} volume, ${Math.round(totalTrades / days)} trades per day`);

    return {
      avgVolume: Math.round(totalVolume / days),
      avgTrades: Math.round(totalTrades / days)
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching historical data for ${ticker}`);
    } else {
      console.error(`Error fetching historical data for ${ticker}:`, error);
    }
    return { avgVolume: 0, avgTrades: 0 };
  }
}

async function refreshTopTickersData(date, apiKey, limited = false) {
  try {
    // Focus on the most liquid stocks that are likely to have dark pool activity
    const tickers = limited ? [
      // Top 20 most liquid stocks for initial load
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU'
    ] : [
      // Top 50 most liquid stocks for complete refresh
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
      'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR', 'SNOW', 'ZM',
      'SHOP', 'SQ', 'ROKU', 'SPOT', 'UBER', 'LYFT', 'DASH', 'ABNB', 'COIN', 'HOOD',
      'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'ARKK', 'TQQQ', 'SQQQ', 'UVXY', 'VIXY'
    ];

    console.log(`Refreshing data for ${tickers.length} tickers (limited: ${limited})...`);

    // Process each ticker with shorter delays
    for (const ticker of tickers) {
      try {
        await fetchAndStoreDarkPoolTrades(ticker, date, apiKey);
        
        // Shorter delay to prevent timeouts
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
      }
    }

    console.log('Top tickers refresh completed');
    
  } catch (error) {
    console.error('Error refreshing top tickers data:', error);
  }
}

function getNextRefreshTime() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  
  // Calculate next 4:00 PM ET
  const nextRefresh = new Date(etTime);
  nextRefresh.setHours(16, 0, 0, 0); // 4:00 PM ET
  
  // If it's already past 4:00 PM today, set to tomorrow
  if (etTime.getHours() >= 16) {
    nextRefresh.setDate(nextRefresh.getDate() + 1);
  }
  
  return nextRefresh.toISOString();
}
