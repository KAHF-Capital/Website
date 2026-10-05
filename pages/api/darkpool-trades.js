import { getScannerSnapshot } from '../../lib/scanner-snapshot';

async function buildScannerResponse(minVolume = 0, minPrice = 0) {
  const snapshot = await getScannerSnapshot();
  if (!snapshot) return null;

  const filteredTickers = snapshot.tickers.filter((ticker) => {
    const tradingValue = ticker.total_value;
    const avgPrice = ticker.avg_price;
    return tradingValue >= minVolume && avgPrice >= minPrice;
  });

  // The Scanner UI expects volume_ratio as a string ("3.04" or "N/A"); keep
  // that shape here while the shared snapshot exposes the numeric form.
  const enhancedTickers = filteredTickers.map((ticker) => ({
    ...ticker,
    volume_ratio: ticker.volume_ratio != null ? ticker.volume_ratio.toFixed(2) : 'N/A'
  }));

  return {
    date: snapshot.date,
    filename: snapshot.filename,
    total_tickers: snapshot.total_tickers,
    total_volume: snapshot.total_volume,
    last_updated: snapshot.last_updated,
    filters: {
      minVolume,
      minPrice,
      appliedFilters: minVolume > 0 || minPrice > 0,
      filteredCount: filteredTickers.length,
      totalCount: snapshot.tickers.length
    },
    average_window: snapshot.averageWindow,
    tickers: enhancedTickers
  };
}

export default async function handler(req, res) {
  try {
    const { minVolume, minPrice } = req.query;
    const volumeFilter = minVolume ? parseInt(minVolume) : 0;
    const priceFilter = minPrice ? parseFloat(minPrice) : 0;

    const latestData = await buildScannerResponse(volumeFilter, priceFilter);

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
