import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import StraddleChart from '../components/StraddleChart';
import InteractiveOptionsChart from '../components/InteractiveOptionsChart';
import Header from '../components/Header';
import { Info, Loader2, Search, AlertCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import Footer from './Footer';

const StraddleCalculator = () => {
  const [inputs, setInputs] = useState({
    ticker: '',
    currentPrice: '',
    expirationDate: '',
    strikePrice: '',
    totalPremium: '',
    callPrice: '',
    putPrice: '',
    callBid: '',
    callAsk: '',
    putBid: '',
    putAsk: ''
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState([]);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [showStraddleInfo, setShowStraddleInfo] = useState(false);

  const debounceRef = useRef(null);

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

  const fetchStraddleOptions = async (ticker, expirationDate) => {
    try {
      const response = await fetch(`/api/straddle-options?ticker=${ticker.toUpperCase()}&expiration=${expirationDate}`);
      if (!response.ok) throw new Error('Failed to fetch straddle options');
      return await response.json();
    } catch (error) {
      console.error('Error fetching straddle options:', error);
      return null;
    }
  };

  const fetchAvailableExpirations = async (ticker) => {
    try {
      const response = await fetch(`/api/available-expirations?ticker=${ticker}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableExpirations(data.expirations || []);
      }
    } catch (error) {
      console.error('Error fetching available expirations:', error);
    }
  };

  // Debounced ticker lookup — fires 600ms after last keystroke
  const debouncedTickerLookup = useCallback((value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (value.length < 1) return;

      setFetchingPrice(true);
      setError('');
      setNotices([]);
      setResults(null);
      setAvailableExpirations([]);

      try {
        const price = await fetchCurrentPrice(value);
        if (price) {
          const inc = price < 10 ? 0.5 : price < 50 ? 1 : price < 100 ? 2.5 : 5;
          const roundedStrike = Math.round(price / inc) * inc;

          setInputs(prev => ({
            ...prev,
            currentPrice: price.toFixed(2),
            strikePrice: roundedStrike.toFixed(2),
            expirationDate: '',
            totalPremium: ''
          }));

          await fetchAvailableExpirations(value);
        } else {
          setError('Ticker not found. Please check the symbol.');
        }
      } catch (err) {
        setError('Failed to fetch ticker data.');
      } finally {
        setFetchingPrice(false);
      }
    }, 600);
  }, []);

  const handleTickerChange = (value) => {
    const upper = value.toUpperCase().replace(/[^A-Z]/g, '');
    setInputs(prev => ({ ...prev, ticker: upper }));
    if (upper.length >= 1) {
      debouncedTickerLookup(upper);
    }
  };

  const handleTickerKeyDown = (e) => {
    if (e.key === 'Enter' && inputs.ticker.length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debouncedTickerLookup(inputs.ticker);
    }
  };

  const getYahooFinanceDate = (dateString) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Math.floor(date.getTime() / 1000);
  };

  const getYahooFinanceUrl = (ticker, expirationDate) => {
    const baseUrl = `https://finance.yahoo.com/quote/${ticker}/options`;
    if (expirationDate) {
      return `${baseUrl}/?date=${getYahooFinanceDate(expirationDate)}&straddle=true`;
    }
    return baseUrl;
  };

  const handleExpirationChange = async (value) => {
    setInputs(prev => ({ ...prev, expirationDate: value }));
    setNotices([]);
    setError('');

    if (!value || !inputs.ticker) return;

    setFetchingOptions(true);

    try {
      const straddleData = await fetchStraddleOptions(inputs.ticker, value);

      if (straddleData && straddleData.totalPremium > 0) {
        setInputs(prev => ({
          ...prev,
          totalPremium: straddleData.totalPremium.toFixed(2),
          strikePrice: straddleData.strikePrice.toFixed(2),
          expirationDate: straddleData.expiration,
          callPrice: straddleData.callPrice ? straddleData.callPrice.toFixed(2) : '',
          putPrice: straddleData.putPrice ? straddleData.putPrice.toFixed(2) : '',
          callBid: straddleData.callBid ?? '',
          callAsk: straddleData.callAsk ?? '',
          putBid: straddleData.putBid ?? '',
          putAsk: straddleData.putAsk ?? ''
        }));

        const newNotices = [];
        if (straddleData.callPrice === 0) newNotices.push("Call option price not available");
        if (straddleData.putPrice === 0) newNotices.push("Put option price not available");
        if (straddleData.dataQuality === 'low') newNotices.push("Limited pricing data — some values may use previous day's close");
        if (straddleData.requestedExpiration && straddleData.expiration !== straddleData.requestedExpiration) {
          newNotices.push(`Using closest available expiration ${straddleData.expiration} (requested ${straddleData.requestedExpiration})`);
        }
        setNotices(newNotices);
      } else {
        setError(
          <span>
            Options pricing data not found.{' '}
            <a href={getYahooFinanceUrl(inputs.ticker, value)} target="_blank" rel="noopener noreferrer"
              className="text-green-600 hover:text-green-800 underline font-medium">
              Check Yahoo Finance
            </a>{' '}to enter premium manually.
          </span>
        );
      }
    } catch (err) {
      setError(
        <span>
          Failed to fetch options.{' '}
          <a href={getYahooFinanceUrl(inputs.ticker, value)} target="_blank" rel="noopener noreferrer"
            className="text-green-600 hover:text-green-800 underline font-medium">
            Check Yahoo Finance
          </a>{' '}to enter premium manually.
        </span>
      );
    } finally {
      setFetchingOptions(false);
    }
  };

  // URL params pre-fill
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tickerParam = urlParams.get('ticker');
      if (tickerParam) {
        const upper = tickerParam.toUpperCase();
        setInputs(prev => ({ ...prev, ticker: upper }));
        debouncedTickerLookup(upper);
      }
    }
  }, [debouncedTickerLookup]);

  const calculateDaysToExpiration = () => {
    if (!inputs.expirationDate) return 0;
    if (results && results.executionDate) {
      const execDate = new Date(results.executionDate);
      const expDate = new Date(inputs.expirationDate);
      return Math.floor((expDate - execDate) / (1000 * 60 * 60 * 24));
    }
    const today = new Date();
    const expDate = new Date(inputs.expirationDate);
    return Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
  };

  const calculateBreakevens = () => {
    if (!inputs.strikePrice || !inputs.totalPremium) return null;
    const strike = parseFloat(inputs.strikePrice);
    const premium = parseFloat(inputs.totalPremium);
    return {
      upper: strike + premium,
      lower: strike - premium,
      upperPct: (premium / strike) * 100,
      lowerPct: -(premium / strike) * 100
    };
  };

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
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err) {
      setError('Failed to analyze historical data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const breakevens = calculateBreakevens();
  const daysToExp = calculateDaysToExpiration();

  const formatExpDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const daysUntil = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight tracking-tight">ATM Straddle Profitability Calculator</h2>
            <button
              onClick={() => setShowStraddleInfo(!showStraddleInfo)}
              className="p-2 text-gray-500 hover:text-green-600 transition-colors flex-shrink-0"
              title="How it works"
            >
              <Info className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
          <p className="text-base sm:text-lg text-gray-600">Analyze historical profitability of At-The-Money straddle strategies</p>

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

        <div className="bg-gray-50 py-8 sm:py-12 px-4 rounded-xl">
          <div className="max-w-6xl mx-auto">
            {/* Top row: Inputs + Results side by side on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              {/* Input Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-5 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-gray-800">Strategy Parameters</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Execution date is automatically set to the last trading day. Select the expiration date below.
                  </p>

                  <div className="space-y-4">
                    {/* Ticker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock Ticker *
                      </label>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="e.g., AAPL"
                          value={inputs.ticker}
                          onChange={(e) => handleTickerChange(e.target.value)}
                          onKeyDown={handleTickerKeyDown}
                          className="w-full pr-10"
                          maxLength={5}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {fetchingPrice ? (
                            <Loader2 className="h-4 w-4 text-green-600 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Current Price */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Stock Price
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={fetchingPrice ? "Loading..." : "Current price"}
                        value={inputs.currentPrice}
                        onChange={(e) => setInputs(prev => ({ ...prev, currentPrice: e.target.value }))}
                        className="w-full"
                        disabled={fetchingPrice}
                      />
                    </div>

                    {/* Expiration Date — dropdown when expirations available */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expiration Date *
                        {fetchingOptions && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600">
                            <Loader2 className="h-3 w-3 animate-spin" /> Fetching options...
                          </span>
                        )}
                      </label>

                      {availableExpirations.length > 0 ? (
                        <div className="relative">
                          <select
                            value={inputs.expirationDate}
                            onChange={(e) => handleExpirationChange(e.target.value)}
                            disabled={fetchingOptions}
                            className="flex h-10 w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Select expiration date...</option>
                            {availableExpirations.map((exp) => {
                              const days = daysUntil(exp);
                              return (
                                <option key={exp} value={exp}>
                                  {formatExpDate(exp)} ({days}d)
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <Input
                          type="date"
                          value={inputs.expirationDate}
                          onChange={(e) => handleExpirationChange(e.target.value)}
                          className="w-full"
                          disabled={fetchingOptions}
                          placeholder="Enter ticker first"
                        />
                      )}
                    </div>

                    {/* Strike Price */}
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

                    {/* Total Premium */}
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
                    </div>

                    <Button
                      onClick={analyzeHistoricalData}
                      disabled={loading || !inputs.ticker || !inputs.strikePrice || !inputs.totalPremium}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                        </span>
                      ) : (
                        'Calculate Profitability'
                      )}
                    </Button>
                  </div>

                  {/* Info notices (yellow/amber) */}
                  {notices.length > 0 && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          {notices.map((notice, i) => (
                            <div key={i} className="text-sm text-amber-800">{notice}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Errors (red) */}
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-800">
                          {typeof error === 'string' ? error : error}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Results Section */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-5 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-gray-800">Analysis Results</h2>

                  {breakevens && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-gray-700 mb-3">Breakeven Points</h3>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-green-600">
                            ${breakevens.upper.toFixed(2)}
                          </div>
                          <div className="text-sm text-green-700">
                            +{breakevens.upperPct.toFixed(2)}%
                          </div>
                          <div className="text-xs text-gray-600">Upper Breakeven</div>
                        </div>
                        <div className="text-center p-3 bg-red-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-red-600">
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
                          <Badge variant="default" className="bg-green-600 text-white">
                            {results.aboveUpper} ({results.aboveUpperPct.toFixed(1)}%)
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                          <span className="text-sm text-gray-600">Moves Below Lower Breakeven:</span>
                          <Badge variant="default" className="bg-red-600 text-white">
                            {results.belowLower} ({results.belowLowerPct.toFixed(1)}%)
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                          <span className="text-sm text-gray-600">Total Profitable Moves:</span>
                          <Badge variant="default" className="bg-blue-600 text-white">
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
                          Based on historical data, this straddle strategy would have been profitable{' '}
                          <span className="font-semibold">{results.profitableRate.toFixed(1)}%</span>{' '}
                          of the time over {results.totalSamples} historical periods
                          {results.historyYears ? ` (~${results.historyYears} years)` : ''}.
                        </p>
                        {results.dataQuality === 'low' && (
                          <p className="text-xs text-yellow-600 mt-2">
                            Limited history available — results may be less reliable.
                          </p>
                        )}
                        {results.dataQuality === 'limited' && (
                          <p className="text-xs text-yellow-600 mt-2">
                            Very limited history — this stock may be recently listed. Treat results with caution.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {loading && (
                    <div className="text-center py-12">
                      <Loader2 className="h-8 w-8 text-green-600 animate-spin mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Analyzing historical price movements...</p>
                    </div>
                  )}

                  {!results && !loading && (
                    <div className="text-center text-gray-500 py-8 sm:py-12">
                      <p className="text-sm sm:text-base">Enter your strategy parameters and click "Calculate Profitability" to see the analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Charts Section — full width below */}
            {results && breakevens && (
              <div className="mt-6 sm:mt-8 space-y-6">
                <InteractiveOptionsChart
                  strategyType="straddle"
                  inputs={inputs}
                  results={results}
                  metrics={breakevens}
                  isMobile={typeof window !== 'undefined' && window.innerWidth < 640}
                  onInputChange={(field, value) => setInputs(prev => ({ ...prev, [field]: value }))}
                />
                <StraddleChart results={results} breakevens={breakevens} />
              </div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
};

export default StraddleCalculator;
