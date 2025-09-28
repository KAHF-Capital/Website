const fs = require('fs');
const path = require('path');
import fetch from 'node-fetch';

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

// Get performance data for multiple tickers using batch API
async function getBatchPerformance(tickers) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/batch-performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tickers: tickers
      })
    });

    if (!response.ok) {
      console.error('Batch performance API failed:', response.status);
      return {};
    }

    const data = await response.json();
    
    // Convert array results to object format
    const results = {};
    data.data.forEach(item => {
      if (!item.error) {
        results[item.ticker] = {
          currentPrice: item.currentPrice,
          previousClose: item.previousClose,
          change: item.change,
          changePercent: item.changePercent
        };
      }
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching batch performance:', error.message);
    return {};
  }
}

// Get the most recently analyzed file with 7-day averages
async function getLatestTradingDayWithAverages(minVolume = 0, minPrice = 0) {
  try {
    // Get all date files (excluding summary files)
    const dateFiles = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json') && !file.includes('summary'))
      .map(file => {
        // Extract date from filename - now files are named like "2025-08-22.json"
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        return {
          date: dateMatch ? dateMatch[1] : null,
          filename: file,
          path: path.join(PROCESSED_DIR, file)
        };
      })
      .filter(file => file.date)
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending

    if (dateFiles.length === 0) {
      return null;
    }

    // Use the most recent file (first in the sorted array)
    const targetDateFile = dateFiles[0];
    
    const latestDateData = JSON.parse(fs.readFileSync(targetDateFile.path, 'utf8'));
    
    // Use the filename date instead of the date inside the JSON file
    const filenameDate = targetDateFile.date;

    // Calculate 7-day average for each ticker using the filename date
    const currentDate = new Date(filenameDate);
    const sevenDaysAgo = new Date(currentDate);
    sevenDaysAgo.setDate(currentDate.getDate() - 6); // Include current day, so 6 days back

    // Get all dates within the last 7 days (including the current date)
    const recentDateFiles = dateFiles
      .filter(file => {
        const fileDate = new Date(file.date);
        return fileDate >= sevenDaysAgo && fileDate <= currentDate;
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

    // Apply volume and price filters if specified
    const filteredTickers = latestDateData.tickers.filter(ticker => {
      const tradingValue = ticker.total_value;
      const avgPrice = ticker.avg_price;
      return tradingValue >= minVolume && avgPrice >= minPrice;
    });
    
    // Get performance data only for filtered tickers
    const tickerSymbols = filteredTickers.map(t => t.ticker);
    const performanceData = await getBatchPerformance(tickerSymbols);
    
    // Add 7-day average and performance data to filtered tickers
    const enhancedTickers = filteredTickers.map(ticker => {
      const performance = performanceData[ticker.ticker];
      const volumeRatio = tickerAverages[ticker.ticker] > 0 
        ? (ticker.total_volume / tickerAverages[ticker.ticker]).toFixed(2)
        : 'N/A';
      
      return {
        ...ticker,
        avg_7day_volume: tickerAverages[ticker.ticker] || 0,
        volume_ratio: volumeRatio,
        performance: performance ? {
          currentPrice: performance.currentPrice,
          previousClose: performance.previousClose,
          change: performance.change,
          changePercent: performance.changePercent
        } : null
      };
    });

    return {
      date: filenameDate, // Use filename date instead of JSON date
      filename: targetDateFile.filename, // Include the actual filename
      total_tickers: latestDateData.total_tickers,
      total_volume: latestDateData.total_volume,
      last_updated: latestDateData.processed_at || new Date().toISOString(),
      filters: {
        minVolume: minVolume,
        minPrice: minPrice,
        appliedFilters: minVolume > 0 || minPrice > 0,
        filteredCount: filteredTickers.length,
        totalCount: latestDateData.tickers.length
      },
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
    
    // Get query parameters for filtering
    const { minVolume, minPrice } = req.query;
    
    // Parse and validate parameters
    const volumeFilter = minVolume ? parseInt(minVolume) : 0;
    const priceFilter = minPrice ? parseFloat(minPrice) : 0;
    
    const latestData = await getLatestTradingDayWithAverages(volumeFilter, priceFilter);
    
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


