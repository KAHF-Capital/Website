import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, BarChart3, Calendar } from 'lucide-react';

const DarkPoolAnalysis = ({ isOpen, onClose, ticker }) => {
  const [historicalData, setHistoricalData] = useState([]);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && ticker) {
      fetchData();
    }
  }, [isOpen, ticker]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [historyResponse, priceResponse] = await Promise.all([
        fetch(`/api/dark-pool-history?ticker=${ticker}`),
        fetch(`/api/stock-price-change?ticker=${ticker}`)
      ]);

      if (!historyResponse.ok || !priceResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const [historyData, priceData] = await Promise.all([
        historyResponse.json(),
        priceResponse.json()
      ]);

      setHistoricalData(historyData.data || []);
      setPriceData(priceData);
    } catch (error) {
      setError('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatValue = (num) => {
    return new Intl.NumberFormat().format(Math.round(num / 1000) * 1000);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Dark Pool Analysis - {ticker}</h2>
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
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading data...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-6">
              {/* Today's Price Change */}
              {priceData && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-green-600" />
                    Today's Price Change
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Current Price</p>
                      <p className="text-xl font-bold text-gray-900">{formatPrice(priceData.currentPrice)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Previous Close</p>
                      <p className="text-xl font-bold text-gray-900">{formatPrice(priceData.previousClose)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Change</p>
                      <p className={`text-xl font-bold flex items-center justify-center ${
                        priceData.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {priceData.change >= 0 ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                        {formatChange(priceData.change)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Change %</p>
                      <p className={`text-xl font-bold ${
                        priceData.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatChangePercent(priceData.changePercent)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Dark Pool Volume Chart */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
                  Historical Dark Pool Volume ({historicalData.length} days)
                </h3>
                
                {historicalData.length > 0 ? (
                  <div className="space-y-4">
                    {/* Simple line chart representation */}
                    <div className="h-64 bg-gray-50 rounded-lg p-4 flex items-end justify-between space-x-1">
                      {historicalData.map((day, index) => {
                        const maxVolume = Math.max(...historicalData.map(d => d.total_volume));
                        const height = (day.total_volume / maxVolume) * 200; // Max height of 200px
                        
                        return (
                          <div key={day.date} className="flex flex-col items-center flex-1">
                            <div
                              className="bg-green-600 w-full rounded-t transition-all duration-300 hover:bg-green-700"
                              style={{ height: `${height}px` }}
                              title={`${formatDate(day.date)}: ${formatNumber(day.total_volume)} volume`}
                            ></div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Data table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Price</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {historicalData.slice(-10).reverse().map((day) => (
                            <tr key={day.date} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {formatDate(day.date)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatNumber(day.total_volume)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatNumber(day.trade_count)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatPrice(day.avg_price)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${formatValue(day.total_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No historical dark pool data available for {ticker}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {historicalData.length > 0 && (
              <span>
                Showing {historicalData.length} days of dark pool data for {ticker}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarkPoolAnalysis;

