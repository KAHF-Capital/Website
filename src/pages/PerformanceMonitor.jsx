import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Footer from './Footer';
import PerformanceWindow from '../components/PerformanceWindow';
import { BarChart3, Plus, X, TrendingUp } from 'lucide-react';

export default function PerformanceMonitor() {
  const [tickers, setTickers] = useState([]);
  const [newTicker, setNewTicker] = useState('');
  const [showPerformanceWindow, setShowPerformanceWindow] = useState(false);

  // Load tickers from localStorage on component mount
  useEffect(() => {
    const savedTickers = localStorage.getItem('performance-monitor-tickers');
    if (savedTickers) {
      try {
        setTickers(JSON.parse(savedTickers));
      } catch (error) {
        console.error('Error loading saved tickers:', error);
      }
    }
  }, []);

  // Save tickers to localStorage whenever tickers change
  useEffect(() => {
    localStorage.setItem('performance-monitor-tickers', JSON.stringify(tickers));
  }, [tickers]);

  const addTicker = () => {
    const ticker = newTicker.trim().toUpperCase();
    if (ticker && !tickers.includes(ticker)) {
      setTickers([...tickers, ticker]);
      setNewTicker('');
    }
  };

  const removeTicker = (tickerToRemove) => {
    setTickers(tickers.filter(ticker => ticker !== tickerToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTicker();
    }
  };

  const openPerformanceWindow = () => {
    if (tickers.length > 0) {
      setShowPerformanceWindow(true);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-green-600" />
            <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">
              Performance Monitor
            </h2>
          </div>
          <p className="text-lg text-gray-600">
            Track real-time performance of your watchlist
          </p>
        </div>

        <div className="bg-gray-50 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Add Ticker Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Add Tickers to Monitor</h3>
              
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Enter ticker symbol (e.g., AAPL)"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <button
                  onClick={addTicker}
                  disabled={!newTicker.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </button>
              </div>

              <p className="text-sm text-gray-600">
                Press Enter or click Add to add a ticker to your watchlist
              </p>
            </div>

            {/* Ticker List */}
            {tickers.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Watchlist ({tickers.length} tickers)
                  </h3>
                  <button
                    onClick={openPerformanceWindow}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Open Performance Monitor
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {tickers.map((ticker) => (
                    <div
                      key={ticker}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200"
                    >
                      <span className="font-medium text-gray-900">{ticker}</span>
                      <button
                        onClick={() => removeTicker(ticker)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove ticker"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {tickers.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No tickers added yet</h3>
                <p className="text-gray-600 mb-6">
                  Add ticker symbols above to start monitoring their performance
                </p>
                <div className="text-sm text-gray-500">
                  <p>Example tickers: AAPL, MSFT, GOOGL, TSLA, AMZN</p>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h4 className="font-semibold text-green-800 mb-2">How to Use</h4>
              <div className="text-sm text-green-700 space-y-2">
                <p>• Add ticker symbols to create your watchlist</p>
                <p>• Click "Open Performance Monitor" to view real-time performance data</p>
                <p>• The performance window shows current prices, changes, and percentages</p>
                <p>• Data is cached for 2 minutes to improve performance</p>
                <p>• Your watchlist is automatically saved in your browser</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>

      {/* Performance Window */}
      <PerformanceWindow
        isOpen={showPerformanceWindow}
        onClose={() => setShowPerformanceWindow(false)}
        tickers={tickers}
      />
    </div>
  );
}
