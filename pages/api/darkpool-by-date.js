import { listDataFiles, getDataFile } from '../../lib/blob-data';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { date, source_file } = req.query;

    const allFiles = await listDataFiles();

    if (allFiles.length === 0) {
      return res.status(404).json({
        error: 'No processed data found',
        message: 'Please run the CSV processor first'
      });
    }
    
    if (date) {
      const dateFiles = allFiles.filter(f => f.filename.startsWith(date));
      
      if (dateFiles.length === 0) {
        return res.status(404).json({
          error: 'No data found for date',
          date: date,
          message: 'No processed data found for this date'
        });
      }
      
      const targetFiles = source_file 
        ? dateFiles.filter(f => f.filename.includes(source_file))
        : dateFiles;
      
      if (targetFiles.length === 0) {
        return res.status(404).json({
          error: 'No data found',
          date: date,
          source_file: source_file,
          message: 'No data found for the specified date and source file'
        });
      }
      
      const data = [];
      for (const file of targetFiles) {
        const fileData = await getDataFile(file.url);
        if (fileData) data.push(fileData);
      }
      
      return res.status(200).json({
        date: date,
        source_file: source_file || 'all',
        files_loaded: targetFiles.length,
        data: data
      });
    }
    
    const dates = [...new Set(allFiles.map(f => f.filename.split('_')[0].replace('.json', '')))].sort();
    const sourceFiles = [...new Set(allFiles.map(f => {
      const parts = f.filename.split('_');
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
