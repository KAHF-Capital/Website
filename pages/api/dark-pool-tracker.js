// Dark Pool Activity Tracker
// Stores daily dark pool data and calculates rolling averages
// Updates every 15 minutes during market hours

let darkPoolHistory = new Map(); // symbol -> array of daily data
let lastUpdateTime = null;
const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, symbol } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      return res.status(503).json({ 
        error: 'Dark Pool Tracker is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    // Check if we need to update data
    const now = Date.now();
    if (!lastUpdateTime || (now - lastUpdateTime) > UPDATE_INTERVAL) {
      await updateDarkPoolData(apiKey);
      lastUpdateTime = now;
    }

    if (action === 'history' && symbol) {
      // Return historical data for a specific symbol
      const symbolData = darkPoolHistory.get(symbol.toUpperCase()) || [];
      return res.status(200).json({
        symbol: symbol.toUpperCase(),
        history: symbolData,
        lastUpdate: lastUpdateTime
      });
    }

    if (action === 'averages') {
      // Return 90-day averages for all symbols
      const averages = {};
      for (const [symbol, history] of darkPoolHistory.entries()) {
        averages[symbol] = calculate90DayAverage(history);
      }
      return res.status(200).json({
        averages,
        lastUpdate: lastUpdateTime
      });
    }

    // Default: return current status
    return res.status(200).json({
      symbolsTracked: darkPoolHistory.size,
      lastUpdate: lastUpdateTime,
      nextUpdate: lastUpdateTime + UPDATE_INTERVAL
    });

  } catch (error) {
    console.error('Error in dark pool tracker:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateDarkPoolData(apiKey) {
  console.log('Updating dark pool data...');
  
  const symbols = [
    'AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD',
    'NFLX', 'CRM', 'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO',
    'TXN', 'MU', 'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR'
  ];

  const currentDate = new Date().toISOString().split('T')[0];

  for (const symbol of symbols) {
    try {
      const darkPoolData = await getDarkPoolData(symbol, currentDate, apiKey);
      
      if (darkPoolData && darkPoolData.totalVolume > 0) {
        const dailyRecord = {
          date: currentDate,
          timestamp: Date.now(),
          darkPoolVolume: darkPoolData.darkPoolVolume,
          totalVolume: darkPoolData.totalVolume,
          darkPoolTrades: darkPoolData.darkPoolTrades,
          totalTrades: darkPoolData.totalTrades
        };

        // Add to history
        if (!darkPoolHistory.has(symbol)) {
          darkPoolHistory.set(symbol, []);
        }
        
        const history = darkPoolHistory.get(symbol);
        
        // Remove old records (keep last 120 days)
        const cutoffDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const filteredHistory = history.filter(record => record.date >= cutoffDate);
        
        // Add new record if it doesn't exist for today
        const existingToday = filteredHistory.find(record => record.date === currentDate);
        if (!existingToday) {
          filteredHistory.push(dailyRecord);
        } else {
          // Update existing record with latest data
          const index = filteredHistory.findIndex(record => record.date === currentDate);
          filteredHistory[index] = dailyRecord;
        }
        
        darkPoolHistory.set(symbol, filteredHistory);
        
        console.log(`Updated ${symbol}: DP=${darkPoolData.darkPoolVolume.toLocaleString()}, Total=${darkPoolData.totalVolume.toLocaleString()}`);
      }
    } catch (error) {
      console.error(`Error updating ${symbol}:`, error);
    }
  }
  
  console.log(`Dark pool data update complete. Tracking ${darkPoolHistory.size} symbols.`);
}

function calculate90DayAverage(history) {
  if (!history || history.length === 0) {
    return { avgDailyDarkPoolVolume: 0, avgDailyTotalVolume: 0, daysWithData: 0 };
  }

  // Get last 90 days of data
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentHistory = history.filter(record => record.date >= cutoffDate);

  if (recentHistory.length === 0) {
    return { avgDailyDarkPoolVolume: 0, avgDailyTotalVolume: 0, daysWithData: 0 };
  }

  const totalDarkPoolVolume = recentHistory.reduce((sum, record) => sum + record.darkPoolVolume, 0);
  const totalVolume = recentHistory.reduce((sum, record) => sum + record.totalVolume, 0);

  return {
    avgDailyDarkPoolVolume: totalDarkPoolVolume / recentHistory.length,
    avgDailyTotalVolume: totalVolume / recentHistory.length,
    daysWithData: recentHistory.length
  };
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

    // Filter dark pool trades (exchange = 4 AND trf_id present)
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
    console.error(`Error getting dark pool data for ${symbol}:`, error);
    return null;
  }
}
