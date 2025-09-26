import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, BarChart3, Layers, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';

const InteractiveOptionsChart = ({ 
  strategyType, 
  inputs, 
  results, 
  metrics, 
  isMobile = false,
  onInputChange 
}) => {
  const [currentPrice, setCurrentPrice] = useState(null);
  const [showContractDetails, setShowContractDetails] = useState(false);

  // Auto-calculate current price
  useEffect(() => {
    if (inputs?.currentPrice) {
      setCurrentPrice(parseFloat(inputs.currentPrice));
    }
  }, [inputs]);

  if (!inputs || !metrics) return null;

  const { aboveUpperBreakeven, belowLowerBreakeven, totalSamples, profitableRate = 0 } = results || {};
  const {
    upperBreakeven,
    lowerBreakeven,
    maxProfit,
    profitRange,
    profitZone
  } = metrics || {};

  // Strategy-specific configuration
  const getStrategyConfig = () => {
    switch (strategyType) {
      case 'iron-condor':
        return {
          name: 'Iron Condor',
          color: 'purple',
          icon: Layers,
          description: 'Range-bound strategy with defined profit/loss zones'
        };
      case 'straddle':
      default:
        return {
          name: 'Straddle',
          color: 'blue',
          icon: Target,
          description: 'Directional strategy for breakout moves'
        };
    }
  };

  const strategyConfig = getStrategyConfig();
  const StrategyIcon = strategyConfig.icon;

  // Profit/loss calculation for current price
  const calculateCurrentProfitLoss = () => {
    if (!currentPrice || !inputs) return { profitLoss: 0, status: 'neutral' };

    const price = parseFloat(currentPrice);
    let profitLoss = 0;
    let status = 'neutral';

    switch (strategyType) {
      case 'iron-condor':
        if (price > upperBreakeven || price < lowerBreakeven) {
          // Loss scenarios
          if (price > upperBreakeven) {
            const callLoss = Math.max(0, price - upperBreakeven);
            profitLoss = -callLoss;
          } else {
            const putLoss = Math.max(0, lowerBreakeven - price);
            profitLoss = -putLoss;
          }
          status = 'loss';
        } else {
          // Profit scenarios
          profitLoss = maxProfit || 0;
          status = 'profit';
        }
        break;


      case 'straddle':
      default:
        if (price > upperBreakeven || price < lowerBreakeven) {
          profitLoss = maxProfit || 0;
          status = 'profit';
        } else {
          const insuranceWords = Math.min(
            Math.abs(price - upperBreakeven),
            Math.abs(price - lowerBreakeven)
          ) / parseFloat(inputs.currentPrice);
          profitLoss = -(maxProfit || 0) * (1 - insuranceWords);
          status = 'loss';
        }
        break;
    }

    return { profitLoss, status };
  };

  const { profitLoss, status } = calculateCurrentProfitLoss();

  // Topologyize format helpers
  const formatPercentage = (value) => {
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  // Contract details
  const contractDetails = () => {
    if (!showContractDetails) return;

    if (strategyType === 'iron-condor') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="font-semibold text-blue-700">Call Spread</div>
              <div className="text-blue-600">
                Buy ${inputs.longCallStrike} Put @ ${inputs.longCallStrike}</div>
              <div className="text-blue-600">
                Sell ${inputs.shortCallStrike} Call @ ${inputs.shortCallStrike}</div>
              </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="font-semibold text-green-700">Put Spread</div>
              <div className="text-green-600">
                Sell ${inputs.shortPutStrike} Put @ ${inputs.shortPutStrike}</div>
              <div className="text-green-600">
                Buy ${inputs.longPutStrike} Put @ ${inputs.longPutStrike}</div>
            </div>
          </div>
        </div>
      );
    }


    return (
      <div className="space-y-3">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="font-semibold text-blue-700">Straddle Legs</div>
          <div className="text-blue-600 text-sm">
            <div>Buy Call: ${inputs.strikePrice} @ ${(inputs.totalPremium/2).toFixed(2)}</div>
            <div>Buy Put: ${inputs.strikePrice} @ ${(inputs.totalPremium/2).toFixed(2)}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className={`h-5 w-5 sm:h-6 sm:w-6 text-${strategyConfig.color}-600`} />
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800">
            Interactive {strategyConfig.name} Analysis
          </h3>
        </div>
        <StrategyIcon className={`h-5 w-5 text-${strategyConfig.color}-600`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Chart Area */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-700 flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" />
            Strategy Performance
          </h4>

          {/* Current Price Input and Results */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Stock Price"
                value={currentPrice || ''}
                onChange={(e) => setCurrentPrice(e.target.value ? parseFloat(e.target.value) : null)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <button
                onClick={() => setShowContractDetails(!showContractDetails)}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Layers className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <div className={`text-sm font-bold ${status === 'profit' ? 'text-green-600' : 'text-gray-400'}`}>
                  +${profitLoss > 0 ? profitLoss.toFixed(2) : '0.00'}
                </div>
                <div className="text-xs text-green-700">Optimal Profit</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2 text-center">
                <div className={`text-sm font-bold ${status === 'loss' ? 'text-red-600' : 'text-gray-400'}`}>
                  ${profitLoss < 0 ? profitLoss.toFixed(2) : '0.00'}
                </div>
                <div className="text-xs text-red-700">Current Risk</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-blue-600">
                  {status === 'profit' ? 'PROFIT' : status === 'loss' ? 'LOSS' : 'BREAKEVEN'}
                </div>
                <div className="text-xs text-blue-700">Status</div>
              </div>
            </div>
          </div>

          {/* Profit Zone Visual */}
          <div className="bg-gradient-to-r from-green-50 to-red-50 rounded-lg p-4 border border-green-200">
            <h5 className="font-semibold text-gray-800 mb-3">Price Zones</h5>
            <div className="space-y-2">
              <div className="text-sm flex justify-between">
                <span>Below Lower: Loss Zone</span>
                <span className="font-semibold text-red-600">
                  &lt; ${numberFormat(lowerBreakeven)}
                </span>
              </div>
              <div className="text-sm flex justify-between">
                <span>Profit Zone</span>
                <span className="font-semibold text-green-600">
                  ${numberFormat(lowerBreakeven)} - ${numberFormat(upperBreakeven)}
                </span>
              </div>
              <div className="text-sm flex justify-between">
                <span>Above Upper: Loss Zone</span>
                <span className="font-semibold text-red-600">
                  &gt; ${numberFormat(upperBreakeven)}
                </span>
              </div>
              {currentPrice && (
                <div className={`text-sm font-bold ${
                  status === 'profit' ? 'text-green-600' : 
                  status === 'loss' ? 'text-red-600' : 'text-blue-600'
                }`}>
                  Current: ${numberFormat(currentPrice)} ({status.toUpperCase()})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contract Details & Analysis Results */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-700 flex items-center gap-2">
            {results ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                Historical Analysis Results
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Strategy Details
              </>
            )}
          </h4>

          {showContractDetails && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-semibold text-blue-800 mb-2">Contract Structure</h5>
              {contractDetails()}
            </div>
          )}

          {results && results.totalSamples > 0 && (
            <div className="space-y-4">
              {/* Historical Performance Bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span className="font-medium">Profitable Moves</span>
                    <span className="font-semibold text-green-600">
                      {results.profitableRate ? results.profitableRate.toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${results.profitableRate || 0}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span className="font-medium">Loss Moves</span>
                    <span className="font-semibold text-red-600">
                      {(100 - (results.profitableRate || 0)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${100 - (results.profitableRate || 0)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                  <div className="text-lg font-bold text-green-600">{formatPercentage(profitableRate)}%</div>
                  <div className="text-xs text-green-700">Success Rate</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                  <div className="text-lg font-bold text-blue-600">{totalSamples || 0}</div>
                  <div className="text-xs text-blue-700">Data Points</div>
                </div>
              </div>
            </div>
          )}

          {strategyConfig.description && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <StrategyIcon className={`h-4 w-4 text-${strategyConfig.color}-600 mb-2 inline`} />
              <p className="text-sm text-gray-700 leading-relaxed">
                {strategyConfig.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function for number formatting
const numberFormat = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

export default InteractiveOptionsChart;
