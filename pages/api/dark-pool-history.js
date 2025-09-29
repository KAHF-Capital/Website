import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker parameter is required' });
  }

  try {
    const processedDir = path.join(process.cwd(), 'data', 'processed');
    const files = fs.readdirSync(processedDir);
    
    // Filter for JSON files that contain ticker data (not summary files)
    const dataFiles = files.filter(file => 
      file.endsWith('.json') && 
      !file.includes('_summary') &&
      file.match(/^\d{4}-\d{2}-\d{2}\.json$/)
    ).sort();

    const historicalData = [];
    const dateMap = new Map(); // Use Map to track unique dates

    for (const file of dataFiles) {
      try {
        const filePath = path.join(processedDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Find the ticker in this day's data
        const tickerData = data.tickers?.find(t => t.ticker === ticker.toUpperCase());
        
        if (tickerData) {
          // Extract date from filename instead of using data.date
          // Filename format: YYYY-MM-DD.json
          const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
          const dateKey = dateMatch ? dateMatch[1] : data.date;
          
          // Only add if we don't already have data for this date
          // or if this data has higher volume (more recent/complete data)
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
        console.error(`Error reading file ${file}:`, fileError);
        // Continue with other files
      }
    }

    // Convert Map to array and sort by date (oldest first)
    historicalData.push(...dateMap.values());
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

