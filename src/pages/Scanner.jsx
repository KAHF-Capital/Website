import React, { useState, useEffect } from "react";

// Safe component imports with fallbacks
const SafeBadge = ({ children, variant = 'default', className = '', ...props }) => {
  try {
    const { Badge } = require("../components/ui/badge");
    return <Badge variant={variant} className={className} {...props}>{children}</Badge>;
  } catch (error) {
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`} {...props}>{children}</span>;
  }
};

const SafeButton = ({ children, variant = 'default', size = 'default', className = '', ...props }) => {
  try {
    const { Button } = require("../components/ui/button");
    return <Button variant={variant} size={size} className={className} {...props}>{children}</Button>;
  } catch (error) {
    return <button className={`inline-flex items-center justify-center rounded-md text-sm font-medium ${className}`} {...props}>{children}</button>;
  }
};

// Safe icon imports
const SafeSearch = () => {
  try {
    const { Search } = require("lucide-react");
    return <Search className="h-4 w-4" />;
  } catch (error) {
    return <span>🔍</span>;
  }
};

const SafeRefreshCw = () => {
  try {
    const { RefreshCw } = require("lucide-react");
    return <RefreshCw className="h-4 w-4" />;
  } catch (error) {
    return <span>🔄</span>;
  }
};

const SafeAlertTriangle = () => {
  try {
    const { AlertTriangle } = require("lucide-react");
    return <AlertTriangle className="h-4 w-4" />;
  } catch (error) {
    return <span>⚠️</span>;
  }
};

const SafeInfo = () => {
  try {
    const { Info } = require("lucide-react");
    return <Info className="h-4 w-4" />;
  } catch (error) {
    return <span>ℹ️</span>;
  }
};

const SafeX = () => {
  try {
    const { X } = require("lucide-react");
    return <X className="h-4 w-4" />;
  } catch (error) {
    return <span>✕</span>;
  }
};

const SafeClock = () => {
  try {
    const { Clock } = require("lucide-react");
    return <Clock className="h-4 w-4" />;
  } catch (error) {
    return <span>🕐</span>;
  }
};

// Dark Pool Summary Card Component
const DarkPoolSummaryCard = ({ summary }) => {
  const formatNumber = (num) => num?.toLocaleString() || '0';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{summary.ticker}</h3>
          <p className="text-sm text-gray-600">Today's Dark Pool Volume</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">{summary.trade_count} trades</div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-2xl font-bold text-blue-600">{formatNumber(summary.total_volume)}</p>
        <p className="text-sm text-gray-600">Total Volume</p>
      </div>
    </div>
  );
};

// Info Modal Component
const InfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Dark Pool Scanner Info</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🌊 What is Dark Pool Trading?</h3>
              <p className="text-gray-700 text-sm">
                Dark pools are private exchanges where institutional investors trade large blocks of shares 
                away from public markets. These trades are not visible to the public until after they're completed.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">📊 Data Details</h3>
              <ul className="text-gray-700 text-sm space-y-1">
                <li>• <strong>Daily Volume:</strong> Total dark pool volume for the current trading day</li>
                <li>• <strong>Trade Count:</strong> Number of individual dark pool trades</li>
                <li>• <strong>15-min delay:</strong> Data is delayed for regulatory compliance</li>
                <li>• <strong>Midnight Reset:</strong> Volume resets at midnight each day</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🔄 Auto-Refresh</h3>
              <p className="text-gray-700 text-sm">
                The scanner automatically refreshes every 30 minutes to show the latest dark pool trading activity.
                You can also manually refresh using the refresh button.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tip</h4>
              <p className="text-blue-800 text-sm">
                High dark pool volume often indicates institutional positioning and can be a leading indicator 
                for significant price movements in the near future.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Scanner() {
  const [darkPoolData, setDarkPoolData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch dark pool data
  const fetchDarkPoolData = async (ticker = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      let url = '/api/darkpool-trades';
      if (ticker) {
        url += `?ticker=${encodeURIComponent(ticker)}&refresh=true`;
      } else {
        // Always refresh when fetching top 25 to ensure we have data
        url += '?refresh=true';
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setDarkPoolData(data.trades || []);
        setLastUpdated(data.last_updated);
      } else {
        setError(data.error || 'Unable to load dark pool data');
        setDarkPoolData([]);
      }
    } catch (error) {
      console.error('Error fetching dark pool data:', error);
      setError('Network error. Please check your connection and try again.');
      setDarkPoolData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDarkPoolData(searchTerm);
    setIsRefreshing(false);
  };

  // Search for specific ticker
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      await fetchDarkPoolData();
    } else {
      await fetchDarkPoolData(searchTerm.trim().toUpperCase());
    }
  };

  // Auto-refresh every 30 minutes (reduced frequency to prevent timeouts)
  useEffect(() => {
    // Initial load with refresh to ensure we have data
    fetchDarkPoolData();
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing dark pool data...');
      fetchDarkPoolData();
    }, 30 * 60 * 1000); // 30 minutes instead of 15 to reduce API load

    return () => clearInterval(interval);
  }, []);

  // Handle search on Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dark pool scanner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dark Pool Scanner</h1>
              <p className="mt-1 text-gray-600">Real-time dark pool trading activity</p>
            </div>
            <div className="flex items-center space-x-3">
              <SafeBadge className="flex items-center space-x-1 bg-orange-100 text-orange-800 border-orange-200">
                <SafeClock />
                <span>15 min delayed</span>
              </SafeBadge>
              <SafeBadge variant="outline" className="flex items-center space-x-1">
                <span>{darkPoolData.length} Tickers</span>
              </SafeBadge>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={() => setShowInfo(true)}
                className="flex items-center space-x-1"
              >
                <SafeInfo />
                <span>Info</span>
              </SafeButton>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-1"
              >
                <SafeRefreshCw className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </SafeButton>
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <SafeAlertTriangle />
              <div className="flex-1 ml-3">
                <h3 className="text-sm font-medium text-red-800">Service Temporarily Unavailable</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <SafeButton
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="flex items-center space-x-1"
              >
                <SafeRefreshCw />
                <span>Retry</span>
              </SafeButton>
            </div>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Symbol Search */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <SafeSearch />
              </div>
              <input
                placeholder="Enter ticker (e.g., AAPL, TSLA)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm"
              />
            </div>

            {/* Search Button */}
            <SafeButton
              onClick={handleSearch}
              className="flex items-center space-x-2"
            >
              <SafeSearch />
              <span>Search Ticker</span>
            </SafeButton>

            {/* Clear Search */}
            {searchTerm && (
              <SafeButton
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  fetchDarkPoolData();
                }}
                className="flex items-center space-x-2"
              >
                <SafeX />
                <span>Clear Search</span>
              </SafeButton>
            )}
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div className="mt-4 text-sm text-gray-500">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}
        </div>

        {/* Search Results Header */}
        {searchTerm && darkPoolData.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Dark Pool Volume for {searchTerm.toUpperCase()}
            </h2>
            <p className="text-gray-600 mt-1">
              Today's total dark pool volume
            </p>
          </div>
        )}

        {/* Default View Header */}
        {!searchTerm && darkPoolData.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Top 25 Tickers by Dark Pool Volume
            </h2>
            <p className="text-gray-600 mt-1">
              Today's highest dark pool activity
            </p>
          </div>
        )}

        {/* Dark Pool Data Grid */}
        {!error && darkPoolData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {darkPoolData.map((item, index) => (
              <DarkPoolSummaryCard key={item.ticker || index} summary={item} />
            ))}
          </div>
        )}

        {/* No Data Message */}
        {!error && darkPoolData.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <SafeSearch />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No dark pool activity found</h3>
            <p className="text-gray-600">
              {searchTerm ? 
                `No dark pool trades found for ${searchTerm.toUpperCase()} today. This could mean no dark pool activity or the ticker may not be actively traded.` :
                'No dark pool activity is currently detected. Check back later for new activity.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
