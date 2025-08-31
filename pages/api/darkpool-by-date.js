const fs = require('fs');
const path = require('path');

// Data directory for processed files
const DATA_DIR = path.join(process.cwd(), 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { date, source_file } = req.query;
    
    if (!fs.existsSync(PROCESSED_DIR)) {
      return res.status(404).json({
        error: 'No processed data found',
        message: 'Please run the CSV processor first'
      });
    }
    
    // If specific date is requested
    if (date) {
      const dateFiles = fs.readdirSync(PROCESSED_DIR)
        .filter(file => file.startsWith(date) && file.endsWith('.json'))
        .sort();
      
      if (dateFiles.length === 0) {
        return res.status(404).json({
          error: 'No data found for date',
          date: date,
          message: 'No processed data found for this date'
        });
      }
      
      // If source file is specified, filter by it
      const targetFiles = source_file 
        ? dateFiles.filter(file => file.includes(source_file))
        : dateFiles;
      
      if (targetFiles.length === 0) {
        return res.status(404).json({
          error: 'No data found',
          date: date,
          source_file: source_file,
          message: 'No data found for the specified date and source file'
        });
      }
      
      // Load the data
      const data = [];
      for (const file of targetFiles) {
        const filePath = path.join(PROCESSED_DIR, file);
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.push(fileData);
      }
      
      return res.status(200).json({
        date: date,
        source_file: source_file || 'all',
        files_loaded: targetFiles.length,
        data: data
      });
    }
    
    // If no specific date, return available dates
    const allFiles = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json'))
      .filter(file => !file.includes('_summary.json')); // Exclude summary files
    
    const dates = [...new Set(allFiles.map(file => file.split('_')[0]))].sort();
    const sourceFiles = [...new Set(allFiles.map(file => {
      const parts = file.split('_');
      return parts.slice(1).join('_').replace('.json', '');
    }))].sort();
    
    return res.status(200).json({
      available_dates: dates,
      available_source_files: sourceFiles,
      total_files: allFiles.length,
      message: 'Use ?date=YYYY-MM-DD to get data for a specific date'
    });

  } catch (error) {
    console.error('Error loading processed data:', error);
    return res.status(500).json({ 
      error: 'Error loading processed data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
