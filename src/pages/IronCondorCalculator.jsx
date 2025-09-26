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

const IronCondorCalculator = () => {
  const [inputs, setInputs] = useState({
    ticker: '',
    currentPrice: '',
    expirationDate: '',
    shortCallStrike: '',
    shortPutStrike: '',
    longCallStrike: '',
    longPutStrike: '',
    callCredit: '',
    putCredit: '',
    totalCredit: '',
    callDebit: '',
    putDebit: '',
    totalDebit: ''
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [availableExpirations, setAvailableExpirations] = useState([]);

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
          // Round to nearest $5 increment for multi-leg strategies
          const strikeIncrement = 5;
          const roundedPrice = Math.round(price / strikeIncrement) * strikeIncrement;
          
          // Set middle strikes at ATM, adjust wings for condor spread
          const atmPrice = roundedPrice;
          const wingWidth = 10; // 10 dollar wings by default
          
          setInputs(prev => ({ 
            ...prev, 
            currentPrice: price.toFixed(2),
            shortCallStrike: atmPrice.toFixed(0),
            shortPutStrike: atmPrice.toFixed(0),
            longCallStrike: (atmPrice + wingWidth).toFixed(0),
            longPutStrike: (atmPrice - wingWidth).toFixed(0)
          }));
          
          await fetchAvailableExpirations(value);
        }
      }
    } catch (error) {
      console.error('Error in handleTickerChange:', error);
      setError('Failed to fetch ticker data: ' + error.message);
    }
  };

  // Auto-calculate values as user inputs data
  const handleInputChange = (field, value) => {
    const newInputs = { ...inputs, [field]: value };
    
    // Auto-calculate total credit
    if (field === 'callCredit' || field === 'putCredit') {
      const callCredit = parseFloat(newInputs.callCredit) || 0;
      const putCredit = parseFloat(newInputs.putCredit) || 0;
      const callDebit = parseFloat(newInputs.callDebit) || 0;
      const putDebit = parseFloat(newInputs.putDebit) || 0;
      
      const totalCredit = callCredit + putCredit;
      const totalDebit = callDebit + putDebit;
      
      newInputs.totalCredit = totalCredit > 0 ? totalCredit.toFixed(2) : '';
      newInputs.totalDebit = totalDebit > 0 ? totalDebit.toFixed(2) : '';
    }
    
    // Auto-calculate total debit
    if (field === 'callDebit' || field === 'putDebit') {
      const callDebit = parseFloat(newInputs.callDebit) || 0;
      const putDebit = parseFloat(newInputs.putDebit) || 0;
      const callCredit = parseFloat(newInputs.callCredit) || 0;
      const putCredit = parseFloat(newInputs.putCredit) || 0;
      
      const totalDebit = callDebit + putDebit;
      const totalCredit = callCredit + putCredit;
      
      newInputs.totalDebit = totalDebit > 0 ? totalDebit.toFixed(2) : '';
      newInputs.totalCredit = totalCredit > 0 ? totalCredit.toFixed(2) : '';
    }
    
    // Auto-calculate total credit/debit
    if (field === 'totalCredit') {
      const totalCredit = parseFloat(value) || 0;
      const callCredit = parseFloat(newInputs.callCredit) || 0;
      const putCredit = totalCredit - callCredit;
      newInputs.putCredit = putCredit >= 0 ? putCredit.toFixed(2) : '';
    }
    
    if (field === 'totalDebit') {
      const totalDebit = parseFloat(value) || 0;
      const callDebit = parseFloat(newInputs.callDebit) || 0;
      const putDebit = totalDebit - callDebit;
      newInputs.putDebit = putDebit >= 0 ? putDebit.toFixed(2) : '';
    }
    
    setInputs(newInputs);
  };

  // Calculate the Iron Condor metrics
  const calculateIronCondorMetrics = () => {
    const shortCall = parseFloat(inputs.shortCallStrike) || 0;
    const shortPut = parseFloat(inputs.shortPutStrike) || 0;
    const longCall = parseFloat(inputs.longCallStrike) || 0;
    const longPut = parseFloat(inputs.longPutStrike) || 0;
    const totalCredit = parseFloat(inputs.totalCredit) || 0;
    const totalDebit = parseFloat(inputs.totalDebit) || 0;
    const currentPrice = parseFloat(inputs.currentPrice) || 0;
    
    if (!shortCall || !shortPut || !longCall || !longPut || (!totalCredit && !totalDebit)) {
      return null;
    }
    
    const netCredit = totalCredit - totalDebit;
    const callSpreadWidth = longCall - shortCall;
    const putSpreadWidth = shortPut - longPut;
    const maxRisk = Math.max(callSpreadWidth, putSpreadWidth) - netCredit;
    
    // Breakeven points
    const upperBreakeven = shortCall + netCredit;
    const lowerBreakeven = shortPut - netCredit;
    
    return {
      netCredit,
      maxRisk,
      maxProfit: netCredit,
      callSpreadWidth,
      putSpreadWidth,
      upperBreakeven,
      lowerBreakeven,
      profitZone: {
        upper: lowerBreakeven,
        lower: upperBreakeven
      },
      isSetupValid: maxRisk > 0 && netCredit > 0
    };
  };

  // Analyze historical data for Iron Condor strategy
  const analyzeHistoricalData = async () => {
    if (!inputs.ticker || !inputs.shortCallStrike || !inputs.shortPutStrike || !inputs.longCallStrike || !inputs.longPutStrike) {
      setError('Please fill in all required strike prices');
      return;
    }

    const metrics = calculateIronCondorMetrics();
    if (!metrics || !metrics.isSetupValid) {
      setError('Invalid Iron Condor setup. Please check your strikes and credit/debit values.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/iron-condor-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: inputs.ticker,
          shortCallStrike: parseFloat(inputs.shortCallStrike),
          shortPutStrike: parseFloat(inputs.shortPutStrike),
          longCallStrike: parseFloat(inputs.longCallStrike),
          longPutStrike: parseFloat(inputs.longPutStrike),
          totalCredit: parseFloat(inputs.totalCredit) || 0,
          totalDebit: parseFloat(inputs.totalDebit) || 0,
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

  const metrics = calculateIronCondorMetrics();
  const daysToExp = calculateDaysToExpiration();

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">Iron Condor Calculator</h2>
              <Calculator className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg text-gray-600">Analyze Iron Condor strategies with interactive charts and profit zones</p>
          </div>
        </div>

        <div className="bg-gray-50 py-4 sm:py-12 px-2 sm:px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
              {/* Input Section */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-gray-200 hover:shadow-lg transition-shadow duration-200 rounded-lg">
                  <div className="p-3 sm:p-6">
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
                        </label>
                        <Input
                          type="date"
                          value={inputs.expirationDate}
                          onChange={(e) => handleInputChange('expirationDate', e.target.value)}
                          className="w-full"
                        />
                      </div>

                      {/* Strike Prices Row */}
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <h3 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Strike Prices
                        </h3>
                        
                        {/* Call Strikes */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Short Call Strike</label>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="Call"
                              value={inputs.shortCallStrike}
                              onChange={(e) => handleInputChange('shortCallStrike', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Long Call Strike</label>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="Call + Wing"
                              value={inputs.longCallStrike}
                              onChange={(e) => handleInputChange('longCallStrike', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                        </div>

                        {/* Put Strikes */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Long Put Strike</label>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="Put - Wing"
                              value={inputs.longPutStrike}
                              onChange={(e) => handleInputChange('longPutStrike', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Short Put Strike</label>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="Put"
                              value={inputs.shortPutStrike}
                              onChange={(e) => handleInputChange('shortPutStrike', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Credit/Debit Inputs */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h3 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Premiums
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Call Credit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.callCredit}
                              onChange={(e) => handleInputChange('callCredit', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Call Debit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.callDebit}
                              onChange={(e) => handleInputChange('callDebit', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Put Credit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.putCredit}
                              onChange={(e) => handleInputChange('putCredit', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Put Debit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.putDebit}
                              onChange={(e) => handleInputChange('putDebit', e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2 border-t border-green-300 pt-3">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1 font-semibold">Total Credit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.totalCredit}
                              onChange={(e) => handleInputChange('totalCredit', e.target.value)}
                              className="w-full text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1 font-semibold">Total Debit</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={inputs.totalDebit}
                              onChange={(e) => handleInputChange('totalDebit', e.target.value)}
                              className="w-full text-sm bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={analyzeHistoricalData}
                        disabled={loading || !metrics?.isSetupValid}
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
                      Iron Condor Analysis
                    </h2>
                    
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {/* Profit Metrics */}
                      <div className="space-y-4">
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-green-700 font-medium">Max Profit</span>
                            <span className="text-lg font-bold text-green-600">${metrics.maxProfit.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-green-600 mt-1">Net Credit Received</div>
                        </div>

                        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Max Risk</span>
                            <span className="text-lg font-bold text-red-600">${metrics.maxRisk.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-red-600 mt-1">Breakeven Point Loss</div>
                        </div>
                      </div>

                      {/* Breakeven Points */}
                      <div className="space-y-4">
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-blue-700 font-medium">Upper Breakeven</span>
                            <span className="text-lg font-bold text-blue-600">${metrics.upperBreakeven.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">Short Call + Net Credit</div>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-blue-700 font-medium">Lower Breakeven</span>
                            <span className="text-lg font-bold text-blue-600">${metrics.lowerBreakeven.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">Short Put - Net Credit</div>
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
                          <span className="font-semibold">${metrics.profitZone.lower.toFixed(2)} - ${metrics.profitZone.upper.toFixed(2)}</span>
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

                    {/* Strategy Validation */}
                    {!metrics.isSetupValid && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                          <span className="font-medium text-orange-800">Setup Validation Issues</span>
                        </div>
                        <div className="text-sm text-orange-700 mt-2">
                          Please check that your strikes follow the pattern: Long Put &lt; Short Put &lt; Short Call &lt; Long Call
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Results will be rendered here */}
                {results && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Historical Analysis Results</h3>
                    {/* Results content will be added later */}
                  </div>
                )}

                {/* Interactive Chart */}
                {metrics && (
                  <InteractiveOptionsChart 
                    strategyType="iron-condor"
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

export default IronCondorCalculator;
