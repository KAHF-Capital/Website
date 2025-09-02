import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import StraddleChart from '../components/StraddleChart';
import { Info, Menu, X } from 'lucide-react';
import Link from 'next/link';
import Footer from './Footer';
import { motion, AnimatePresence } from 'framer-motion';

const StraddleCalculator = () => {
  const [inputs, setInputs] = useState({
    ticker: '',
    currentPrice: '',
    expirationDate: '',
    strikePrice: '',
    totalPremium: ''
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingOptions, setFetchingOptions] = useState(false);

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

  // Fetch straddle options for a given ticker and expiration date
  const fetchStraddleOptions = async (ticker, expirationDate) => {
    try {
      const response = await fetch(`/api/straddle-options?ticker=${ticker.toUpperCase()}&expiration=${expirationDate}`);
      if (!response.ok) throw new Error('Failed to fetch straddle options');
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching straddle options:', error);
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
      // Don't set error state here as it's not critical for main functionality
    }
  };

  // Handle ticker input with auto-price fetch
  const handleTickerChange = async (value) => {
    try {
      setInputs(prev => ({ ...prev, ticker: value.toUpperCase() }));
      
      if (value.length >= 1) {
        const price = await fetchCurrentPrice(value);
        if (price) {
          // Round strike price to nearest 5 for all prices
          const strikeIncrement = 5;
          const roundedStrike = Math.round(price / strikeIncrement) * strikeIncrement;
          
          setInputs(prev => ({ 
            ...prev, 
            currentPrice: price.toFixed(2),
            strikePrice: roundedStrike.toFixed(2) // Set rounded ATM strike price
          }));
          
          // Fetch available expiration dates
          await fetchAvailableExpirations(value);
        }
      }
    } catch (error) {
      console.error('Error in handleTickerChange:', error);
      setError('Failed to fetch ticker data: ' + error.message);
    }
  };

  // Convert date to Yahoo Finance timestamp format
  const getYahooFinanceDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return Math.floor(date.getTime() / 1000);
  };

  // Generate Yahoo Finance options URL with date and straddle parameters
  const getYahooFinanceUrl = (ticker, expirationDate) => {
    const baseUrl = `https://finance.yahoo.com/quote/${ticker}/options`;
    if (expirationDate) {
      const timestamp = getYahooFinanceDate(expirationDate);
      return `${baseUrl}/?date=${timestamp}&straddle=true`;
    }
    return baseUrl;
  };

  // Handle expiration date change with straddle options fetch
  const handleExpirationChange = async (value) => {
    setInputs(prev => ({ ...prev, expirationDate: value }));
    
    if (value && inputs.ticker) {
      setFetchingOptions(true);
      setError('');
      
      try {
        const straddleData = await fetchStraddleOptions(inputs.ticker, value);
        if (straddleData && straddleData.totalPremium > 0) {
          setInputs(prev => ({ 
            ...prev, 
            totalPremium: straddleData.totalPremium.toFixed(2),
            strikePrice: straddleData.strikePrice.toFixed(2),
            expirationDate: straddleData.expiration // Use the actual expiration date from API
          }));
          
          // Show a message if the expiration date was adjusted
          if (straddleData.requestedExpiration && straddleData.expiration !== straddleData.requestedExpiration) {
            setError(
              <span>
                Note: Using closest available expiration date {straddleData.expiration} (requested {straddleData.requestedExpiration})
              </span>
            );
          }
          
          // Show which execution date was used
          if (straddleData.executionDate) {
            console.log(`Using execution date: ${straddleData.executionDate} for expiration: ${straddleData.expiration}`);
            
            // Show a helpful message about the execution date
            setError(
              <span>
                Execution date: {straddleData.executionDate} | Expiration: {straddleData.expiration}
              </span>
            );
          }
        } else {
          setError(
            <span>
              No straddle options found for this expiration date. Please try a different date or{' '}
              <a 
                href={getYahooFinanceUrl(inputs.ticker, value)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-800 underline font-medium"
              >
                check Yahoo Finance options
              </a>{' '}
              to enter premium manually. Available expirations: {availableExpirations.slice(0, 3).join(', ')}
            </span>
          );
        }
      } catch (error) {
        setError(
          <span>
            Failed to fetch straddle options. Please{' '}
            <a 
              href={getYahooFinanceUrl(inputs.ticker, value)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-green-600 hover:text-green-800 underline font-medium"
            >
              check Yahoo Finance options
            </a>{' '}
            to enter premium manually.
          </span>
        );
      } finally {
        setFetchingOptions(false);
      }
    }
  };

  // Handle URL parameters for pre-filling ticker
  useEffect(() => {
    const initializeTicker = async () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const tickerParam = urlParams.get('ticker');
        if (tickerParam) {
          setInputs(prev => ({ ...prev, ticker: tickerParam.toUpperCase() }));
          await handleTickerChange(tickerParam);
        }
      }
    };

    initializeTicker().catch(error => {
      console.error('Error initializing ticker:', error);
      setError('Failed to initialize ticker from URL parameters');
    });
  }, []); // Empty dependency array is fine since this only runs once on mount

  // Calculate days to expiration (from execution date to expiration)
  const calculateDaysToExpiration = () => {
    if (!inputs.expirationDate) return 0;
    
    // If we have results from the API, use the execution date from there
    if (results && results.executionDate) {
      const execDate = new Date(results.executionDate);
      const expDate = new Date(inputs.expirationDate);
      return Math.floor((expDate - execDate) / (1000 * 60 * 60 * 24));
    }
    
    // Otherwise, estimate from today
    const today = new Date();
    const expDate = new Date(inputs.expirationDate);
    return Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
  };

  // Calculate breakeven points
  const calculateBreakevens = () => {
    if (!inputs.strikePrice || !inputs.totalPremium) return null;
    const strike = parseFloat(inputs.strikePrice);
    const premium = parseFloat(inputs.totalPremium);
    
    return {
      upper: strike + premium,
      lower: strike - premium,
      upperPct: ((strike + premium - strike) / strike) * 100,
      lowerPct: ((strike - premium - strike) / strike) * 100
    };
  };

  // Analyze historical data
  const analyzeHistoricalData = async () => {
    if (!inputs.ticker || !inputs.strikePrice || !inputs.totalPremium) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/straddle-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: inputs.ticker,
          strikePrice: parseFloat(inputs.strikePrice),
          totalPremium: parseFloat(inputs.totalPremium),
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

  const breakevens = calculateBreakevens();
  const daysToExp = calculateDaysToExpiration();
  const [showStraddleInfo, setShowStraddleInfo] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [availableExpirations, setAvailableExpirations] = useState([]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                alt="KAHF Capital Logo" 
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">KAHF Capital</h1>
                <p className="text-gray-600 text-sm">VolAlert Pro - SMS Alert System</p>
              </div>
            </div>
            <nav className="hidden sm:flex space-x-8">
              <Link href="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Home
              </Link>
              <Link href="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Learning Modules
              </Link>
              <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium">
                Scanner
              </Link>
              <Link href="/straddle-calculator" className="text-green-600 font-medium">
                Straddle Calculator
              </Link>
              <a 
                href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-gray-900 hover:text-green-600 transition-colors font-medium"
              >
                My Subscriptions
              </a>
            </nav>
            <div className="sm:hidden">
              <button className="p-2 text-gray-900 hover:text-green-600 touch-manipulation" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="sm:hidden overflow-hidden"
            >
              <nav className="flex flex-col items-center space-y-1 p-3 border-t border-gray-200">
                <Link href="/" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Home
                </Link>
                <Link href="/learning" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Learning Modules
                </Link>
                <Link href="/scanner" className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Scanner
                </Link>
                <Link href="/straddle-calculator" className="text-green-600 font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation" onClick={() => setIsMobileMenuOpen(false)}>
                  Straddle Calculator
                </Link>
                <a 
                  href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-gray-900 hover:text-green-600 transition-colors font-medium w-full text-center py-3 rounded-md hover:bg-gray-100 touch-manipulation"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  My Subscriptions
                </a>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">ATM Straddle Profitability Calculator</h2>
              <button
                onClick={() => setShowStraddleInfo(!showStraddleInfo)}
                className="p-2 text-gray-500 hover:text-green-600 transition-colors"
                title="How it works"
              >
                <Info className="h-6 w-6" />
              </button>
            </div>
            <p className="text-lg text-gray-600">Analyze historical profitability of At-The-Money straddle strategies</p>
            
            {showStraddleInfo && (
              <div className="mt-4 max-w-2xl bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">How the Straddle Calculator Works:</h3>
                <div className="text-sm text-green-700 space-y-2">
                  <p><strong>What is a Straddle?</strong> A straddle is an options strategy where you buy both a call and put option at the same strike price and expiration date.</p>
                  <p><strong>Profit Potential:</strong> You profit when the stock moves significantly in either direction (up or down) beyond your breakeven points.</p>
                  <p><strong>Breakeven Points:</strong> Upper breakeven = Strike Price + Total Premium, Lower breakeven = Strike Price - Total Premium.</p>
                  <p><strong>Historical Analysis:</strong> The calculator analyzes past price movements to show how often this strategy would have been profitable.</p>
                  <p><strong>Risk:</strong> You lose money if the stock stays between the breakeven points (time decay and low volatility).</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 py-12 px-4">
          <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Input Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Strategy Parameters</h2>
            <p className="text-sm text-gray-600 mb-4">
              Execution date is automatically set to the last trading day. You only need to select the expiration date.
            </p>
            
            <div className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Stock Price
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Current price"
                  value={inputs.currentPrice}
                  onChange={(e) => setInputs(prev => ({ ...prev, currentPrice: e.target.value }))}
                  className="w-full"
                />
              </div>

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
                {availableExpirations.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Available expirations: {availableExpirations.slice(0, 5).join(', ')}
                    {availableExpirations.length > 5 && ` and ${availableExpirations.length - 5} more`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Strike Price (ATM) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Strike price"
                  value={inputs.strikePrice}
                  onChange={(e) => setInputs(prev => ({ ...prev, strikePrice: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Premium (Call + Put) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Combined premium"
                  value={inputs.totalPremium}
                  onChange={(e) => setInputs(prev => ({ ...prev, totalPremium: e.target.value }))}
                  className="w-full"
                />
                                                                                           <p className="text-xs text-gray-500 mt-1">
                          Premium will be automatically calculated when you select an expiration date.{' '}
                          <a 
                            href={getYahooFinanceUrl(inputs.ticker || 'AAPL', inputs.expirationDate)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 underline"
                          >
                            View options on Yahoo Finance
                          </a>
                        </p>
              </div>

              <Button
                onClick={analyzeHistoricalData}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
              >
                {loading ? 'Analyzing...' : 'Calculate Profitability'}
              </Button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                       {typeof error === 'string' ? error : error}
              </div>
            )}
                </div>
          </div>

          {/* Results Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-6">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Analysis Results</h2>
            
            {breakevens && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-3">Breakeven Points</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      ${breakevens.upper.toFixed(2)}
                    </div>
                    <div className="text-sm text-green-700">
                      +{breakevens.upperPct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-600">Upper Breakeven</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      ${breakevens.lower.toFixed(2)}
                    </div>
                    <div className="text-sm text-red-700">
                      {breakevens.lowerPct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-600">Lower Breakeven</div>
                  </div>
                </div>
              </div>
            )}

            {daysToExp > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-2">Strategy Details</h3>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">
                    Days to Expiration: <span className="font-semibold">{daysToExp} days</span>
                  </div>
                </div>
              </div>
            )}

            {results && (
              <div>
                <h3 className="text-lg font-medium text-gray-700 mb-3">Historical Analysis</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <span className="text-sm text-gray-600">Moves Above Upper Breakeven:</span>
                    <Badge variant="success" className="bg-green-600">
                      {results.aboveUpper} ({results.aboveUpperPct.toFixed(1)}%)
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <span className="text-sm text-gray-600">Moves Below Lower Breakeven:</span>
                    <Badge variant="destructive" className="bg-red-600">
                      {results.belowLower} ({results.belowLowerPct.toFixed(1)}%)
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="text-sm text-gray-600">Total Profitable Moves:</span>
                    <Badge variant="default" className="bg-blue-600">
                      {results.totalProfitable} ({results.profitableRate.toFixed(1)}%)
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Total Data Points:</span>
                    <span className="font-semibold">{results.totalSamples}</span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-medium text-yellow-800 mb-2">Profitability Summary</h4>
                  <p className="text-sm text-yellow-700">
                    Based on historical data, this straddle strategy would have been profitable 
                    <span className="font-semibold"> {results.profitableRate.toFixed(1)}% </span>
                    of the time over {results.totalSamples} historical periods.
                  </p>
                </div>
              </div>
            )}

            {!results && !loading && (
              <div className="text-center text-gray-500 py-8">
                <p>Enter your strategy parameters and click "Calculate Profitability" to see the analysis.</p>
              </div>
            )}
                </div>
          </div>

          {/* Chart Section */}
          <div className="lg:col-span-1">
                <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                  <div className="p-6">
            <StraddleChart results={results} breakevens={breakevens} />
          </div>
        </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default StraddleCalculator;
