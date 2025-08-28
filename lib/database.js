const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.join(process.cwd(), 'darkpool-trades.db');

let db = null;

// Initialize database
function initializeDatabase() {
  try {
    // Create database directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    
    // Create dark pool trades table
    db.exec(`
      CREATE TABLE IF NOT EXISTS darkpool_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        exchange_id INTEGER NOT NULL,
        trf_id TEXT,
        volume INTEGER NOT NULL,
        price REAL,
        timestamp TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ticker_date 
      ON darkpool_trades(ticker, trade_date)
    `);

    // Create index for exchange_id
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_exchange_id 
      ON darkpool_trades(exchange_id)
    `);

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
}

// Save dark pool trade
function saveDarkPoolTrade(trade) {
  try {
    if (!db) {
      console.error('Database not initialized');
      return false;
    }

    const stmt = db.prepare(`
      INSERT INTO darkpool_trades 
      (ticker, exchange_id, trf_id, volume, price, timestamp, trade_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      trade.ticker,
      trade.exchange_id,
      trade.trf_id,
      trade.volume,
      trade.price,
      trade.timestamp,
      trade.trade_date
    );

    return result.changes > 0;
  } catch (error) {
    console.error('Error saving dark pool trade:', error);
    return false;
  }
}

// Get today's dark pool trades for a ticker
function getTodayDarkPoolTrades(ticker, date) {
  try {
    if (!db) {
      console.error('Database not initialized');
      return [];
    }

    const stmt = db.prepare(`
      SELECT * FROM darkpool_trades 
      WHERE ticker = ? AND trade_date = ?
      ORDER BY timestamp DESC
    `);

    return stmt.all(ticker, date);
  } catch (error) {
    console.error('Error getting today\'s dark pool trades:', error);
    return [];
  }
}

// Get all dark pool trades for today
function getAllTodayDarkPoolTrades(date) {
  try {
    if (!db) {
      console.error('Database not initialized');
      return [];
    }

    const stmt = db.prepare(`
      SELECT 
        ticker,
        SUM(volume) as total_volume,
        COUNT(*) as trade_count,
        MIN(timestamp) as first_trade,
        MAX(timestamp) as last_trade
      FROM darkpool_trades 
      WHERE trade_date = ?
      GROUP BY ticker
      ORDER BY total_volume DESC
    `);

    return stmt.all(date);
  } catch (error) {
    console.error('Error getting all today\'s dark pool trades:', error);
    return [];
  }
}

// Get dark pool volume summary for a ticker
function getDarkPoolVolumeSummary(ticker, date) {
  try {
    if (!db) {
      console.error('Database not initialized');
      return null;
    }

    const stmt = db.prepare(`
      SELECT 
        SUM(volume) as total_volume,
        COUNT(*) as trade_count,
        AVG(price) as avg_price
      FROM darkpool_trades 
      WHERE ticker = ? AND trade_date = ?
    `);

    const result = stmt.get(ticker, date);
    return result || { total_volume: 0, trade_count: 0, avg_price: 0 };
  } catch (error) {
    console.error('Error getting dark pool volume summary:', error);
    return null;
  }
}

// Get recent dark pool trades (last 100)
function getRecentDarkPoolTrades(limit = 100) {
  try {
    if (!db) {
      console.error('Database not initialized');
      return [];
    }

    const stmt = db.prepare(`
      SELECT * FROM darkpool_trades 
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  } catch (error) {
    console.error('Error getting recent dark pool trades:', error);
    return [];
  }
}

// Clean up old data (older than 90 days)
function cleanupOldData() {
  try {
    if (!db) {
      console.error('Database not initialized');
      return false;
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

    const stmt = db.prepare(`
      DELETE FROM darkpool_trades 
      WHERE trade_date < ?
    `);

    const result = stmt.run(cutoffDate);
    console.log(`Cleaned up ${result.changes} old records`);
    return true;
  } catch (error) {
    console.error('Error cleaning up old data:', error);
    return false;
  }
}

// Close database connection
function closeDatabase() {
  try {
    if (db) {
      db.close();
      db = null;
      console.log('Database connection closed');
    }
  } catch (error) {
    console.error('Error closing database:', error);
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
  closeDatabase
};
