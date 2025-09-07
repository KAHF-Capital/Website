import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import StraddleChart from '../components/StraddleChart';
import Header from '../components/Header';
import { Info, TrendingUp, TrendingDown, DollarSign, Calendar, Target } from 'lucide-react';
import Link from 'next/link';
import Footer from './Footer';

const StraddleCalculator = () => {
  const [inputs, setInputs] = useState({
    ticker: '',
    expirationDate: '',
    manualPremium: ''
  });

  const [strategy, setStrategy] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [showStraddleInfo, setShowStraddleInfo] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  // Fetch available expiration dates for a ticker
  const fetchAvailableExpirations = async (ticker) => {
    try {
      const response = await fetch(`/api/available-expirations?ticker=${ticker}`);
      if (response.ok) {
        const data = await response.json();
        const sortedExpirations = (data.expirations || [])
          .filter(date => new Date(date) > new Date()) // Only future dates
          .sort((a, b) => new Date(a) - new Date(b))
          .slice(0, 10); // Show next 10 expirations
        setAvailableExpirations(sortedExpirations);
        return sortedExpirations;
      }
    } catch (error) {
      console.error('Error fetching expirations:', error);
    }
    return [];
  };

  // Handle ticker input with auto-fetch of expirations
  const handleTickerChange = async (value) => {
    const ticker = value.toUpperCase().trim();
    setInputs(prev => ({ ...prev, ticker }));
    setStrategy(null);
    setResults(null);
    setError('');
    setShowManualInput(false);
    
    if (ticker.length >= 1) {
      try {
        const expirations = await fetchAvailableExpirations(ticker);
        if (expirations.length > 0) {
          // Auto-select the first available expiration (usually closest)
          setInputs(prev => ({ ...prev, expirationDate: expirations[0] }));
          // Auto-fetch strategy data
          await fetchStrategyData(ticker, expirations[0]);
        }
      } catch (error) {
        setError('Failed to fetch available expiration dates. Please check the ticker symbol.');
      }
    }
  };

  // Fetch complete strategy data (strike, premium, etc.)
  const fetchStrategyData = async (ticker, expirationDate) => {
    if (!ticker || !expirationDate) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/straddle-options?ticker=${ticker}&expiration=${expirationDate}`);
      if (!response.ok) throw new Error('Failed to fetch strategy data');
      
      const data = await response.json();
      
      if (data.totalPremium > 0) {
        setStrategy(data);
        // Auto-analyze historical data
        await analyzeHistoricalData(data);
        
        // Show a note if pricing was estimated
        if (data.isEstimated) {
          setError(
            <span>
              Options contracts found but real-time pricing unavailable. Using estimated pricing based on stock price and time to expiration. 
              You can still enter the premium manually below for more accurate analysis.
            </span>
          );
        }
      } else {
        setShowManualInput(true);
        setError(
          <span>
            Options found but pricing data unavailable. This usually means no recent trading activity. 
            Please try a different expiration date or enter the premium manually below.
          </span>
        );
      }
    } catch (error) {
      setShowManualInput(true);
      setError(
        <span>
          Unable to fetch options data. Please verify the ticker symbol and try again, or enter the premium manually below.
        </span>
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle expiration date change
  const handleExpirationChange = async (value) => {
    setInputs(prev => ({ ...prev, expirationDate: value }));
    setStrategy(null);
    setResults(null);
    setError('');
    setShowManualInput(false);
    
    if (value && inputs.ticker) {
      await fetchStrategyData(inputs.ticker, value);
    }
  };

  // Handle manual premium input
  const handleManualPremiumSubmit = async () => {
    if (!inputs.ticker || !inputs.expirationDate || !inputs.manualPremium) {
      setError('Please fill in all required fields');
      return;
    }

    const premium = parseFloat(inputs.manualPremium);
    if (isNaN(premium) || premium <= 0) {
      setError('Please enter a valid premium amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to get current stock price for better analysis
      let currentPrice = 100; // Default fallback
      try {
        const priceResponse = await fetch(`/api/stock-price?ticker=${inputs.ticker.toUpperCase()}`);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          currentPrice = priceData.price || 100;
        }
      } catch (priceError) {
        console.log('Could not fetch current price, using default');
      }

      // Create strategy data from manual input
      const daysToExp = Math.ceil((new Date(inputs.expirationDate) - new Date()) / (1000 * 60 * 60 * 24));
      const manualStrategy = {
        ticker: inputs.ticker,
        expiration: inputs.expirationDate,
        currentPrice: currentPrice,
        strikePrice: currentPrice, // Use current price as strike for ATM analysis
        totalPremium: premium,
        callPrice: premium / 2, // Estimate split between call and put
        putPrice: premium / 2,
        daysToExpiration: daysToExp
      };

      setStrategy(manualStrategy);
      setShowManualInput(false);
      
      // Analyze historical data
      await analyzeHistoricalData(manualStrategy);
    } catch (error) {
      setError('Failed to process manual input. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Analyze historical data
  const analyzeHistoricalData = async (strategyData) => {
    if (!strategyData) return;
    
    try {
      const response = await fetch('/api/straddle-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: strategyData.ticker,
          strikePrice: strategyData.strikePrice || 100, // Provide default if missing
          totalPremium: strategyData.totalPremium,
          daysToExpiration: strategyData.daysToExpiration || 30
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Historical analysis failed:', error);
      // Show a subtle error message to the user
      setError(prev => prev + (prev ? ' ' : '') + 'Note: Historical analysis unavailable for this ticker.');
    }
  };

  // Calculate breakeven points
  const calculateBreakevens = () => {
    if (!strategy) return null;
    
    const strike = strategy.strikePrice || 100; // Default to 100 if no strike price
    const premium = strategy.totalPremium;
    
    return {
      upper: strike + premium,
      lower: strike - premium,
      upperPct: strike > 0 ? ((premium / strike) * 100).toFixed(2) : '0.00',
      lowerPct: strike > 0 ? ((-premium / strike) * 100).toFixed(2) : '0.00'
    };
  };

  // Handle URL parameters for pre-filling ticker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tickerParam = urlParams.get('ticker');
      if (tickerParam) {
        handleTickerChange(tickerParam);
      }
    }
  }, []);

  const breakevens = calculateBreakevens();

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">
              ATM Straddle Calculator
            </h2>
            <button
              onClick={() => setShowStraddleInfo(!showStraddleInfo)}
              className="p-2 text-gray-500 hover:text-green-600 transition-colors"
              title="How it works"
            >
              <Info className="h-6 w-6" />
            </button>
          </div>
          <p className="text-lg text-gray-600">
            Analyze the profitability of At-The-Money straddle strategies with just two inputs
          </p>
          
          {showStraddleInfo && (
            <div className="mt-4 max-w-2xl bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">How the Straddle Calculator Works:</h3>
              <div className="text-sm text-green-700 space-y-2">
                <p><strong>What is a Straddle?</strong> A straddle is an options strategy where you buy both a call and put option at the same strike price and expiration date.</p>
                <p><strong>Profit Potential:</strong> You profit when the stock moves significantly in either direction beyond your breakeven points.</p>
                <p><strong>Breakeven Points:</strong> Upper breakeven = Strike Price + Total Premium, Lower breakeven = Strike Price - Total Premium.</p>
                <p><strong>Historical Analysis:</strong> The calculator analyzes past price movements to show how often this strategy would have been profitable.</p>
                <p><strong>Risk:</strong> You lose money if the stock stays between the breakeven points (time decay and low volatility).</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Input Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
                    <Target className="h-6 w-6 text-green-600" />
                    Strategy Setup
                  </h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock Ticker *
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g., AAPL, TSLA, SPY"
                        value={inputs.ticker}
                        onChange={(e) => handleTickerChange(e.target.value)}
                        className="w-full text-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter any valid stock ticker symbol
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expiration Date *
                      </label>
                      <Input
                        type="date"
                        value={inputs.expirationDate}
                        onChange={(e) => handleExpirationChange(e.target.value)}
                        className="w-full"
                        disabled={loading || !inputs.ticker}
                      />
                      {availableExpirations.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Quick select:</p>
                          <div className="flex flex-wrap gap-1">
                            {availableExpirations.slice(0, 5).map((date, index) => (
                              <button
                                key={date}
                                onClick={() => handleExpirationChange(date)}
                                className={`px-2 py-1 text-xs rounded ${
                                  inputs.expirationDate === date
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {loading && (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2">Fetching options data...</p>
                      </div>
                    )}

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                        {typeof error === 'string' ? error : error}
                      </div>
                    )}

                    {showManualInput && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="text-sm font-medium text-blue-800 mb-3">Manual Premium Entry</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Total Premium (Call + Put) *
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="e.g., 5.50"
                              value={inputs.manualPremium}
                              onChange={(e) => setInputs(prev => ({ ...prev, manualPremium: e.target.value }))}
                              className="w-full"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Enter the combined premium for both call and put options
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleManualPremiumSubmit}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Calculate with Manual Premium
                            </Button>
                            <Button
                              onClick={() => setShowManualInput(false)}
                              variant="outline"
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                          </div>
                          <div className="text-xs text-blue-700">
                            <p className="mb-1">Need help finding the premium?</p>
                            <a 
                              href={`https://finance.yahoo.com/quote/${inputs.ticker}/options`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                              View options on Yahoo Finance →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Strategy Summary */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
                    <DollarSign className="h-6 w-6 text-green-600" />
                    Strategy Summary
                  </h2>
                  
                  {strategy ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-lg font-bold text-blue-600">
                            {strategy.strikePrice > 0 ? `$${strategy.strikePrice}` : 'N/A'}
                          </div>
                          <div className="text-xs text-blue-700">Strike Price</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-lg font-bold text-green-600">
                            ${strategy.totalPremium.toFixed(2)}
                            {strategy.isEstimated && (
                              <span className="ml-1 text-xs text-orange-600" title="Estimated pricing">
                                *
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-green-700">
                            Total Premium
                            {strategy.isEstimated && (
                              <span className="block text-orange-600">(Estimated)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {breakevens && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium text-gray-700">Breakeven Points</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-center p-3 bg-green-50 rounded-lg">
                              <div className="text-lg font-bold text-green-600">
                                ${breakevens.upper.toFixed(2)}
                              </div>
                              <div className="text-xs text-green-700">+{breakevens.upperPct}%</div>
                              <div className="text-xs text-gray-600">Upper</div>
                            </div>
                            <div className="text-center p-3 bg-red-50 rounded-lg">
                              <div className="text-lg font-bold text-red-600">
                                ${breakevens.lower.toFixed(2)}
                              </div>
                              <div className="text-xs text-red-700">{breakevens.lowerPct}%</div>
                              <div className="text-xs text-gray-600">Lower</div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-4 w-4" />
                            <span>Expiration: {new Date(strategy.expiration).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>Current Price: {strategy.currentPrice > 0 ? `$${strategy.currentPrice}` : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <Target className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>Enter a ticker and expiration date to see strategy details</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Results Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                    Historical Analysis
                  </h2>
                  
                  {results ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {results.profitableRate.toFixed(1)}%
                          </div>
                          <div className="text-xs text-green-700">Profit Probability</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {results.totalSamples}
                          </div>
                          <div className="text-xs text-blue-700">Data Points</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                          <span className="text-sm text-gray-600">Above Upper Breakeven:</span>
                          <Badge variant="success" className="bg-green-600">
                            {results.aboveUpper} ({results.aboveUpperPct.toFixed(1)}%)
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                          <span className="text-sm text-gray-600">Below Lower Breakeven:</span>
                          <Badge variant="destructive" className="bg-red-600">
                            {results.belowLower} ({results.belowLowerPct.toFixed(1)}%)
                          </Badge>
                        </div>
                      </div>

                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-700">
                          Based on historical data, this straddle strategy would have been profitable{' '}
                          <span className="font-semibold">{results.profitableRate.toFixed(1)}%</span> of the time.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <TrendingUp className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>Strategy analysis will appear here once data is loaded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chart Section - Full Width Below */}
            {results && (
              <div className="mt-8">
                <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                  <div className="p-6">
                    <StraddleChart results={results} breakevens={breakevens} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default StraddleCalculator;
