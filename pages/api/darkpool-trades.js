const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Data directory for CSV files
const DATA_DIR = path.join(process.cwd(), 'data');
const DAILY_CSV_DIR = path.join(DATA_DIR, 'daily');
const HISTORICAL_CSV_PATH = path.join(DATA_DIR, 'darkpool_history.csv');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DAILY_CSV_DIR)) {
    fs.mkdirSync(DAILY_CSV_DIR, { recursive: true });
  }
}

// Parse CSV file and extract dark pool trades with memory limits
function parseDarkPoolTrades(csvFilePath) {
  return new Promise((resolve, reject) => {
    const darkPoolTrades = [];
    let rowCount = 0;
    const MAX_ROWS = 10000; // Limit to 10k rows to prevent memory issues
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        // Stop processing if we hit the limit
        if (rowCount > MAX_ROWS) {
          console.log(`Reached row limit (${MAX_ROWS}), stopping processing`);
          return;
        }
        
        // Check if this is a dark pool trade
        // Dark pool trades have exchange = 4 AND trf_id present
        if (row.exchange === '4' && row.trf_id && row.trf_id.trim() !== '') {
          darkPoolTrades.push({
            ticker: row.ticker || row.symbol || 'UNKNOWN',
            volume: parseInt(row.size || row.volume || 0),
            price: parseFloat(row.price || row.p || 0),
            timestamp: row.timestamp || row.t || new Date().toISOString(),
            exchange: row.exchange,
            trf_id: row.trf_id
          });
        }
      })
      .on('end', () => {
        console.log(`Processed ${rowCount} rows, found ${darkPoolTrades.length} dark pool trades`);
        resolve(darkPoolTrades);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Group dark pool trades by ticker and calculate totals
function groupTradesByTicker(trades) {
  const tickerMap = {};
  
  trades.forEach(trade => {
    const ticker = trade.ticker.toUpperCase();
    if (!tickerMap[ticker]) {
      tickerMap[ticker] = {
        ticker: ticker,
        total_volume: 0,
        trade_count: 0,
        avg_price: 0,
        total_value: 0
      };
    }
    
    tickerMap[ticker].total_volume += trade.volume;
    tickerMap[ticker].trade_count += 1;
    tickerMap[ticker].total_value += trade.volume * trade.price;
  });
  
  // Calculate average price
  Object.values(tickerMap).forEach(tickerData => {
    tickerData.avg_price = tickerData.total_value / tickerData.total_volume;
  });
  
  // Convert to array and sort by volume
  return Object.values(tickerMap)
    .sort((a, b) => b.total_volume - a.total_volume);
}

// Save dark pool data to historical CSV
function saveToHistoricalCSV(trades, date) {
  const csvWriter = createCsvWriter({
    path: HISTORICAL_CSV_PATH,
    header: [
      { id: 'date', title: 'DATE' },
      { id: 'ticker', title: 'TICKER' },
      { id: 'total_volume', title: 'TOTAL_VOLUME' },
      { id: 'trade_count', title: 'TRADE_COUNT' },
      { id: 'avg_price', title: 'AVG_PRICE' },
      { id: 'total_value', title: 'TOTAL_VALUE' }
    ],
    append: fs.existsSync(HISTORICAL_CSV_PATH)
  });
  
  const records = trades.map(trade => ({
    date: date,
    ticker: trade.ticker,
    total_volume: trade.total_volume,
    trade_count: trade.trade_count,
    avg_price: trade.avg_price.toFixed(2),
    total_value: trade.total_value.toFixed(2)
  }));
  
  return csvWriter.writeRecords(records);
}

// Get latest CSV file from daily directory (prefer smaller files for testing)
function getLatestCSVFile() {
  const files = fs.readdirSync(DAILY_CSV_DIR)
    .filter(file => file.endsWith('.csv'))
    .map(file => {
      const filePath = path.join(DAILY_CSV_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        mtime: stats.mtime,
        size: stats.size
      };
    })
    .sort((a, b) => {
      // Prefer smaller files (like test.csv) over large files
      if (a.size < 1000000 && b.size >= 1000000) return -1;
      if (b.size < 1000000 && a.size >= 1000000) return 1;
      // Then sort by modification time
      return b.mtime - a.mtime;
    });
  
  return files.length > 0 ? files[0] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    ensureDirectories();
    
    const { save = 'false' } = req.query;
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Get the latest CSV file
    const latestFile = getLatestCSVFile();
    
    if (!latestFile) {
      return res.status(404).json({
        error: 'No CSV files found',
        message: `Please upload a CSV file to the ${DAILY_CSV_DIR} directory`,
        instructions: [
          '1. Download your Polygon.io CSV file',
          '2. Upload it to the data/daily folder',
          '3. Refresh this page to analyze the data'
        ]
      });
    }
    
    console.log(`Processing CSV file: ${latestFile.name}`);
    
    // Parse the CSV file
    const darkPoolTrades = await parseDarkPoolTrades(latestFile.path);
    
    if (darkPoolTrades.length === 0) {
      return res.status(200).json({
        date: currentDate,
        trades: [],
        total_tickers: 0,
        last_updated: new Date().toISOString(),
        message: 'No dark pool trades found in the CSV file',
        file_processed: latestFile.name
      });
    }
    
    // Group trades by ticker
    const groupedTrades = groupTradesByTicker(darkPoolTrades);
    
    // Save to historical CSV if requested
    if (save === 'true') {
      try {
        await saveToHistoricalCSV(groupedTrades, currentDate);
        console.log(`Saved ${groupedTrades.length} tickers to historical CSV`);
      } catch (error) {
        console.error('Error saving to historical CSV:', error);
      }
    }
    
    return res.status(200).json({
      date: currentDate,
      trades: groupedTrades,
      total_tickers: groupedTrades.length,
      total_trades: darkPoolTrades.length,
      last_updated: new Date().toISOString(),
      file_processed: latestFile.name,
      file_date: latestFile.mtime.toISOString(),
      saved_to_history: save === 'true'
    });

  } catch (error) {
    console.error('Error processing CSV:', error);
    return res.status(500).json({ 
      error: 'Error processing CSV file',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please check the CSV file format'
    });
  }
}


