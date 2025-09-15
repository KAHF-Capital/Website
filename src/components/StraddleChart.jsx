import React from 'react';
import { TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react';

const StraddleChart = ({ results, breakevens }) => {
  if (!results || !breakevens) return null;

  const { aboveUpper, belowLower, totalSamples, profitableRate } = results;
  const { upperPct, lowerPct } = breakevens;

  // Calculate chart data
  const profitableMoves = aboveUpper + belowLower;
  const unprofitableMoves = totalSamples - profitableMoves;
  
  const maxValue = Math.max(profitableMoves, unprofitableMoves, aboveUpper, belowLower);
  const scale = maxValue > 0 ? 100 / maxValue : 0;

  // Check if we have valid breakeven data
  const hasValidBreakevens = breakevens && breakevens.upper > 0 && breakevens.lower > 0;

  // Format numbers for better readability
  const formatPercentage = (value) => {
    if (Math.abs(value) >= 100) {
      return value.toFixed(0);
    } else if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    } else {
      return value.toFixed(2);
    }
  };

  const formatNumber = (value) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
        <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Performance Visualization</h3>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
        
        {/* Overall Profitability Chart */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-700 flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" />
            Overall Profitability
          </h4>
          
          <div className="space-y-4">
            {/* Profitable Moves */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="font-medium">Profitable Moves</span>
                <span className="font-semibold text-green-600">
                  {formatNumber(profitableMoves)} ({formatPercentage(profitableRate)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(profitableMoves / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Unprofitable Moves */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="font-medium">Unprofitable Moves</span>
                <span className="font-semibold text-red-600">
                  {formatNumber(unprofitableMoves)} ({formatPercentage(100 - profitableRate)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(unprofitableMoves / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-6">
            <div className="bg-green-50 rounded-lg p-3 sm:p-4 text-center border border-green-200">
              <div className="text-xl sm:text-2xl font-bold text-green-600">{formatPercentage(profitableRate)}%</div>
              <div className="text-xs sm:text-sm text-green-700 font-medium">Success Rate</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4 text-center border border-blue-200">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">{formatNumber(totalSamples)}</div>
              <div className="text-xs sm:text-sm text-blue-700 font-medium">Total Samples</div>
            </div>
          </div>
        </div>

        {/* Breakeven Analysis Chart */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-700 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Breakeven Analysis
          </h4>
          
          <div className="space-y-4">
            {/* Above Upper Breakeven */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="font-medium">Above Upper (+{formatPercentage(upperPct)}%)</span>
                <span className="font-semibold text-green-600">{formatNumber(aboveUpper)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(aboveUpper / totalSamples) * 100}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Stock moved up {formatPercentage(upperPct)}% or more
              </div>
            </div>

            {/* Below Lower Breakeven */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="font-medium">Below Lower ({formatPercentage(lowerPct)}%)</span>
                <span className="font-semibold text-red-600">{formatNumber(belowLower)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(belowLower / totalSamples) * 100}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Stock moved down {formatPercentage(Math.abs(lowerPct))}% or more
              </div>
            </div>
          </div>

          {/* Breakeven Points Display */}
          {hasValidBreakevens && (
            <div className="bg-gradient-to-r from-green-50 to-red-50 rounded-lg p-3 sm:p-4 border border-green-200 mt-6">
              <h5 className="text-sm font-medium text-gray-700 mb-3 text-center">Breakeven Points</h5>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="text-center">
                  <div className="text-lg sm:text-xl font-bold text-green-600 flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                    +{formatPercentage(upperPct)}%
                  </div>
                  <div className="text-xs text-gray-600">Upper Breakeven</div>
                  <div className="text-xs text-green-600 font-medium">${breakevens.upper.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg sm:text-xl font-bold text-red-600 flex items-center justify-center gap-1">
                    <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
                    {formatPercentage(lowerPct)}%
                  </div>
                  <div className="text-xs text-gray-600">Lower Breakeven</div>
                  <div className="text-xs text-red-600 font-medium">${breakevens.lower.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profitability Insight */}
      <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-full flex-shrink-0">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-blue-800 mb-2 text-sm sm:text-base">Strategy Insight</h4>
            <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
              {hasValidBreakevens ? (
                <>
                  This straddle strategy requires the stock to move beyond <strong>±{formatPercentage(Math.max(Math.abs(upperPct), Math.abs(lowerPct)))}%</strong> to be profitable. 
                  Based on historical data, this happens <strong>{formatPercentage(profitableRate)}%</strong> of the time, 
                  making it a {profitableRate > 60 ? 'potentially profitable' : profitableRate > 40 ? 'moderately risky' : 'high-risk'} strategy.
                </>
              ) : (
                <>
                  This straddle strategy analysis is based on the premium you entered. 
                  Based on historical data, similar premium levels would have been profitable <strong>{formatPercentage(profitableRate)}%</strong> of the time, 
                  making it a {profitableRate > 60 ? 'potentially profitable' : profitableRate > 40 ? 'moderately risky' : 'high-risk'} strategy.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StraddleChart;
