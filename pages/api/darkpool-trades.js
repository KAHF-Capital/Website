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

// Get stock performance data from Yahoo Finance
async function getStockPerformance(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      return null;
    }
    
    const result = data.chart.result[0];
    const meta = result.meta;
    
    // Calculate performance
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    return {
      currentPrice: currentPrice,
      previousClose: previousClose,
      change: change,
      changePercent: changePercent
    };
  } catch (error) {
    console.error(`Error fetching performance for ${ticker}:`, error.message);
    return null;
  }
}

// Get performance data for multiple tickers with rate limiting
async function getBatchPerformance(tickers, maxConcurrent = 5, delayMs = 200) {
  const results = {};
  
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (ticker) => {
      const performance = await getStockPerformance(ticker);
      return { ticker, performance };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    batchResults.forEach(({ ticker, performance }) => {
      results[ticker] = performance;
    });
    
    // Add delay between batches to be respectful to Yahoo Finance
    if (i + maxConcurrent < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// Get the weekday before today's data with 7-day averages
async function getLatestTradingDayWithAverages() {
  try {
    // Calculate the weekday before today
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    // If yesterday was weekend, go back to Friday
    while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
      yesterday.setDate(yesterday.getDate() - 1);
    }
    
    const targetDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
    
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

    // Find the file for the target date (weekday before today)
    let targetDateFile = dateFiles.find(file => file.date === targetDate);
    
    // If target date not found, find the closest previous trading day
    if (!targetDateFile) {
      targetDateFile = dateFiles.find(file => file.date < targetDate);
    }
    
    // If still no file found, use the latest available
    if (!targetDateFile) {
      targetDateFile = dateFiles[0];
    }
    
    const latestDateData = JSON.parse(fs.readFileSync(targetDateFile.path, 'utf8'));
    
    // Use the filename date instead of the date inside the JSON file
    const filenameDate = targetDateFile.date;

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

    // Get performance data for all tickers
    const tickerSymbols = latestDateData.tickers.map(t => t.ticker);
    const performanceData = await getBatchPerformance(tickerSymbols);
    
    // Add 7-day average and performance data to latest day's tickers
    const enhancedTickers = latestDateData.tickers.map(ticker => {
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
    
    const latestData = await getLatestTradingDayWithAverages();
    
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


