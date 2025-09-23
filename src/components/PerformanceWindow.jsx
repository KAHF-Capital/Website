import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';

const PerformanceWindow = ({ isOpen, onClose, tickers = [] }) => {
  const [performanceData, setPerformanceData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  // Fetch performance data for all tickers using batch API
  const fetchPerformanceData = async () => {
    if (!tickers || tickers.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Use the new batch performance API
      const response = await fetch('/api/batch-performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickers: tickers
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert array results to object format for easier access
      const results = {};
      data.data.forEach(item => {
        if (!item.error) {
          results[item.ticker] = {
            currentPrice: item.currentPrice,
            previousClose: item.previousClose,
            change: item.change,
            changePercent: item.changePercent
          };
        }
      });

      setPerformanceData(results);
      setProgress(100);
    } catch (error) {
      setError('Failed to fetch performance data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when window opens and tickers are provided
  useEffect(() => {
    if (isOpen && tickers.length > 0) {
      fetchPerformanceData();
    }
  }, [isOpen, tickers]);

  if (!isOpen) return null;

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatPrice = (price) => {
    return price ? `$${price.toFixed(2)}` : 'N/A';
  };

  const formatChange = (change) => {
    if (change === null || change === undefined) return 'N/A';
    return change >= 0 ? `+$${change.toFixed(2)}` : `$${change.toFixed(2)}`;
  };

  const formatChangePercent = (percent) => {
    if (percent === null || percent === undefined) return 'N/A';
    return percent >= 0 ? `+${percent.toFixed(2)}%` : `${percent.toFixed(2)}%`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Performance Monitor</h2>
            <span className="text-sm text-gray-500">({tickers.length} tickers)</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Loading performance data...</span>
                <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
              <button
                onClick={fetchPerformanceData}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && Object.keys(performanceData).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickers.map((ticker) => {
                const data = performanceData[ticker];
                if (!data) return null;

                const isPositive = data.change >= 0;
                const isNegative = data.change < 0;

                return (
                  <div key={ticker} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">{ticker}</h3>
                      <div className="flex items-center space-x-1">
                        {isPositive && <TrendingUp className="h-4 w-4 text-green-600" />}
                        {isNegative && <TrendingDown className="h-4 w-4 text-red-600" />}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Current Price:</span>
                        <span className="font-semibold text-gray-900">{formatPrice(data.currentPrice)}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Previous Close:</span>
                        <span className="text-gray-700">{formatPrice(data.previousClose)}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Change:</span>
                        <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {formatChange(data.change)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Change %:</span>
                        <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {formatChangePercent(data.changePercent)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && Object.keys(performanceData).length === 0 && (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No performance data available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {Object.keys(performanceData).length > 0 && (
              <span>
                Showing performance for {Object.keys(performanceData).length} of {tickers.length} tickers
              </span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={fetchPerformanceData}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceWindow;
