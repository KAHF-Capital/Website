// Test Signals API - Preview signals without sending SMS

import { analyzeAllTickers, SEVERITY_LEVELS } from '../../lib/signal-detector';
import { listDataFiles, getDataFile } from '../../lib/blob-data';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const darkPoolData = await getLatestDarkPoolData();
    
    if (!darkPoolData || !darkPoolData.tickers || darkPoolData.tickers.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No dark pool data available',
        signals: null
      });
    }

    const { 
      minValue = 100000000,
      minPrice = 50,
      maxResults = 25
    } = req.query;

    const filteredTickers = darkPoolData.tickers.filter(ticker => {
      return ticker.total_value >= parseInt(minValue) && 
             ticker.avg_price >= parseFloat(minPrice);
    });

    const tickersWithRatio = await addVolumeRatios(filteredTickers, darkPoolData.date);

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
        watch: analysis.watch.slice(0, 10),
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

async function getLatestDarkPoolData() {
  try {
    const files = await listDataFiles();

    if (files.length === 0) return null;

    const latestFile = files[0];
    const data = await getDataFile(latestFile.url);
    if (!data) return null;

    return {
      date: latestFile.filename.replace('.json', ''),
      tickers: data.tickers || [],
      total_volume: data.total_volume || 0
    };
  } catch (error) {
    console.error('Error loading dark pool data:', error);
    return null;
  }
}

async function addVolumeRatios(tickers, currentDate) {
  try {
    const files = await listDataFiles();
    const recentFiles = files.slice(0, 7);

    const tickerAverages = {};
    const tickerCounts = {};

    for (const file of recentFiles) {
      try {
        const data = await getDataFile(file.url);
        if (!data) continue;
        
        data.tickers.forEach(ticker => {
          if (!tickerAverages[ticker.ticker]) {
            tickerAverages[ticker.ticker] = 0;
            tickerCounts[ticker.ticker] = 0;
          }
          tickerAverages[ticker.ticker] += ticker.total_volume;
          tickerCounts[ticker.ticker]++;
        });
      } catch (error) {
        console.error(`Error reading blob ${file.filename}:`, error);
      }
    }

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
