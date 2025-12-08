// Test Signals API - Preview signals without sending SMS
// Use this to test and validate signal detection

import { analyzeAllTickers, SEVERITY_LEVELS } from '../../lib/signal-detector';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the latest dark pool data
    const darkPoolData = await getLatestDarkPoolData();
    
    if (!darkPoolData || !darkPoolData.tickers || darkPoolData.tickers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No dark pool data available',
        signals: null
      });
    }

    // Get query parameters for filtering
    const { 
      minValue = 100000000, // $100M default
      minPrice = 50,
      maxResults = 25
    } = req.query;

    // Filter tickers by value and price
    const filteredTickers = darkPoolData.tickers.filter(ticker => {
      return ticker.total_value >= parseInt(minValue) && 
             ticker.avg_price >= parseFloat(minPrice);
    });

    // Calculate 7-day averages for volume ratio
    const tickersWithRatio = await addVolumeRatios(filteredTickers, darkPoolData.date);

    // Analyze tickers for signals
    const analysis = analyzeAllTickers(tickersWithRatio, {
      minTotalValue: parseInt(minValue),
      maxResults: parseInt(maxResults)
    });

    return res.status(200).json({
      success: true,
      date: darkPoolData.date,
      analysis: {
        hot: analysis.hot,
        warm: analysis.warm,
        watch: analysis.watch.slice(0, 10), // Limit watch to 10
        summary: analysis.summary
      },
      filters: {
        minValue: parseInt(minValue),
        minPrice: parseFloat(minPrice),
        tickersAnalyzed: filteredTickers.length
      },
      message: `Found ${analysis.hot.length} HOT, ${analysis.warm.length} WARM, ${analysis.watch.length} WATCH signals`
    });

  } catch (error) {
    console.error('Test signals error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// Get the latest dark pool data from processed files
async function getLatestDarkPoolData() {
  try {
    const processedDir = path.join(process.cwd(), 'data', 'processed');
    
    if (!fs.existsSync(processedDir)) {
      return null;
    }

    const files = fs.readdirSync(processedDir)
      .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    if (files.length === 0) {
      return null;
    }

    const latestFile = files[0];
    const filePath = path.join(processedDir, latestFile);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    return {
      date: latestFile.replace('.json', ''),
      tickers: data.tickers || [],
      total_volume: data.total_volume || 0
    };
  } catch (error) {
    console.error('Error loading dark pool data:', error);
    return null;
  }
}

// Add 7-day average volume ratios to tickers
async function addVolumeRatios(tickers, currentDate) {
  try {
    const processedDir = path.join(process.cwd(), 'data', 'processed');
    
    // Get last 7 days of data
    const files = fs.readdirSync(processedDir)
      .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse()
      .slice(0, 7);

    // Calculate averages
    const tickerAverages = {};
    const tickerCounts = {};

    files.forEach(file => {
      try {
        const filePath = path.join(processedDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        data.tickers.forEach(ticker => {
          if (!tickerAverages[ticker.ticker]) {
            tickerAverages[ticker.ticker] = 0;
            tickerCounts[ticker.ticker] = 0;
          }
          tickerAverages[ticker.ticker] += ticker.total_volume;
          tickerCounts[ticker.ticker]++;
        });
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    });

    // Add ratios to tickers
    return tickers.map(ticker => {
      const avg = tickerCounts[ticker.ticker] 
        ? tickerAverages[ticker.ticker] / tickerCounts[ticker.ticker]
        : 0;
      
      const volumeRatio = avg > 0 
        ? (ticker.total_volume / avg).toFixed(2)
        : 'N/A';

      return {
        ...ticker,
        avg_7day_volume: Math.round(avg),
        volume_ratio: volumeRatio
      };
    });
  } catch (error) {
    console.error('Error calculating volume ratios:', error);
    return tickers.map(t => ({ ...t, volume_ratio: 'N/A' }));
  }
}

