import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Info,
  Loader2,
  Search,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  Trophy
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import Header from '../components/Header';
import Footer from './Footer';
import StraddleChart from '../components/StraddleChart';
import InteractiveOptionsChart from '../components/InteractiveOptionsChart';
import AskAIButton from '../components/AskAIButton';
import { track } from '../../lib/analytics';

const STRATEGY_LABELS = {
  call: 'Long Call',
  put: 'Long Put',
  straddle: 'ATM Straddle'
};

const STRATEGY_BLURBS = {
  call: 'Directional bullish — wins if price closes above strike + premium.',
  put: 'Directional bearish — wins if price closes below strike − premium.',
  straddle: 'Non-directional — wins on a large move either way.'
};

const EMPTY_INPUTS = {
  ticker: '',
  currentPrice: '',
  expirationDate: ''
};

export default function OptionsCalculator() {
  const router = useRouter();
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState([]);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const debounceRef = useRef(null);

  // -- API helpers ---------------------------------------------------------
  const fetchCurrentPrice = async (ticker) => {
    try {
      const response = await fetch(`/api/stock-price?ticker=${ticker.toUpperCase()}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.price;
    } catch (err) {
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
    } catch {}
  };

  // -- Ticker lookup (debounced) -------------------------------------------
  const lookupTicker = useCallback((value) => {
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
          setInputs((prev) => ({
            ...prev,
            currentPrice: price.toFixed(2),
            expirationDate: ''
          }));
          await fetchAvailableExpirations(value);
        } else {
          setError('Ticker not found. Check the symbol.');
        }
      } catch {
        setError('Failed to fetch ticker data.');
      } finally {
        setFetchingPrice(false);
      }
    }, 600);
  }, []);

  const handleTickerChange = (value) => {
    const upper = value.toUpperCase().replace(/[^A-Z]/g, '');
    setInputs((prev) => ({ ...prev, ticker: upper }));
    if (upper.length >= 1) lookupTicker(upper);
  };

  const handleTickerKeyDown = (e) => {
    if (e.key === 'Enter' && inputs.ticker.length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      lookupTicker(inputs.ticker);
    }
  };

  const handleExpirationChange = (value) => {
    setInputs((prev) => ({ ...prev, expirationDate: value }));
    setNotices([]);
    setError('');
    setResults(null);
  };

  // -- URL params pre-fill (ticker) ----------------------------------------
  useEffect(() => {
    if (!router.isReady) return;
    const { ticker: t } = router.query;
    if (t && typeof t === 'string') {
      const upper = t.toUpperCase();
      setInputs((prev) => ({ ...prev, ticker: upper }));
      lookupTicker(upper);
    }
  }, [router.isReady, router.query.ticker, lookupTicker]);

  useEffect(() => {
    track('calculator_view');
  }, []);

  // -- Run analysis: fetch all 3 strategies, pick the strongest ------------
  const runAnalysis = async () => {
    if (!inputs.ticker || !inputs.expirationDate) {
      setError('Pick a ticker and expiration first.');
      return;
    }
    setLoading(true);
    setError('');
    setNotices([]);
    setResults(null);
    track('calculator_run_best_strategy', { ticker: inputs.ticker });

    try {
      const response = await fetch(
        `/api/options-best-strategy?ticker=${inputs.ticker.toUpperCase()}&expiration=${inputs.expirationDate}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      if (!data.available) {
        setError(data.reason || 'No data available for this ticker and expiration.');
        return;
      }
      setResults(data);
      const newNotices = [];
      if (data.requestedExpiration && data.expiration !== data.requestedExpiration) {
        newNotices.push(
          `Using closest available expiration ${data.expiration} (requested ${data.requestedExpiration}).`
        );
      }
      setNotices(newNotices);
    } catch (err) {
      setError('Failed to analyze: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // -- Render helpers ------------------------------------------------------
  const formatExpDate = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const daysUntil = (s) => {
    if (!s) return 0;
    const d = new Date(s + 'T12:00:00');
    return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  };

  // Derived: winner breakdown for the visual P/L chart.
  const winner = results?.winner || null;
  const winnerStrategy = winner?.strategy || null;
  const winnerBreakevens = useMemo(() => {
    if (!winner) return null;
    const strike = winner.quote?.strikePrice;
    const premium = winner.quote?.premium;
    if (!strike || !premium) return null;
    if (winnerStrategy === 'call') {
      return {
        upper: strike + premium,
        lower: null,
        upperPct: (premium / strike) * 100,
        lowerPct: null,
        maxLoss: premium
      };
    }
    if (winnerStrategy === 'put') {
      return {
        upper: null,
        lower: strike - premium,
        upperPct: null,
        lowerPct: -(premium / strike) * 100,
        maxLoss: premium
      };
    }
    return {
      upper: strike + premium,
      lower: strike - premium,
      upperPct: (premium / strike) * 100,
      lowerPct: -(premium / strike) * 100,
      maxLoss: premium
    };
  }, [winner, winnerStrategy]);

  const winnerDte = winner ? daysUntil(winner.quote.expiration) : 0;

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Volatility Calculator | KAHF Capital</title>
        <meta
          name="description"
          content="Score any volatility setup against ~3 years of historical price moves. ATM strike, real Polygon premium, daily refresh."
        />
      </Head>
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Title row */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-gray-900 text-white text-[11px] font-semibold uppercase tracking-wider mb-3">
                <Sparkles className="h-3 w-3 text-green-400" /> AI Volatility Analyst
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight tracking-tight flex items-center gap-2">
                Volatility Calculator
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className="p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                  title="How it works"
                >
                  <Info className="h-5 w-5" />
                </button>
              </h1>
              <p className="text-base text-gray-600 mt-1">
                Enter a ticker. We find the best volatility play and score it against ~3 years of real price history.
              </p>
            </div>
            {inputs.ticker && (
              <AskAIButton
                prompt={`Run a full volatility read on ${inputs.ticker} at ~30 DTE. Which strategy has the best historical edge right now and why?`}
                ticker={inputs.ticker}
                source="calculator"
                variant="primary"
                size="md"
                className="flex-shrink-0 hidden sm:inline-flex"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI read on {inputs.ticker}
                </span>
              </AskAIButton>
            )}
          </div>

          {showInfo && (
            <div className="mt-4 max-w-3xl bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">How the calculator works</h3>
              <div className="text-sm text-green-700 space-y-2">
                <p>
                  Enter a ticker and pick an expiration. We pull the live ATM strike + real options prices from Polygon for every volatility setup that pencils out, then count how often the underlying actually moved past each breakeven over ~3 years of N-day rolling windows.
                </p>
                <p>
                  The setup with the highest historical hit rate wins. We surface it as the recommendation, with the runners-up shown for context — so you see the math behind the pick.
                </p>
                <p className="text-xs text-green-600 italic">
                  Hit rate is historical, not a forecast. Liquidity, IV regime, and event risk matter — ask KAHF AI for the full read.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 py-8 sm:py-12 px-4 rounded-xl">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 sm:gap-8">
              {/* Inputs */}
              <div className="border border-gray-200 hover:shadow-lg transition-shadow duration-200 bg-white rounded-lg">
                <div className="p-5 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-gray-800">
                    Find the best play
                  </h2>

                  <div className="space-y-4">
                    {/* Ticker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Stock Ticker *</label>
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

                    {/* Current Price (read-only display, just for context) */}
                    {inputs.currentPrice && (
                      <div className="p-3 bg-gray-50 rounded-lg text-sm">
                        <span className="text-gray-600">Current price: </span>
                        <span className="font-semibold text-gray-900">${inputs.currentPrice}</span>
                      </div>
                    )}

                    {/* Expiration */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expiration Date *
                      </label>
                      {availableExpirations.length > 0 ? (
                        <div className="relative">
                          <select
                            value={inputs.expirationDate}
                            onChange={(e) => handleExpirationChange(e.target.value)}
                            className="flex h-10 w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Select expiration date...</option>
                            {availableExpirations.map((exp) => (
                              <option key={exp} value={exp}>
                                {formatExpDate(exp)} ({daysUntil(exp)}d)
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <Input
                          type="date"
                          value={inputs.expirationDate}
                          onChange={(e) => handleExpirationChange(e.target.value)}
                          className="w-full"
                          disabled={!inputs.ticker || fetchingPrice}
                        />
                      )}
                      <p className="text-xs text-gray-500 mt-1.5">
                        ~30 DTE typically gives the best signal-to-noise.
                      </p>
                    </div>

                    <Button
                      onClick={runAnalysis}
                      disabled={loading || !inputs.ticker || !inputs.expirationDate}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Scoring all strategies…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Sparkles className="h-4 w-4" /> Find the best strategy
                        </span>
                      )}
                    </Button>
                  </div>

                  {notices.length > 0 && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          {notices.map((n, i) => (
                            <div key={i} className="text-sm text-amber-800">
                              {n}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-800">{error}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Results */}
              <div className="space-y-4">
                {loading && (
                  <div className="border border-gray-200 bg-white rounded-lg p-8 sm:p-12 text-center">
                    <Loader2 className="h-8 w-8 text-green-600 animate-spin mx-auto mb-3" />
                    <p className="text-gray-700 font-medium">Pulling live quotes…</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Running all three strategies against ~3 years of historical windows.
                    </p>
                  </div>
                )}

                {!results && !loading && (
                  <div className="border border-dashed border-gray-300 bg-white rounded-lg p-8 sm:p-12 text-center">
                    <Trophy className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">
                      Enter a ticker and expiration — we&apos;ll score every volatility setup and surface the strongest.
                    </p>
                  </div>
                )}

                {results && winner && (
                  <>
                    {/* Winner card */}
                    <div className="border-2 border-green-500 bg-gradient-to-br from-green-50 to-white rounded-lg overflow-hidden">
                      <div className="bg-green-600 text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        <Trophy className="h-3.5 w-3.5" />
                        Best historical edge
                      </div>
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                          <h3 className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                            {STRATEGY_LABELS[winner.strategy]}
                          </h3>
                          <span className="text-sm text-gray-500">on ${results.ticker}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-5">
                          {STRATEGY_BLURBS[winner.strategy]}
                        </p>

                        {/* Core stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                          <Stat label="Hit rate" value={`${winner.analysis.successRate.toFixed(1)}%`} highlight />
                          <Stat label="Strike (ATM)" value={`$${winner.quote.strikePrice.toFixed(2)}`} />
                          <Stat label="Premium" value={`$${winner.quote.premium.toFixed(2)}`} />
                          <Stat label="DTE" value={`${winnerDte}d`} />
                        </div>

                        {/* Breakevens */}
                        {winnerBreakevens && (
                          <div className="mb-5">
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                              Breakeven{winner.strategy === 'straddle' ? 's' : ''}
                            </div>
                            <div className={`grid gap-3 ${winner.strategy === 'straddle' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              {winnerBreakevens.upper !== null && (
                                <div className="p-3 bg-green-100/60 rounded-lg">
                                  <div className="text-lg font-bold text-green-700">${winnerBreakevens.upper.toFixed(2)}</div>
                                  <div className="text-xs text-green-700">+{winnerBreakevens.upperPct.toFixed(2)}% upside</div>
                                </div>
                              )}
                              {winnerBreakevens.lower !== null && (
                                <div className="p-3 bg-red-100/60 rounded-lg">
                                  <div className="text-lg font-bold text-red-700">${winnerBreakevens.lower.toFixed(2)}</div>
                                  <div className="text-xs text-red-700">{winnerBreakevens.lowerPct.toFixed(2)}% downside</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Backtest summary */}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                          Over the last <strong>{winner.analysis.historyYears} years</strong>, this setup would have been profitable{' '}
                          <strong>{winner.analysis.totalProfitable} of {winner.analysis.totalSamples}</strong> times{' '}
                          ({winner.analysis.successRate.toFixed(1)}%).
                          {winner.analysis.dataQuality === 'low' && (
                            <span className="text-blue-700"> Limited sample — treat as a soft signal.</span>
                          )}
                          {winner.analysis.dataQuality === 'limited' && (
                            <span className="text-blue-700"> Very thin history (recently-listed?). Caution.</span>
                          )}
                        </div>

                        {inputs.ticker && (
                          <div className="mt-4">
                            <AskAIButton
                              prompt={`The strongest historical setup on ${inputs.ticker} is a ${STRATEGY_LABELS[winner.strategy]} at $${winner.quote.strikePrice} (${winnerDte}d, premium $${winner.quote.premium.toFixed(2)}) — ${winner.analysis.successRate.toFixed(1)}% hit rate over ${winner.analysis.historyYears} years. Give me a tradeable read: IV vs realized, dark pool flow, catalyst, and a trade / watch / skip verdict.`}
                              ticker={inputs.ticker}
                              source="calculator_winner"
                              variant="primary"
                              size="md"
                              className="w-full justify-center"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4" /> Grade this trade with KAHF AI
                              </span>
                            </AskAIButton>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Runners-up */}
                    {results.candidates.length > 1 && (
                      <div className="border border-gray-200 bg-white rounded-lg p-5 sm:p-6">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                          Also considered
                        </h4>
                        <div className="space-y-2">
                          {results.candidates
                            .filter((c) => c.strategy !== winner.strategy)
                            .sort((a, b) => b.analysis.successRate - a.analysis.successRate)
                            .map((c) => (
                              <div
                                key={c.strategy}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                              >
                                <div>
                                  <div className="font-semibold text-gray-900">{STRATEGY_LABELS[c.strategy]}</div>
                                  <div className="text-xs text-gray-500">
                                    Strike ${c.quote.strikePrice.toFixed(2)} · Premium ${c.quote.premium.toFixed(2)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="text-gray-700">
                                    {c.analysis.successRate.toFixed(1)}% hit rate
                                  </Badge>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {c.analysis.totalProfitable}/{c.analysis.totalSamples} samples
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-3 italic">
                          The winner is chosen on highest historical hit rate. Ties break on sample size, then lower premium.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Chart (only for the winner if it's a straddle) */}
            {winner && winnerBreakevens && winner.strategy === 'straddle' && (
              <div className="mt-6 sm:mt-8 space-y-6">
                <InteractiveOptionsChart
                  strategyType="straddle"
                  inputs={{
                    ticker: results.ticker,
                    strikePrice: String(winner.quote.strikePrice),
                    premium: String(winner.quote.premium),
                    callPrice: winner.quote.callPrice != null ? String(winner.quote.callPrice) : '',
                    putPrice: winner.quote.putPrice != null ? String(winner.quote.putPrice) : '',
                    totalPremium: String(winner.quote.premium)
                  }}
                  results={winner.analysis}
                  metrics={{
                    upperBreakeven: winnerBreakevens.upper,
                    lowerBreakeven: winnerBreakevens.lower
                  }}
                  isMobile={typeof window !== 'undefined' && window.innerWidth < 640}
                  onInputChange={() => {}}
                />
                <StraddleChart
                  results={winner.analysis}
                  breakevens={{
                    upper: winnerBreakevens.upper,
                    lower: winnerBreakevens.lower,
                    upperPct: winnerBreakevens.upperPct,
                    lowerPct: winnerBreakevens.lowerPct
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Cross-link to AI + scanner */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/scanner" className="group p-5 bg-white border border-gray-200 rounded-xl hover:border-green-300 hover:shadow-md transition-all">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1">Find a candidate</div>
            <div className="font-bold text-gray-900 group-hover:text-green-700 transition-colors">Dark Pool Scanner →</div>
            <p className="text-sm text-gray-600 mt-1">Tickers with unusual institutional volume today.</p>
          </Link>
          <Link href="/kahf-ai" className="group p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl hover:from-black hover:to-gray-900 transition-all">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-300 mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Skip the calculator</div>
            <div className="font-bold">Let KAHF AI grade it for you →</div>
            <p className="text-sm text-gray-300 mt-1">The full read — IV vs realized, dark pool flow, catalyst direction, and a clear verdict.</p>
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${highlight ? 'text-green-100' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-lg sm:text-xl font-bold mt-0.5 ${highlight ? '' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
