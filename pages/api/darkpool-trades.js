const fs = require('fs');
const path = require('path');

// Data directory for processed JSON files
const DATA_DIR = path.join(process.cwd(), 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }
}

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

    // Calculate 7-day average for each ticker
    const sevenDaysAgo = new Date(latestDateData.date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all dates within the last 7 days
    const recentDateFiles = dateFiles
      .filter(file => {
        const fileDate = new Date(file.date);
        return fileDate >= sevenDaysAgo && fileDate <= new Date(latestDateData.date);
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
      avg_7day_volume: tickerAverages[ticker.ticker] || 0
    }));

    return {
      date: filenameDate, // Use filename date instead of JSON date
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

export default async function handler(req, res) {
  try {
    ensureDirectories();
    
    const latestData = getLatestTradingDayWithAverages();
    
    if (!latestData) {
      return res.status(404).json({
        error: 'No processed data found',
        message: 'Please process CSV files first using the command line processor',
        instructions: [
          '1. Place your CSV files in the data/daily folder',
          '2. Run: node process-csv.js',
          '3. Refresh this page to view the results'
        ]
      });
    }

    return res.status(200).json(latestData);

  } catch (error) {
    console.error('Error in darkpool-trades API:', error);
    return res.status(500).json({
      error: 'Error loading processed data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}


