const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Data directory for CSV files
const DATA_DIR = path.join(process.cwd(), 'data');
const DAILY_CSV_DIR = path.join(DATA_DIR, 'daily');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DAILY_CSV_DIR)) {
    fs.mkdirSync(DAILY_CSV_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }
}

// Parse CSV file in chunks to prevent memory issues
function parseDarkPoolTradesChunked(csvFilePath) {
  return new Promise((resolve, reject) => {
    const dateMap = {};
    let rowCount = 0;
    const CHUNK_SIZE = 1000; // Process 1000 rows at a time
    let currentChunk = [];
    
    console.log(`Starting chunked processing: ${path.basename(csvFilePath)}`);
    
    const processChunk = () => {
      // Process current chunk
      currentChunk.forEach(row => {
        // Check if this is a dark pool trade
        if (row.exchange === '4' && row.trf_id && row.trf_id.trim() !== '') {
          const tradeDate = new Date(row.timestamp || row.t || new Date()).toISOString().split('T')[0];
          const ticker = (row.ticker || row.symbol || 'UNKNOWN').toUpperCase();
          
          if (!dateMap[tradeDate]) {
            dateMap[tradeDate] = {};
          }
          
          if (!dateMap[tradeDate][ticker]) {
            dateMap[tradeDate][ticker] = {
              ticker: ticker,
              total_volume: 0,
              trade_count: 0,
              avg_price: 0,
              total_value: 0,
              min_price: Infinity,
              max_price: 0
            };
          }
          
          const tickerData = dateMap[tradeDate][ticker];
          const volume = parseInt(row.size || row.volume || 0);
          const price = parseFloat(row.price || row.p || 0);
          
          tickerData.total_volume += volume;
          tickerData.trade_count += 1;
          tickerData.total_value += volume * price;
          tickerData.min_price = Math.min(tickerData.min_price, price);
          tickerData.max_price = Math.max(tickerData.max_price, price);
        }
      });
      
      // Clear chunk to free memory
      currentChunk = [];
    };
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        currentChunk.push(row);
        
        // Process chunk when it reaches the size limit
        if (currentChunk.length >= CHUNK_SIZE) {
          processChunk();
          
          // Log progress every 10,000 rows
          if (rowCount % 10000 === 0) {
            console.log(`Processed ${rowCount.toLocaleString()} rows from ${path.basename(csvFilePath)}`);
          }
        }
      })
      .on('end', () => {
        // Process remaining rows
        if (currentChunk.length > 0) {
          processChunk();
        }
        
        // Calculate averages and convert to arrays
        Object.keys(dateMap).forEach(date => {
          Object.keys(dateMap[date]).forEach(ticker => {
            const data = dateMap[date][ticker];
            data.avg_price = data.total_value / data.total_volume;
            data.min_price = data.min_price === Infinity ? 0 : data.min_price;
          });
          
          // Convert ticker objects to arrays and sort by volume
          dateMap[date] = Object.values(dateMap[date])
            .sort((a, b) => b.total_volume - a.total_volume);
        });
        
        console.log(`Completed chunked processing ${path.basename(csvFilePath)}: ${rowCount.toLocaleString()} total rows, ${Object.keys(dateMap).length} dates with dark pool trades`);
        resolve(dateMap);
      })
      .on('error', (error) => {
        console.error(`Error processing ${path.basename(csvFilePath)}:`, error);
        reject(error);
      });
  });
}

