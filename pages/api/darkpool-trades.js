const fs = require('fs');
const path = require('path');

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

// Get the latest processed data
function getLatestProcessedData() {
  try {
    const files = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json') && file.includes('summary'))
      .map(file => ({
        name: file,
        path: path.join(PROCESSED_DIR, file),
        mtime: fs.statSync(path.join(PROCESSED_DIR, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      return null;
    }

    const latestFile = files[0];
    const data = JSON.parse(fs.readFileSync(latestFile.path, 'utf8'));
    
    // Get the corresponding date-specific files
    const dateFiles = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json') && !file.includes('summary'))
      .filter(file => file.includes(data.source_file.replace('.csv', '')))
      .map(file => {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        return {
          date: dateMatch ? dateMatch[1] : null,
          path: path.join(PROCESSED_DIR, file)
        };
      })
      .filter(file => file.date)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Load the most recent date's data
    if (dateFiles.length > 0) {
      const latestDateFile = dateFiles[0];
      const dateData = JSON.parse(fs.readFileSync(latestDateFile.path, 'utf8'));
      return {
        date: latestDateFile.date,
        trades: dateData.tickers || [],
        total_tickers: dateData.total_tickers || 0,
        total_trades: dateData.total_trades || 0,
        last_updated: dateData.processed_at || new Date().toISOString(),
        source_file: dateData.source_file || latestFile.name
      };
    }

    return null;
  } catch (error) {
    console.error('Error reading processed data:', error);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    ensureDirectories();
    
    const latestData = getLatestProcessedData();
    
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


