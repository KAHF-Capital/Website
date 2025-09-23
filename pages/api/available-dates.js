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

export default async function handler(req, res) {
  try {
    ensureDirectories();
    
    // Get all date files (excluding summary files)
    const dateFiles = fs.readdirSync(PROCESSED_DIR)
      .filter(file => file.endsWith('.json') && !file.includes('summary'))
      .map(file => {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        return {
          date: dateMatch ? dateMatch[1] : null,
          filename: file
        };
      })
      .filter(file => file.date)
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending

    const availableDates = dateFiles.map(file => ({
      date: file.date,
      filename: file.filename,
      displayDate: new Date(file.date + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })
    }));

    return res.status(200).json({
      availableDates,
      totalDates: availableDates.length,
      latestDate: availableDates.length > 0 ? availableDates[0].date : null
    });

  } catch (error) {
    console.error('Error in available-dates API:', error);
    return res.status(500).json({
      error: 'Error loading available dates',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
