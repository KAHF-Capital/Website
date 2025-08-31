import React, { useState, useEffect } from 'react';

// Safe icon components
const SafeRefreshCw = () => {
  try {
    const { RefreshCw } = require("lucide-react");
    return <RefreshCw className="h-4 w-4" />;
  } catch (error) {
    return <span>🔄</span>;
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

const SafeTrendingUp = () => {
  try {
    const { TrendingUp } = require("lucide-react");
    return <TrendingUp className="h-4 w-4" />;
  } catch (error) {
    return <span>📈</span>;
  }
};

export default function Scanner() {
  const [darkPoolData, setDarkPoolData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDarkPoolData();
  }, []);

  const loadDarkPoolData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/darkpool-trades');
      const data = await response.json();

      if (response.ok) {
        setDarkPoolData(data);
      } else {
        setError(data.error || 'Failed to load dark pool data');
      }
    } catch (error) {
      console.error('Error fetching dark pool data:', error);
      setError('Network error fetching data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadDarkPoolData();
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatValue = (num) => {
    // Remove last 3 decimal points and format
    return new Intl.NumberFormat().format(Math.round(num / 1000) * 1000);
  };

  const DarkPoolSummaryCard = ({ ticker }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{ticker.ticker}</h3>
        <span className="text-sm text-gray-600">{ticker.trade_count} trades</span>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Today's Volume:</span>
          <span className="font-semibold text-gray-900">{formatNumber(ticker.total_volume)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">7-Day Avg:</span>
          <span className="font-medium text-gray-700">{formatNumber(ticker.avg_7day_volume)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Avg Price:</span>
          <span className="font-medium text-gray-900">${ticker.avg_price.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total Value:</span>
          <span className="font-medium text-gray-900">${formatValue(ticker.total_value)}</span>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Data</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dark Pool Scanner</h1>
              <p className="mt-1 text-gray-600">
                Latest trading day: {darkPoolData ? new Date(darkPoolData.date).toLocaleDateString() : 'Loading...'}
              </p>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SafeRefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <SafeRefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading dark pool data...</p>
            </div>
          </div>
        )}

        {/* Data Display */}
        {!isLoading && darkPoolData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {new Date(darkPoolData.date).toLocaleDateString()} - Dark Pool Activity
                </h2>
                <p className="text-gray-600 mt-1">
                  {formatNumber(darkPoolData.total_tickers)} tickers, {formatNumber(darkPoolData.total_volume)} total volume
                </p>
              </div>
              
              <div className="flex items-center space-x-2 text-blue-600">
                <SafeBarChart3 className="h-6 w-6" />
                <span className="font-semibold">Top by Volume</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {darkPoolData.tickers.map((ticker, index) => (
                <DarkPoolSummaryCard key={ticker.ticker || index} ticker={ticker} />
              ))}
            </div>

            {darkPoolData.tickers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No dark pool activity found for this date.</p>
              </div>
            )}
          </div>
        )}

        {/* No Data State */}
        {!isLoading && !darkPoolData && (
          <div className="text-center py-12">
            <SafeBarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
            <p className="text-gray-600">Please process CSV files first using the command line processor.</p>
          </div>
        )}
      </div>
    </div>
  );
}
