import fetch from 'node-fetch';
import { listDataFiles, getDataFile } from '../../lib/blob-data';

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

async function getLatestTradingDayWithAverages(minVolume = 0, minPrice = 0) {
  try {
    const dateFiles = await listDataFiles();

    if (dateFiles.length === 0) {
      return null;
    }

    const targetDateFile = dateFiles[0];
    const latestDateData = await getDataFile(targetDateFile.url);
    if (!latestDateData) return null;

    const filenameDate = targetDateFile.filename.replace('.json', '');

    const currentDate = new Date(filenameDate);
    const sevenDaysAgo = new Date(currentDate);
    sevenDaysAgo.setDate(currentDate.getDate() - 6);

    const recentDateFiles = dateFiles
      .filter(file => {
        const fileDate = new Date(file.filename.replace('.json', ''));
        return fileDate >= sevenDaysAgo && fileDate <= currentDate;
      })
      .slice(0, 7);

    const tickerAverages = {};
    const tickerCounts = {};

    for (const file of recentDateFiles) {
      try {
        const dateData = await getDataFile(file.url);
        if (!dateData) continue;
        dateData.tickers.forEach(ticker => {
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

    Object.keys(tickerAverages).forEach(ticker => {
      tickerAverages[ticker] = Math.round(tickerAverages[ticker] / tickerCounts[ticker]);
    });

    const filteredTickers = latestDateData.tickers.filter(ticker => {
      const tradingValue = ticker.total_value;
      const avgPrice = ticker.avg_price;
      return tradingValue >= minVolume && avgPrice >= minPrice;
    });
    
    const tickerSymbols = filteredTickers.map(t => t.ticker);
    const performanceData = await getBatchPerformance(tickerSymbols);
    
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
      date: filenameDate,
      filename: targetDateFile.filename,
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
    const { minVolume, minPrice } = req.query;
    
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
