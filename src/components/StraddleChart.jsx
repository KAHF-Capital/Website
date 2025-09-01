import React from 'react';

const StraddleChart = ({ results, breakevens }) => {
  if (!results || !breakevens) return null;

  const { aboveUpper, belowLower, totalSamples, profitableRate } = results;
  const { upperPct, lowerPct } = breakevens;

  // Calculate chart data
  const profitableMoves = aboveUpper + belowLower;
  const unprofitableMoves = totalSamples - profitableMoves;
  
  const maxValue = Math.max(profitableMoves, unprofitableMoves, aboveUpper, belowLower);
  const scale = maxValue > 0 ? 100 / maxValue : 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-medium text-gray-700 mb-4">Historical Performance Visualization</h3>
      
      <div className="space-y-6">
        {/* Profitability Overview */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3">Overall Profitability</h4>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Profitable Moves</span>
                <span>{profitableMoves} ({profitableRate.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(profitableMoves / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Unprofitable Moves</span>
                <span>{unprofitableMoves} ({(100 - profitableRate).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-red-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(unprofitableMoves / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Breakeven Analysis */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3">Breakeven Analysis</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Above Upper (+{upperPct.toFixed(2)}%)</span>
                <span>{aboveUpper}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(aboveUpper / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Below Lower ({lowerPct.toFixed(2)}%)</span>
                <span>{belowLower}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-red-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(belowLower / totalSamples) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Breakeven Points Display */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-600 mb-3">Breakeven Points</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                +{upperPct.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500">Upper Breakeven</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {lowerPct.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500">Lower Breakeven</div>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalSamples}</div>
            <div className="text-xs text-blue-700">Total Data Points</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{profitableRate.toFixed(1)}%</div>
            <div className="text-xs text-green-700">Profit Probability</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StraddleChart;
