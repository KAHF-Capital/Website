const fs = require('fs');
const path = require('path');

// Data file path - use /tmp for Vercel compatibility
const getDataPath = () => {
  // Use /tmp directory for Vercel serverless functions
  if (process.env.VERCEL) {
    return '/tmp/darkpool-trades.json';
  }
  // Use local directory for development
  return path.join(process.cwd(), 'darkpool-trades.json');
};

// Initialize data store
function initializeDatabase() {
  try {
    const dataPath = getDataPath();
    
    // Check if data file exists
    if (!fs.existsSync(dataPath)) {
      const initialData = {
        trades: [],
        last_updated: null
      };
      fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2));
      console.log('Database initialized successfully');
    }
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
}

// Load data from file
function loadData() {
  try {
    const dataPath = getDataPath();
    if (!fs.existsSync(dataPath)) {
      return { trades: [], last_updated: null };
    }
    const fileContent = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error loading data:', error);
    return { trades: [], last_updated: null };
  }
}

// Save data to file
function saveData(data) {
  try {
    const dataPath = getDataPath();
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Save dark pool trade
function saveDarkPoolTrade(trade) {
  try {
    const data = loadData();
    
    // Add trade to the array
    data.trades.push({
      id: Date.now() + Math.random(), // Simple unique ID
      ticker: trade.ticker,
      exchange_id: trade.exchange_id,
      trf_id: trade.trf_id,
      volume: trade.volume,
      price: trade.price,
      timestamp: trade.timestamp,
      trade_date: trade.trade_date,
      created_at: new Date().toISOString()
    });
    
    // Update last updated timestamp
    data.last_updated = new Date().toISOString();
    
    // Keep only last 1000 trades to prevent file from getting too large
    if (data.trades.length > 1000) {
      data.trades = data.trades.slice(-1000);
    }
    
    saveData(data);
    console.log(`Saved trade for ${trade.ticker}`);
    return true;
  } catch (error) {
    console.error('Error saving dark pool trade:', error);
    return false;
  }
}

// Get today's dark pool trades for a ticker
function getTodayDarkPoolTrades(ticker, date) {
  try {
    const data = loadData();
    
    return data.trades.filter(trade => 
      trade.ticker === ticker.toUpperCase() && 
      trade.trade_date === date
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting today\'s dark pool trades:', error);
    return [];
  }
}

// Get all dark pool trades for today
function getAllTodayDarkPoolTrades(date) {
  try {
    const data = loadData();
    
    // Filter trades for today
    const todayTrades = data.trades.filter(trade => trade.trade_date === date);
    
    // Group by ticker and calculate summaries
    const tickerMap = {};
    
    todayTrades.forEach(trade => {
      if (!tickerMap[trade.ticker]) {
        tickerMap[trade.ticker] = {
          ticker: trade.ticker,
          total_volume: 0,
          trade_count: 0,
          first_trade: null,
          last_trade: null
        };
      }
      
      tickerMap[trade.ticker].total_volume += trade.volume;
      tickerMap[trade.ticker].trade_count += 1;
      
      if (!tickerMap[trade.ticker].first_trade || 
          new Date(trade.timestamp) < new Date(tickerMap[trade.ticker].first_trade)) {
        tickerMap[trade.ticker].first_trade = trade.timestamp;
      }
      
      if (!tickerMap[trade.ticker].last_trade || 
          new Date(trade.timestamp) > new Date(tickerMap[trade.ticker].last_trade)) {
        tickerMap[trade.ticker].last_trade = trade.timestamp;
      }
    });
    
    // Convert to array and sort by total volume
    return Object.values(tickerMap)
      .sort((a, b) => b.total_volume - a.total_volume);
  } catch (error) {
    console.error('Error getting all today\'s dark pool trades:', error);
    return [];
  }
}

// Get dark pool volume summary for a ticker
function getDarkPoolVolumeSummary(ticker, date) {
  try {
    const trades = getTodayDarkPoolTrades(ticker, date);
    
    if (trades.length === 0) {
      return { total_volume: 0, trade_count: 0, avg_price: 0 };
    }
    
    const totalVolume = trades.reduce((sum, trade) => sum + trade.volume, 0);
    const avgPrice = trades.reduce((sum, trade) => sum + trade.price, 0) / trades.length;
    
    return {
      total_volume: totalVolume,
      trade_count: trades.length,
      avg_price: avgPrice
    };
  } catch (error) {
    console.error('Error getting dark pool volume summary:', error);
    return null;
  }
}

// Get recent dark pool trades (last 100)
function getRecentDarkPoolTrades(limit = 100) {
  try {
    const data = loadData();
    
    return data.trades
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting recent dark pool trades:', error);
    return [];
  }
}

// Clean up old data (older than 7 days for Vercel compatibility)
function cleanupOldData() {
  try {
    const data = loadData();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];
    
    const originalCount = data.trades.length;
    data.trades = data.trades.filter(trade => trade.trade_date >= cutoffDate);
    
    saveData(data);
    console.log(`Cleaned up ${originalCount - data.trades.length} old records`);
    return true;
  } catch (error) {
    console.error('Error cleaning up old data:', error);
    return false;
  }
}

// Close database connection (no-op for JSON storage)
function closeDatabase() {
  // No connection to close for JSON storage
  console.log('Database connection closed (JSON storage)');
}

// Save today's analysis
function saveTodayAnalysis(date, analysis) {
  try {
    const data = loadData();
    
    // Store analysis in a separate section
    if (!data.analysis) {
      data.analysis = {};
    }
    
    data.analysis[date] = {
      trades: analysis.trades,
      last_updated: analysis.last_updated,
      created_at: new Date().toISOString()
    };
    
    saveData(data);
    console.log(`Saved analysis for ${date}`);
    return true;
  } catch (error) {
    console.error('Error saving today\'s analysis:', error);
    return false;
  }
}

// Get today's analysis
function getTodayAnalysis(date) {
  try {
    const data = loadData();
    
    if (!data.analysis || !data.analysis[date]) {
      return null;
    }
    
    return data.analysis[date];
  } catch (error) {
    console.error('Error getting today\'s analysis:', error);
    return null;
  }
}

module.exports = {
  initializeDatabase,
  saveDarkPoolTrade,
  getTodayDarkPoolTrades,
  getAllTodayDarkPoolTrades,
  getDarkPoolVolumeSummary,
  getRecentDarkPoolTrades,
  cleanupOldData,
  closeDatabase,
  saveTodayAnalysis,
  getTodayAnalysis
};
