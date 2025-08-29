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

const SafeDownload = () => {
  try {
    const { Download } = require("lucide-react");
    return <Download className="h-4 w-4" />;
  } catch (error) {
    return <span>📥</span>;
  }
};

// Dark Pool Summary Card Component
const DarkPoolSummaryCard = ({ summary }) => {
  const [showHistory, setShowHistory] = useState(false);
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

      <div className="text-center mb-3">
        <p className="text-2xl font-bold text-blue-600">{formatNumber(summary.total_volume)}</p>
        <p className="text-sm text-gray-600">Total Volume</p>
      </div>

      {/* 90-Day Average */}
      {summary.avg_90day_volume > 0 && (
        <div className="border-t pt-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">90-Day Avg:</span>
            <span className="font-medium">{formatNumber(summary.avg_90day_volume)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Volume Ratio:</span>
            <span className={`font-medium ${summary.volume_ratio > 2 ? 'text-green-600' : summary.volume_ratio > 1 ? 'text-yellow-600' : 'text-red-600'}`}>
              {summary.volume_ratio.toFixed(1)}x
            </span>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {showHistory ? 'Hide Details' : 'Show 90-Day History'}
          </button>
        </div>
      )}

      {/* 90-Day History Panel */}
      {showHistory && summary.avg_90day_volume > 0 && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">90-Day Dark Pool History</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Today's Volume:</span>
              <span className="font-medium">{formatNumber(summary.total_volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">90-Day Average:</span>
              <span className="font-medium">{formatNumber(summary.avg_90day_volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Today's Trades:</span>
              <span className="font-medium">{summary.trade_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">90-Day Avg Trades:</span>
              <span className="font-medium">{summary.avg_90day_trades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Volume vs Average:</span>
              <span className={`font-medium ${summary.volume_ratio > 2 ? 'text-green-600' : summary.volume_ratio > 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                {summary.volume_ratio > 1 ? '+' : ''}{((summary.volume_ratio - 1) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Info Modal Component with proper accessibility
const InfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
      role="dialog" 
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" role="document">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900" id="dialog-title">Dark Pool Scanner Info</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close dialog"
            >
              <SafeX />
            </button>
          </div>
          
          <div className="space-y-4" id="dialog-description">
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
                <li>• <strong>90-Day History:</strong> Compare today's activity to 90-day average</li>
                <li>• <strong>Midnight Reset:</strong> Data resets daily at midnight</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🔄 Manual Refresh</h3>
              <p className="text-gray-700 text-sm">
                The scanner refreshes data when you click the refresh button. Data resets at midnight each day.
                You can also manually refresh anytime to get the latest dark pool activity.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tip</h4>
              <p className="text-blue-800 text-sm">
                High dark pool volume often indicates institutional positioning and can be a leading indicator 
                for significant price movements in the near future. Volume ratios above 2x the 90-day average 
                suggest unusual institutional activity.
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
  const [showInfo, setShowInfo] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch dark pool data with 10-minute timeout
  const fetchDarkPoolData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const url = '/api/darkpool-trades';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
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
      if (error.name === 'AbortError') {
        setError('Request timed out after 10 minutes. Please try again.');
      } else {
        setError('Network error. Please check your connection and try again.');
      }
      setDarkPoolData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual refresh with 10-minute timeout
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout for refresh
      
      const response = await fetch('/api/darkpool-trades?refresh=true', { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (response.ok) {
        setDarkPoolData(data.trades || []);
        setLastUpdated(data.last_updated);
        setError(null);
      } else {
        setError(data.error || 'Unable to refresh dark pool data');
      }
    } catch (error) {
      console.error('Error refreshing dark pool data:', error);
      if (error.name === 'AbortError') {
        setError('Refresh timed out after 10 minutes. Please try again.');
      } else {
        setError('Network error during refresh. Please try again.');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Download CSV
  const downloadCSV = () => {
    if (!darkPoolData || darkPoolData.length === 0) return;

    const headers = ['Ticker', 'Total Volume', 'Trade Count', '90-Day Avg Volume', '90-Day Avg Trades', 'Volume Ratio', 'Date'];
    const csvContent = [
      headers.join(','),
      ...darkPoolData.map(item => [
        item.ticker,
        item.total_volume,
        item.trade_count,
        item.avg_90day_volume || 0,
        item.avg_90day_trades || 0,
        item.volume_ratio ? item.volume_ratio.toFixed(2) : 0,
        new Date().toISOString().split('T')[0]
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dark-pool-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Initial load
  useEffect(() => {
    fetchDarkPoolData();
  }, []);

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
              <p className="mt-1 text-gray-600">24-hour dark pool trading activity</p>
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
                onClick={downloadCSV}
                disabled={darkPoolData.length === 0}
                className="flex items-center space-x-1"
              >
                <SafeDownload />
                <span>Download CSV</span>
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Status Info */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="text-sm text-gray-500">
            {lastUpdated && `Last updated: ${new Date(lastUpdated).toLocaleString()}`}
          </div>
        </div>

        {/* Header */}
        {darkPoolData.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Top 25 Tickers by Dark Pool Volume
            </h2>
            <p className="text-gray-600 mt-1">
              Today's highest dark pool activity with 90-day historical comparison
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
              <SafeRefreshCw />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No dark pool activity found</h3>
            <p className="text-gray-600">
              No dark pool activity is currently detected. Check back later for new activity.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