// Save processed data to JSON files
function saveProcessedData(dateMap, sourceFile) {
  const summary = {
    source_file: path.basename(sourceFile),
    processed_at: new Date().toISOString(),
    total_dates: Object.keys(dateMap).length,
    total_tickers: Object.values(dateMap).reduce((sum, tickers) => sum + tickers.length, 0),
    total_trades: Object.values(dateMap).reduce((sum, tickers) => 
      sum + tickers.reduce((tickerSum, ticker) => tickerSum + ticker.trade_count, 0), 0),
    total_volume: Object.values(dateMap).reduce((sum, tickers) => 
      sum + tickers.reduce((tickerSum, ticker) => tickerSum + ticker.total_volume, 0), 0),
    dates: Object.keys(dateMap).sort()
  };
  
  // Save summary
  const summaryPath = path.join(PROCESSED_DIR, `${path.basename(sourceFile, '.csv')}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  // Save detailed data for each date
  Object.keys(dateMap).forEach(date => {
    const datePath = path.join(PROCESSED_DIR, `${date}_${path.basename(sourceFile, '.csv')}.json`);
    const dateData = {
      date: date,
      source_file: path.basename(sourceFile),
      processed_at: new Date().toISOString(),
      total_tickers: dateMap[date].length,
      total_trades: dateMap[date].reduce((sum, ticker) => sum + ticker.trade_count, 0),
      total_volume: dateMap[date].reduce((sum, ticker) => sum + ticker.total_volume, 0),
      tickers: dateMap[date]
    };
    fs.writeFileSync(datePath, JSON.stringify(dateData, null, 2));
  });
  
  return summary;
}

// Get all CSV files in the daily directory
function getAllCSVFiles() {
  const files = fs.readdirSync(DAILY_CSV_DIR)
    .filter(file => file.endsWith('.csv'))
    .map(file => ({
      name: file,
      path: path.join(DAILY_CSV_DIR, file),
      size: fs.statSync(path.join(DAILY_CSV_DIR, file)).size
    }))
    .sort((a, b) => a.size - b.size); // Process smaller files first
  
  return files;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    ensureDirectories();
    
    const { file = 'all' } = req.body;
    const csvFiles = getAllCSVFiles();
    
    if (csvFiles.length === 0) {
      return res.status(404).json({
        error: 'No CSV files found',
        message: `Please upload CSV files to the ${DAILY_CSV_DIR} directory`
      });
    }
    
    console.log(`Found ${csvFiles.length} CSV files to process`);
    
    const results = [];
    
    // Process files
    for (const csvFile of csvFiles) {
      if (file !== 'all' && csvFile.name !== file) {
        continue;
      }
      
      console.log(`Processing file: ${csvFile.name} (${(csvFile.size / 1024 / 1024).toFixed(2)} MB)`);
      
      try {
        // Parse dark pool trades with chunked processing
        const dateMap = await parseDarkPoolTradesChunked(csvFile.path);
        
        if (Object.keys(dateMap).length === 0) {
          console.log(`No dark pool trades found in ${csvFile.name}`);
          results.push({
            file: csvFile.name,
            status: 'completed',
            message: 'No dark pool trades found',
            trades_found: 0
          });
          continue;
        }
        
        // Save processed data
        const summary = saveProcessedData(dateMap, csvFile.name);
        
        const totalTrades = Object.values(dateMap).reduce((sum, tickers) => 
          sum + tickers.reduce((tickerSum, ticker) => tickerSum + ticker.trade_count, 0), 0);
        
        results.push({
          file: csvFile.name,
          status: 'completed',
          trades_found: totalTrades,
          dates_processed: Object.keys(dateMap).length,
          total_tickers: summary.total_tickers,
          total_volume: summary.total_volume,
          summary: summary
        });
        
        console.log(`Successfully processed ${csvFile.name}: ${totalTrades} dark pool trades across ${Object.keys(dateMap).length} dates`);
        
      } catch (error) {
        console.error(`Error processing ${csvFile.name}:`, error);
        results.push({
          file: csvFile.name,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return res.status(200).json({
      message: 'CSV processing completed',
      files_processed: results.length,
      results: results,
      processed_files_location: PROCESSED_DIR
    });

  } catch (error) {
    console.error('Error in CSV processing:', error);
    return res.status(500).json({ 
      error: 'Error processing CSV files',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
