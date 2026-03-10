import { listDataFiles, getDataFile } from '../../lib/blob-data';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker parameter is required' });
  }

  try {
    const dataFiles = await listDataFiles();
    const dateMap = new Map();

    for (const file of dataFiles) {
      try {
        const data = await getDataFile(file.url);
        if (!data) continue;
        
        const tickerData = data.tickers?.find(t => t.ticker === ticker.toUpperCase());
        
        if (tickerData) {
          const dateMatch = file.filename.match(/(\d{4}-\d{2}-\d{2})/);
          const dateKey = dateMatch ? dateMatch[1] : data.date;
          
          if (!dateMap.has(dateKey) || tickerData.total_volume > dateMap.get(dateKey).total_volume) {
            dateMap.set(dateKey, {
              date: dateKey,
              total_volume: tickerData.total_volume,
              trade_count: tickerData.trade_count,
              avg_price: tickerData.avg_price,
              total_value: tickerData.total_value
            });
          }
        }
      } catch (fileError) {
        console.error(`Error reading blob ${file.filename}:`, fileError);
      }
    }

    const historicalData = [...dateMap.values()];
    historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      ticker: ticker.toUpperCase(),
      data: historicalData,
      total_days: historicalData.length
    });

  } catch (error) {
    console.error('Error fetching dark pool history:', error);
    res.status(500).json({ error: 'Failed to fetch dark pool history' });
  }
}
