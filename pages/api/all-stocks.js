const db = require('../../data-store');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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

    // Initialize data store
    db.initializeDataStore();
    const currentDate = new Date().toISOString().split('T')[0];

    // Get all stocks with dark pool data for today
    const allStocksData = db.getAllStocksData(currentDate);
    
         // If no data for today, get tracked symbols and fetch current data
     if (allStocksData.length === 0) {
       const trackedSymbols = db.getTrackedSymbols();
      const symbols = trackedSymbols.length > 0 ? trackedSymbols : ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ'];
      
      const darkPoolData = [];
      
      for (const symbol of symbols) {
        try {
          // Get current stock price
          const stockResponse = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
          );
          
          let currentPrice = null;
          if (stockResponse.ok) {
            const stockData = await stockResponse.json();
            if (stockData.results && stockData.results[0]) {
              currentPrice = stockData.results[0].c;
            }
          }

          // Get today's dark pool data
          const todayDarkPool = await getDarkPoolData(symbol, currentDate, apiKey);
          
                     if (todayDarkPool) {
             const darkPoolRatio = (todayDarkPool.darkPoolVolume / todayDarkPool.totalVolume) * 100;
             db.saveDailyData(symbol, currentDate, todayDarkPool.darkPoolVolume, todayDarkPool.totalVolume, darkPoolRatio);
             
             // Get 90-day average from data store
             const historicalData = db.get90DayAverage(symbol, currentDate);
            
            darkPoolData.push({
              symbol: symbol,
              current_price: currentPrice,
              today_dark_pool_volume: todayDarkPool.darkPoolVolume,
              today_total_volume: todayDarkPool.totalVolume,
              today_dark_pool_ratio: darkPoolRatio,
              avg_90day_dark_pool_volume: historicalData.avgDailyDarkPoolVolume,
              avg_90day_total_volume: historicalData.avgDailyTotalVolume,
              activity_ratio: historicalData.avgDailyDarkPoolVolume ? (todayDarkPool.darkPoolVolume / historicalData.avgDailyDarkPoolVolume) : null,
              status: historicalData.daysWithData >= 5 ? 'tracked' : 'insufficient_history'
            });
          } else {
            darkPoolData.push({
              symbol: symbol,
              current_price: currentPrice,
              today_dark_pool_volume: 0,
              today_total_volume: 0,
              today_dark_pool_ratio: 0,
              avg_90day_dark_pool_volume: null,
              avg_90day_total_volume: null,
              activity_ratio: null,
              status: 'no_data'
            });
          }
        } catch (error) {
          console.error(`Error processing ${symbol}:`, error);
        }
      }
      
      return res.status(200).json(darkPoolData);
    }

    // Return existing data for today
    return res.status(200).json(allStocksData);

  } catch (error) {
    console.error('Error in all-stocks API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDarkPoolData(symbol, date, apiKey) {
  try {
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      return null;
    }

    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    const totalVolume = data.results.reduce((sum, trade) => sum + (trade.size || 0), 0);
    const darkPoolVolume = darkPoolTrades.reduce((sum, trade) => sum + (trade.size || 0), 0);

    return {
      totalVolume,
      darkPoolVolume,
      darkPoolTrades: darkPoolTrades.length,
      totalTrades: data.results.length
    };
  } catch (error) {
    return null;
  }
}
