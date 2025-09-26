import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import InteractiveOptionsChart from '../components/InteractiveOptionsChart';
import Header from '../components/Header';
import Footer from './Footer';
import { Info, Calculator, TrendingUp, TrendingDown, Target, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

const ShortStraddleCalculator = () => {
  const [inputs, setInputs] = useState({
    ticker: '',
    currentPrice: '',
    expirationDate: '',
    strikePrice: '',
    callPremium: '',
    putPremium: '',
    totalPremium: ''
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [showCalculatorInfo, setShowCalculatorInfo] = useState(false);

  // Fetch current stock price
  const fetchCurrentPrice = async (ticker) => {
    try {
      const response = await fetch(`/api/stock-price?ticker=${ticker.toUpperCase()}`);
      if (!response.ok) throw new Error('Failed to fetch price');
      const data = await response.json();
      return data.price;
    } catch (error) {
      console.error('Error fetching price:', error);
      return null;
    }
  };

  // Fetch available expiration dates for a ticker
  const fetchAvailableExpirations = async (ticker) => {
    try {
      const response = await fetch(`/api/available-expirations?ticker=${ticker}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableExpirations(data.expirations || []);
      } else {
        console.warn('Failed to fetch available expirations:', response.status);
      }
    } catch (error) {
      console.error('Error fetching available expirations:', error);
    }
  };

  // Handle ticker input with auto-price fetch
  const handleTickerChange = async (value) => {
    try {
      setInputs(prev => ({ ...prev, ticker: value.toUpperCase() }));
      
      if (value.length >= 1) {
        const price = await fetchCurrentPrice(value);
        if (price) {
          // Round to nearest $5 increment for short straddle
          const strikeIncrement = 5;
          const roundedStrike = Math.round(price / strikeIncrement) * strikeIncrement;
          
          setInputs(prev => ({ 
            ...prev, 
            currentPrice: price.toFixed(2),
            strikePrice: roundedStrike.toFixed(2)
          }));
          
          await fetchAvailableExpirations(value);
        }
      }
    } catch (error) {
      console.error('Error in handleTickerChange:', error);
      setError('Failed to fetch ticker data: ' + error.message);
    }
  };

  // Handle expiration date change with straddle options fetch
  const handleExpirationChange = async (value) => {
    setInputs(prev => ({ ...prev, expirationDate: value }));
    
    if (value && inputs.ticker) {
      setFetchingOptions(true);
      setError('');
      
      try {
        const response = await fetch(`/api/straddle-options?ticker=${inputs.ticker.toUpperCase()}&expiration=${value}`);
        if (response.ok) {
          const straddleData = await response.json();
          if (straddleData && straddleData.totalPremium > 0) {
            const callPremium = (straddleData.totalPremium / 2).toFixed(2);
            const putPremium = (straddleData.totalPremium / 2).toFixed(2);
            
            setInputs(prev => ({ 
              ...prev, 
              callPremium: callPremium,
              putPremium: putPremium,
              totalPremium: straddleData.totalPremium.toFixed(2),
              strikePrice: straddleData.strikePrice.toFixed(2),
              expirationDate: straddleData.expiration || value
            }));
          } else {
            setError('Options data unavailable for this expiration date.');
          }
        }
      } catch (error) {
        setError('Failed to fetch options data. Enter premiums manually.');
      } finally {
        setFetchingOptions(false);
      }
    }
  };

  // Auto-calculate premiums
  const handleInputChange = (field, value) => {
    setInputs(prev => {
      const newInputs = { ...prev, [field]: value };
      
      // Auto-calculate total premium from call and put
      if (field === 'callPremium' || field === 'putPremium') {
        const callPremium = parseFloat(newInputs.callPremium) || 0;
        const putPremium = parseFloat(newInputs.putPremium) || 0;
        const totalPremium = callPremium + putPremium;
        
        if (totalPremium > 0) {
          newInputs.totalPremium = totalPremium.toFixed(2);
        }
      }
      
      // Auto-split total premium between call and put
      if (field === 'totalPremium') {
        const totalPremium = parseFloat(value) || 0;
        const splitPremium = totalPremium / 2;
        
        if (newInputs.callPremium === '') {
          newInputs.callPremium = splitPremium.toFixed(2);
        }
        if (newInputs.putPremium === '') {
          newInputs.putPremium = splitPremium.toFixed(2);
        }
      }
      
      return newInputs;
    });
  };

  // Calculate the Short Straddle metrics
  const calculateShortStraddleMetrics = () => {
    const strike = parseFloat(inputs.strikePrice) || 0;
    const totalPremium = parseFloat(inputs.totalPremium) || 0;
    
    if (!strike || !totalPremium) {
      return null;
    }
    
    // Short straddle breakeven points
    const upperBreakeven = strike + totalPremium;
    const lowerBreakeven = strike - totalPremium;
    
    const upperBreakevenPct = (upperBreakeven - strike) / strike;
    const lowerBreakevenPct = (lowerBreakeven - strike) / strike;
    
    return {
      maxProfit: totalPremium,
      maxLoss: 'Unlimited', // Short straddles have unlimited loss
      upperBreakeven,
      lowerBreakeven,
      upperBreakevenPct: upperBreakevenPct * 100,
      lowerBreakevenPct: lowerBreakevenPct * 100,
      profitRange: {
        lower: lowerBreakeven,
        upper: upperBreakeven
      }
    };
  };

  // Analyze historical data for Short Straddle strategy
  const analyzeHistoricalData = async () => {
    if (!inputs.ticker || !inputs.strikePrice || !inputs.totalPremium) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/short-straddle-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: inputs.ticker,
          strikePrice: parseFloat(inputs.strikePrice),
          totalPremium: parseFloat(inputs.totalPremium),
          currentPrice: parseFloat(inputs.currentPrice),
          daysToExpiration: calculateDaysToExpiration()
        })
      });

      if (!response.ok) throw new Error('Analysis failed');
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setError('Failed to analyze historical data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate days to expiration
  const calculateDaysToExpiration = () => {
    if (!inputs.expirationDate) return 0;
    const today = new Date();
    const expDate = new Date(inputs.expirationDate);
    return Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
  };

  const metrics = calculateShortStraddleMetrics();
  const daysToExp = calculateDaysToExpiration();

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">Short Straddle Calculator</h2>
              <button
                onClick={() => setShowCalculatorInfo(!showCalculatorInfo)}
                className="p-2 text-gray-500 hover:text-green-600 transition-colors"
                title="How it works"
              >
                <Info className="h-6 w-6" />
              </button>
            </div>
            <p className="text-lg text-gray-600">Analyze Short Straddle strategies with profit/loss zones</p>
            
            {showCalculatorInfo && (
              <div className="mt-4 max-w-2xl bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">How Short Straddles Work:</h3>
                <div className="text-sm text-green-700 space-y-2">
                  <p><strong>What is a Short Straddle?</strong> Selling both a call and put at the same strike price to collect premium.</p>
                  <p><strong>Profit Potential:</strong> Maximum profit is the premium collected. Profitable when stock stays within breakeven points.</p>
                  <p><strong>Risk:</strong> Unlimited loss potential if stock moves significantly in either direction.</p>
                  <p><strong>Best When:</strong> Expecting low volatility and range-bound price movement.</p>
                  <p><strong>Use With Caution:</strong> Only for experienced traders who can manage risk.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Input Section */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-gray-200 hover:shadow-lg transition-shadow duration-200 rounded-lg">
                  <div className="p-6">
                    <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
                      <Target className="h-6 w-6 text-green-600" />
                      Strategy Parameters
                    </h2>
                    
                    <div className="space-y-4">
                      {/* Ticker */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Stock Ticker *
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g., AAPL"
                          value={inputs.ticker}
                          onChange={(e) => handleTickerChange(e.target.value)}
                          className="w-full"
                        />
                      </div>

                      {/* Current Price */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Current Stock Price
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Current price"
                          value={inputs.currentPrice}
                          onChange={(e) => handleInputChange('currentPrice', e.target.value)}
                          className="w-full"
                        />
                      </div>

                      {/* Expiration Date */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiration Date *
                          {fetchingOptions && (
                            <span className="ml-2 text-xs text-green-600">Fetching options...</span>
                          )}
                        </label>
                        <Input
                          type="date"
                          value={inputs.expirationDate}
                          onChange={(e) => handleExpirationChange(e.target.value)}
                          className="w-full"
                          disabled={fetchingOptions}
                        />
                      </div>

                      {/* Strike Price */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Strike Price *
                        </label>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="ATM strike price"
                          value={inputs.strikePrice}
                          onChange={(e) => handleInputChange('strikePrice', e.target.value)}
                          className="w-full"
                        />
                      </div>

                      {/* Premiums */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h3 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Premiums Collected
                        </h3>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Call Premium</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.callPremium}
                              onChange={(e) => handleInputChange('callPremium', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Put Premium</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.putPremium}
                              onChange={(e) => handleInputChange('putPremium', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-700 mb-1 font-semibold">Total Premium</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.totalPremium}
                              onChange={(e) => handleInputChange('totalPremium', e.target.value)}
                              className="w-full text-sm bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Risk Warning */}
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                          <div className="text-sm">
                            <div className="font-medium text-red-800 mb-1">Risk Warning</div>
                            <div className="text-red-700">
                              Short straddles have <strong>unlimited loss potential</strong>. Only experienced traders should use this strategy.
                            </div>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={analyzeHistoricalData}
                        disabled={loading || !inputs.strikePrice || !inputs.totalPremium}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 disabled:opacity-50"
                      >
                        {loading ? 'Analyzing...' : 'Calculate Strategy'}
                      </Button>
                    </div>

                    {error && (
                      <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Section */}
              <div className="lg:col-span-2">
                {metrics && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                    <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
                      <Target className="h-6 w-6 text-green-600" />
                      Short Straddle Analysis
                    </h2>
                    
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {/* Profit/Loss Metrics */}
                      <div className="space-y-4">
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-green-700 font-medium">Max Profit</span>
                            <span className="text-lg font-bold text-green-600">${metrics.maxProfit.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-green-600 mt-1">Premium Collected</div>
                        </div>

                        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Max Loss</span>
                            <span className="text-lg font-bold text-red-600">Unlimited</span>
                          </div>
                          <div className="text-xs text-red-600 mt-1">Stock moves far from strike</div>
                        </div>
                      </div>

                      {/* Breakeven Points */}
                      <div className="space-y-4">
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-blue-700 font-medium">Upper Breakeven</span>
                            <span className="text-lg font-bold text-blue-600">${metrics.upperBreakeven.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">Strike + Premium</div>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-blue-700 font-medium">Lower Breakeven</span>
                            <span className="text-lg font-bold text-blue-600">${metrics.lowerBreakeven.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">Strike - Premium</div>
                        </div>
                      </div>
                    </div>

                    {/* Profit Zone Visual */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center gap-2">
                        <Target className="h-5 w-5 text-green-600" />
                        Profit Zone Analysis
                      </h3>
                      
                      <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex justify-between">
                          <span>Profit Zone Range:</span>
                          <span className="font-semibold">${metrics.profitRange.lower.toFixed(2)} - ${metrics.profitRange.upper.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Current Stock Price:</span>
                          <span className="font-semibold">${parseFloat(inputs.currentPrice).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Days to Expiration:</span>
                          <span className="font-semibold">{daysToExp} days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results will be rendered here */}
                {results && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Historical Analysis Results</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-700">Profitable Moves</span>
                          <span className="font-bold text-green-600">{results.profitableMoves || 0}</span>
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          {results.profitableRate ? `${results.profitableRate.toFixed(1)}%` : '0%'} Success Rate
                        </div>
                      </div>

                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-700">Total Samples</span>
                          <span className="font-bold text-blue-600">{results.totalSamples || 0}</span>
                        </div>
                        <div className="text-xs text-blue-600 mt-1">
                          Data Quality: {results.dataQuality || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive Chart */}
                {metrics && (
                  <InteractiveOptionsChart 
                    strategyType="short-straddle"
                    inputs={inputs}
                    results={results}
                    metrics={metrics}
                    isMobile={typeof window !== 'undefined' && window.innerWidth < 640}
                    onInputChange={handleInputChange}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
};

export default ShortStraddleCalculator;
