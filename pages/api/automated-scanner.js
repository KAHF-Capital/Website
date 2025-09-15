const fs = require('fs');
const path = require('path');

// Data directory for processed JSON files
const DATA_DIR = path.join(process.cwd(), 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

// Configuration for automation
const AUTOMATION_CONFIG = {
  minDarkPoolActivity: 3.0, // 300% (3x) minimum dark pool activity
  minPrice: 10, // Minimum stock price
  minVolume: 250000000, // Minimum volume ($250M)
  maxTickers: 50, // Maximum number of tickers to analyze
  profitableThreshold: 55 // 55% profitability threshold for alerts
};

// Get the latest trading day data with 7-day averages
function getLatestTradingDayWithAverages() {
  try {
    // Get all date files (excluding summary files)
    const dateFiles = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json') && !file.includes('summary'))
      .map(file => {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        return {
          date: dateMatch ? dateMatch[1] : null,
          path: path.join(PROCESSED_DIR, file)
        };
      })
      .filter(file => file.date)
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending

    if (dateFiles.length === 0) {
      return null;
    }

    // Get the latest trading day
    const latestDateFile = dateFiles[0];
    const latestDateData = JSON.parse(fs.readFileSync(latestDateFile.path, 'utf8'));
    
    // Use the filename date instead of the date inside the JSON file
    const filenameDate = latestDateFile.date;

    // Calculate 7-day average for each ticker using the filename date
    const sevenDaysAgo = new Date(filenameDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all dates within the last 7 days
    const recentDateFiles = dateFiles
      .filter(file => {
        const fileDate = new Date(file.date);
        return fileDate >= sevenDaysAgo && fileDate <= new Date(filenameDate);
      })
      .slice(0, 7); // Limit to 7 days

    // Calculate 7-day averages for each ticker
    const tickerAverages = {};
    const tickerCounts = {};

    recentDateFiles.forEach(file => {
      try {
        const dateData = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        dateData.tickers.forEach(ticker => {
          if (!tickerAverages[ticker.ticker]) {
            tickerAverages[ticker.ticker] = 0;
            tickerCounts[ticker.ticker] = 0;
          }
          tickerAverages[ticker.ticker] += ticker.total_volume;
          tickerCounts[ticker.ticker]++;
        });
      } catch (error) {
        console.error(`Error reading file ${file.path}:`, error);
      }
    });

    // Calculate averages
    Object.keys(tickerAverages).forEach(ticker => {
      tickerAverages[ticker] = Math.round(tickerAverages[ticker] / tickerCounts[ticker]);
    });

    // Add 7-day average to latest day's tickers
    const enhancedTickers = latestDateData.tickers.map(ticker => ({
      ...ticker,
      avg_7day_volume: tickerAverages[ticker.ticker] || 0,
      volume_ratio: tickerAverages[ticker.ticker] > 0 
        ? (ticker.total_volume / tickerAverages[ticker.ticker])
        : 0
    }));

    return {
      date: filenameDate,
      total_tickers: latestDateData.total_tickers,
      total_volume: latestDateData.total_volume,
      last_updated: latestDateData.processed_at || new Date().toISOString(),
      tickers: enhancedTickers
    };

  } catch (error) {
    console.error('Error reading processed data:', error);
    return null;
  }
}

// Filter tickers based on automation criteria
function filterHighActivityTickers(tickers) {
  return tickers
    .filter(ticker => {
      // Filter for high dark pool activity (300%+)
      const hasHighActivity = ticker.volume_ratio >= AUTOMATION_CONFIG.minDarkPoolActivity;
      
      // Filter for minimum price
      const hasMinPrice = ticker.avg_price >= AUTOMATION_CONFIG.minPrice;
      
      // Filter for minimum volume
      const hasMinVolume = ticker.total_value >= AUTOMATION_CONFIG.minVolume;
      
      return hasHighActivity && hasMinPrice && hasMinVolume;
    })
    .sort((a, b) => b.volume_ratio - a.volume_ratio) // Sort by volume ratio descending
    .slice(0, AUTOMATION_CONFIG.maxTickers); // Limit to max tickers
}

export default async function handler(req, res) {
  try {
    const latestData = getLatestTradingDayWithAverages();
    
    if (!latestData) {
      return res.status(404).json({
        error: 'No processed data found',
        message: 'Please process CSV files first using the command line processor'
      });
    }

    // Filter tickers for high dark pool activity
    const highActivityTickers = filterHighActivityTickers(latestData.tickers);

    const response = {
      date: latestData.date,
      last_updated: latestData.last_updated,
      config: AUTOMATION_CONFIG,
      total_tickers_analyzed: latestData.tickers.length,
      high_activity_tickers: highActivityTickers.length,
      tickers: highActivityTickers.map(ticker => ({
        ticker: ticker.ticker,
        volume_ratio: ticker.volume_ratio.toFixed(2),
        total_volume: ticker.total_volume,
        avg_price: ticker.avg_price,
        total_value: ticker.total_value,
        trade_count: ticker.trade_count,
        avg_7day_volume: ticker.avg_7day_volume
      }))
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in automated-scanner API:', error);
    return res.status(500).json({
      error: 'Error loading processed data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
