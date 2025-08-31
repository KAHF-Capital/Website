const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Data directory for CSV files
const DATA_DIR = path.join(process.cwd(), 'data');
const DAILY_CSV_DIR = path.join(DATA_DIR, 'daily');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const PROCESSED_TRACKER_FILE = path.join(DATA_DIR, 'processed_files.json');

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

// Load processed files tracker
function loadProcessedTracker() {
  if (fs.existsSync(PROCESSED_TRACKER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROCESSED_TRACKER_FILE, 'utf8'));
    } catch (error) {
      console.log('Error loading processed tracker, starting fresh');
      return {};
    }
  }
  return {};
}

// Save processed files tracker
function saveProcessedTracker(tracker) {
  fs.writeFileSync(PROCESSED_TRACKER_FILE, JSON.stringify(tracker, null, 2));
}

// Get file hash for tracking changes
function getFileHash(filePath) {
  const stats = fs.statSync(filePath);
  return `${stats.size}_${stats.mtime.getTime()}`;
}

// Check if file needs processing
function needsProcessing(filePath, tracker) {
  const fileName = path.basename(filePath);
  const fileHash = getFileHash(filePath);
  
  if (!tracker[fileName]) {
    return { needsProcessing: true, reason: 'New file' };
  }
  
  if (tracker[fileName].hash !== fileHash) {
    return { needsProcessing: true, reason: 'File modified' };
  }
  
  return { needsProcessing: false, reason: 'Already processed' };
}

// Parse CSV file in chunks to prevent memory issues
function parseDarkPoolTradesChunked(csvFilePath) {
  return new Promise((resolve, reject) => {
    const dateMap = {};
    let rowCount = 0;
    const CHUNK_SIZE = 500; // Smaller chunks for better memory management
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
          
          // Log progress every 5,000 rows
          if (rowCount % 5000 === 0) {
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

// Main processing function
async function processAllCSV(forceReprocess = false) {
  try {
    ensureDirectories();
    
    const csvFiles = getAllCSVFiles();
    const tracker = loadProcessedTracker();
    
    if (csvFiles.length === 0) {
      console.log('No CSV files found in data/daily/ directory');
      return;
    }
    
    console.log(`Found ${csvFiles.length} CSV files to check`);
    
    const results = [];
    let filesToProcess = [];
    
    // Check which files need processing
    csvFiles.forEach(csvFile => {
      const check = needsProcessing(csvFile.path, tracker);
      
      if (forceReprocess || check.needsProcessing) {
        filesToProcess.push({ ...csvFile, reason: check.reason });
        console.log(`📋 ${csvFile.name}: ${check.reason}`);
      } else {
        console.log(`✅ ${csvFile.name}: Already processed (skipping)`);
      }
    });
    
    if (filesToProcess.length === 0) {
      console.log('\n🎉 All files are already processed! Use --force to reprocess.');
      return;
    }
    
    console.log(`\n🔄 Processing ${filesToProcess.length} files...`);
    
    // Process files
    for (const csvFile of filesToProcess) {
      console.log(`\nProcessing file: ${csvFile.name} (${(csvFile.size / 1024 / 1024).toFixed(2)} MB) - ${csvFile.reason}`);
      
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
          
          // Update tracker even for files with no dark pool trades
          tracker[csvFile.name] = {
            hash: getFileHash(csvFile.path),
            processed_at: new Date().toISOString(),
            status: 'no_dark_pool_trades'
          };
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
          total_volume: summary.total_volume
        });
        
        // Update tracker
        tracker[csvFile.name] = {
          hash: getFileHash(csvFile.path),
          processed_at: new Date().toISOString(),
          status: 'completed',
          trades_found: totalTrades,
          dates_processed: Object.keys(dateMap).length
        };
        
        console.log(`✅ Successfully processed ${csvFile.name}: ${totalTrades} dark pool trades across ${Object.keys(dateMap).length} dates`);
        
      } catch (error) {
        console.error(`❌ Error processing ${csvFile.name}:`, error.message);
        results.push({
          file: csvFile.name,
          status: 'error',
          error: error.message
        });
        
        // Update tracker with error status
        tracker[csvFile.name] = {
          hash: getFileHash(csvFile.path),
          processed_at: new Date().toISOString(),
          status: 'error',
          error: error.message
        };
      }
    }
    
    // Save updated tracker
    saveProcessedTracker(tracker);
    
    console.log('\n=== PROCESSING SUMMARY ===');
    console.log(`Files processed: ${results.length}`);
    console.log(`Results saved to: ${PROCESSED_DIR}`);
    console.log(`Tracker saved to: ${PROCESSED_TRACKER_FILE}`);
    
    results.forEach(result => {
      if (result.status === 'completed') {
        console.log(`✅ ${result.file}: ${result.trades_found} trades, ${result.dates_processed} dates`);
      } else {
        console.log(`❌ ${result.file}: ${result.error}`);
      }
    });

  } catch (error) {
    console.error('Error in CSV processing:', error);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const forceReprocess = args.includes('--force') || args.includes('-f');

// Run the processor if this script is executed directly
if (require.main === module) {
  console.log('🚀 Dark Pool CSV Processor');
  console.log('========================');
  
  if (forceReprocess) {
    console.log('⚠️  Force reprocess mode: Will reprocess all files');
  } else {
    console.log('📋 Smart mode: Will only process new or modified files');
  }
  
  console.log('');
  processAllCSV(forceReprocess);
}

module.exports = { processAllCSV };
