import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Footer from './Footer';
import Header from '../components/Header';
import { Info, Bell, Zap } from 'lucide-react';

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
  const [sortBy, setSortBy] = useState('volume_ratio'); // Default sort
  const [showScannerInfo, setShowScannerInfo] = useState(false);

  useEffect(() => {
    loadDarkPoolData();
  }, [sortBy]);

  const loadDarkPoolData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/darkpool-trades');
      const data = await response.json();

      if (response.ok) {
        // Apply sorting based on current sortBy state (data is already filtered on backend)
        const enhancedData = {
          ...data,
          tickers: [...data.tickers].sort((a, b) => {
            switch (sortBy) {
              case 'total_value':
                return b.total_value - a.total_value;
              case 'avg_price':
                return b.avg_price - a.avg_price;
              case 'volume_ratio':
              default:
                // Sort by volume ratio (highest first), fallback to volume if ratio is N/A
                if (a.volume_ratio === 'N/A' && b.volume_ratio === 'N/A') {
                  return b.total_volume - a.total_volume;
                }
                if (a.volume_ratio === 'N/A') return 1;
                if (b.volume_ratio === 'N/A') return -1;
                return parseFloat(b.volume_ratio) - parseFloat(a.volume_ratio);
            }
          })
        };
        
        setDarkPoolData(enhancedData);
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
    <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900">{ticker.ticker}</h4>
          <span className="text-sm text-gray-600">{ticker.trade_count} trades</span>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Volume Ratio:</span>
            <span className={`font-bold text-lg ${ticker.volume_ratio !== 'N/A' && parseFloat(ticker.volume_ratio) > 1 ? 'text-green-600' : 'text-gray-900'}`}>
              {ticker.volume_ratio !== 'N/A' ? `${ticker.volume_ratio}x` : 'N/A'}
            </span>
          </div>
          
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
          
          {/* Performance Data */}
          {ticker.performance && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Today's Change:</span>
              <span className={`font-semibold ${ticker.performance.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {ticker.performance.change >= 0 ? '+' : ''}${ticker.performance.change.toFixed(2)} ({ticker.performance.changePercent >= 0 ? '+' : ''}{ticker.performance.changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link href={`/straddle-calculator?ticker=${ticker.ticker}`}>
            <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Analyze {ticker.ticker} Straddle
            </button>
          </Link>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <Header />

        <div className="bg-gray-50 py-12 px-4">
          <div className="max-w-6xl mx-auto text-center">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Data</h2>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 touch-manipulation"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
          

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">Dark Pool Scanner</h2>
              <button
                onClick={() => setShowScannerInfo(!showScannerInfo)}
                className="p-2 text-gray-500 hover:text-green-600 transition-colors"
                title="How it works"
              >
                <Info className="h-6 w-6" />
              </button>
            </div>
            <p className="text-lg text-gray-600">Institutional-grade dark pool analytics</p>
            
            {/* VolAlert Pro CTA */}
            <div className="mt-6 mb-6 p-6 bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <h3 className="text-xl font-bold text-green-800 mb-2">Get Real-Time SMS Alerts</h3>
                  <p className="text-green-700">Never miss dark pool activity again. Subscribe to VolAlert Pro for instant notifications.</p>
                </div>
                <a 
                  href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center">
                    <Bell className="mr-2 h-5 w-5" />
                    Subscribe to VolAlert Pro
                    <Zap className="ml-2 h-5 w-5" />
                  </button>
                </a>
              </div>
            </div>
            
            {showScannerInfo && (
              <div className="mt-4 max-w-2xl bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">How the Dark Pool Scanner Works:</h3>
                <div className="text-sm text-green-700 space-y-2">
                  <p><strong>What are Dark Pools?</strong> Private exchanges where large institutions trade stocks away from public markets, often to avoid price impact.</p>
                  <p><strong>Volume Ratio:</strong> Compares today's dark pool volume to the 7-day average. Higher ratios indicate unusual institutional activity.</p>
                  <p><strong>Filters:</strong> Automatically shows only high-quality stocks with over $250M trading value and $50+ price for faster loading and better focus.</p>
                  <p><strong>Why It Matters:</strong> Large dark pool activity can signal institutional buying/selling before it becomes public, potentially indicating future price movements.</p>
                  <p><strong>Data Source:</strong> Analyzes daily dark pool trading data identified from Securities Information Processors (SIPs).</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-gray-50 py-12 px-4">
            <div className="max-w-6xl mx-auto text-center">
              <SafeRefreshCw className="h-8 w-8 text-green-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading dark pool data...</p>
            </div>
          </div>
        )}

        {/* Data Display */}
        {!isLoading && darkPoolData && (
          <div className="bg-gray-50 py-12 px-4">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  {new Date(darkPoolData.date + 'T00:00:00').toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'numeric', 
                    day: 'numeric' 
                  })} - Dark Pool Activity
                </h3>
                <p className="text-base text-gray-600 max-w-2xl mx-auto">
                  {formatNumber(darkPoolData.tickers.length)} tickers, {formatNumber(darkPoolData.total_volume)} total volume
                </p>
              </div>
              
              {/* Sort Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="volume_ratio">Volume Ratio</option>
                    <option value="total_value">Total Value</option>
                    <option value="avg_price">Price</option>
                  </select>
                </div>
                
                <div className="flex items-center space-x-2 text-green-600">
                  <SafeTrendingUp className="h-5 w-5" />
                  <span className="text-sm font-semibold">Highest First</span>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    Showing stocks with <span className="font-semibold text-green-600">&gt;$250M</span> trading value and <span className="font-semibold text-green-600">&gt;$50</span> price
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
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
          </div>
        )}

        {/* No Data State */}
        {!isLoading && !darkPoolData && (
          <div className="bg-gray-50 py-12 px-4">
            <div className="max-w-6xl mx-auto text-center">
              <SafeBarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
              <p className="text-gray-600">Please process CSV files first using the command line processor.</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
