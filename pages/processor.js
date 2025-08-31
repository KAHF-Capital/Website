import { useState, useEffect } from 'react';

// Safe icon components
const SafePlay = () => {
  try {
    const { Play } = require("lucide-react");
    return <Play className="h-4 w-4" />;
  } catch (error) {
    return <span>▶️</span>;
  }
};

const SafeFileText = () => {
  try {
    const { FileText } = require("lucide-react");
    return <FileText className="h-4 w-4" />;
  } catch (error) {
    return <span>📄</span>;
  }
};

const SafeCalendar = () => {
  try {
    const { Calendar } = require("lucide-react");
    return <Calendar className="h-4 w-4" />;
  } catch (error) {
    return <span>📅</span>;
  }
};

const SafeBarChart3 = () => {
  try {
    const { BarChart3 } = require("lucide-react");
    return <BarChart3 className="h-4 w-4" />;
  } catch (error) {
    return <span>📊</span>;
  }
};

export default function Processor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [dateData, setDateData] = useState(null);
  const [error, setError] = useState(null);

  // Load available dates
  useEffect(() => {
    loadAvailableDates();
  }, []);

  const loadAvailableDates = async () => {
    try {
      const response = await fetch('/api/darkpool-by-date');
      const data = await response.json();
      
      if (response.ok) {
        setAvailableDates(data.available_dates || []);
      }
    } catch (error) {
      console.error('Error loading dates:', error);
    }
  };

  const processAllCSV = async () => {
    setIsProcessing(true);
    setError(null);
    setProcessingResults(null);

    try {
      const response = await fetch('/api/process-all-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: 'all' }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setProcessingResults(data);
        // Reload available dates after processing
        setTimeout(loadAvailableDates, 1000);
      } else {
        setError(data.error || 'Processing failed');
      }
    } catch (error) {
      setError('Network error during processing');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadDateData = async (date) => {
    if (!date) return;
    
    try {
      const response = await fetch(`/api/darkpool-by-date?date=${date}`);
      const data = await response.json();
      
      if (response.ok) {
        setDateData(data);
      } else {
        setError(data.error || 'Failed to load date data');
      }
    } catch (error) {
      setError('Network error loading date data');
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CSV Processor</h1>
          <p className="mt-2 text-gray-600">Process all CSV files and view dark pool data by date</p>
        </div>

        {/* Processing Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Process CSV Files</h2>
              <p className="text-sm text-gray-600">Scan all CSV files for dark pool trades with unlimited processing time</p>
            </div>
            <button
              onClick={processAllCSV}
              disabled={isProcessing}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SafePlay size={16} />
              <span>{isProcessing ? 'Processing...' : 'Process All Files'}</span>
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {isProcessing && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">
                Processing CSV files... This may take a while for large files. Check the terminal for progress.
              </p>
            </div>
          )}

          {processingResults && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="text-green-800 font-semibold mb-2">Processing Complete!</h3>
              <div className="space-y-2 text-sm text-green-700">
                <p>Files processed: {processingResults.files_processed}</p>
                <p>Results saved to: {processingResults.processed_files_location}</p>
                {processingResults.results && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">File Results:</h4>
                    <div className="space-y-2">
                      {processingResults.results.map((result, index) => (
                        <div key={index} className="bg-white rounded p-3">
                          <p className="font-medium">{result.file}</p>
                          <p className="text-xs">Status: {result.status}</p>
                          {result.trades_found && (
                            <p className="text-xs">Dark pool trades: {formatNumber(result.trades_found)}</p>
                          )}
                          {result.dates_processed && (
                            <p className="text-xs">Dates: {result.dates_processed}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <SafeCalendar size={20} className="text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">View Data by Date</h2>
          </div>

          <div className="flex items-center space-x-4 mb-4">
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a date</option>
              {availableDates.map((date) => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
            <button
              onClick={() => loadDateData(selectedDate)}
              disabled={!selectedDate}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Load Data
            </button>
          </div>

          {dateData && (
            <div className="space-y-4">
              {dateData.data.map((fileData, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {fileData.date} - {fileData.source_file}
                    </h3>
                    <div className="text-sm text-gray-600">
                      {formatNumber(fileData.total_tickers)} tickers, {formatNumber(fileData.total_trades)} trades
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fileData.tickers.slice(0, 12).map((ticker, tickerIndex) => (
                      <div key={tickerIndex} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900">{ticker.ticker}</span>
                          <span className="text-sm text-gray-600">{ticker.trade_count} trades</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Volume:</span>
                            <span className="font-medium">{formatNumber(ticker.total_volume)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Avg Price:</span>
                            <span className="font-medium">${ticker.avg_price.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Value:</span>
                            <span className="font-medium">${formatNumber(ticker.total_value)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {fileData.tickers.length > 12 && (
                    <p className="text-sm text-gray-600 mt-4">
                      Showing top 12 of {fileData.tickers.length} tickers
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
