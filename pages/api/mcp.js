/**
 * KAHF Data MCP Server
 *
 * Implements the Model Context Protocol over HTTP (JSON-RPC) so Anthropic
 * Claude (or any MCP client) can call KAHF data tools on demand.
 *
 * Transport: Streamable HTTP, JSON responses (no SSE required for stateless tools).
 * Auth: Bearer token via Authorization header. Set MCP_AUTH_TOKEN env var.
 *
 * Anthropic Messages API wires this in via:
 *   mcp_servers: [{
 *     type: 'url',
 *     url: 'https://yourdomain/api/mcp',
 *     name: 'kahf-data',
 *     authorization_token: process.env.MCP_AUTH_TOKEN
 *   }]
 * with header: 'anthropic-beta: mcp-client-2025-04-04'
 */

import { listDataFiles, getDataFile } from '../../lib/blob-data';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';
import { getOptionsSuccessRate, getAllStrategyAnalyses, STRATEGIES } from '../../lib/options-analysis-service.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'kahf-data';
const SERVER_VERSION = '1.0.0';

const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');
const SIGNAL_MIN_VOLUME_RATIO = parseFloat(process.env.KAHF_AI_MIN_VOLUME_RATIO || '2.0');

const POLYGON_API_BASE = 'https://api.massive.com';
const CATALYST_KEYWORDS = [
  { kind: 'earnings', words: ['earnings', 'q1 results', 'q2 results', 'q3 results', 'q4 results', 'eps', 'guidance', 'pre-announce', 'preliminary results'] },
  { kind: 'fda', words: ['fda', 'phase 1', 'phase 2', 'phase 3', 'clinical trial', 'approval', 'pdufa', 'breakthrough designation'] },
  { kind: 'm&a', words: ['acquire', 'acquisition', 'merger', 'buyout', 'takeover', 'tender offer'] },
  { kind: 'analyst', words: ['upgrade', 'downgrade', 'price target', 'initiates coverage', 'reiterates'] },
  { kind: 'product', words: ['launch', 'unveil', 'announces partnership', 'contract win', 'patent'] },
  { kind: 'capital', words: ['buyback', 'share repurchase', 'dividend', 'secondary offering', 'spin-off', 'split'] },
  { kind: 'macro', words: ['cpi', 'fomc', 'fed minutes', 'jobs report', 'payrolls'] },
  { kind: 'legal', words: ['lawsuit', 'settlement', 'investigation', 'doj', 'sec charges'] }
];

function detectCatalysts(text) {
  if (!text) return [];
  const lowered = text.toLowerCase();
  const hits = new Set();
  for (const group of CATALYST_KEYWORDS) {
    if (group.words.some((word) => lowered.includes(word))) hits.add(group.kind);
  }
  return [...hits];
}

function summarizeTicker(ticker, avg7DayVolume) {
  const ratio = avg7DayVolume > 0 ? Number((ticker.total_volume / avg7DayVolume).toFixed(2)) : null;
  const avgPriceRounded = typeof ticker.avg_price === 'number' ? Number(ticker.avg_price.toFixed(2)) : null;
  return {
    ticker: ticker.ticker,
    darkPoolVolume: ticker.total_volume,
    darkPoolValue: ticker.total_value,
    darkPoolAvgPrice: avgPriceRounded,
    darkPoolTradeCount: ticker.trade_count,
    avg7DayDarkPoolVolume: avg7DayVolume,
    volumeRatio: ratio
  };
}

function passesScannerFilters(summary) {
  return (
    typeof summary.darkPoolValue === 'number' &&
    summary.darkPoolValue >= SCANNER_MIN_VOLUME &&
    typeof summary.darkPoolAvgPrice === 'number' &&
    summary.darkPoolAvgPrice >= SCANNER_MIN_PRICE
  );
}

// -------------- Tool implementations --------------

async function loadScannerWindow(days) {
  const files = await listDataFiles();
  if (files.length === 0) return { files: [], windowFiles: [], data: {} };
  const windowFiles = files.slice(0, Math.max(1, Math.min(days, 30)));
  const averageFiles = files.slice(0, 7);
  const data = {};
  for (const file of windowFiles) {
    try {
      data[file.filename] = await getDataFile(file.url);
    } catch (error) {
      console.warn(`MCP: skipping scanner file ${file.filename}:`, error.message);
    }
  }
  return { files, windowFiles, averageFiles, data };
}

function compute7DayAvg(averageFiles, dataMap) {
  const totals = {};
  const counts = {};
  for (const file of averageFiles) {
    const day = dataMap[file.filename];
    if (!day?.tickers) continue;
    for (const ticker of day.tickers) {
      totals[ticker.ticker] = (totals[ticker.ticker] || 0) + ticker.total_volume;
      counts[ticker.ticker] = (counts[ticker.ticker] || 0) + 1;
    }
  }
  return (sym) => {
    const c = counts[sym] || 0;
    return c > 0 ? Math.round((totals[sym] || 0) / c) : 0;
  };
}

async function tool_get_scanner_signals({ minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO, limit = 10, includeCurrentPrice = true } = {}) {
  const { windowFiles, averageFiles, data } = await loadScannerWindow(7);
  if (windowFiles.length === 0) return { available: false, reason: 'No scanner files' };
  const latest = windowFiles[0];
  const latestData = data[latest.filename];
  if (!latestData?.tickers) return { available: false, reason: 'Latest scanner empty' };
  const avgFor = compute7DayAvg(averageFiles, data);
  const signals = latestData.tickers
    .map((t) => summarizeTicker(t, avgFor(t.ticker)))
    .filter(passesScannerFilters)
    .filter((s) => s.volumeRatio !== null && s.volumeRatio >= minVolumeRatio)
    .sort((a, b) => b.volumeRatio - a.volumeRatio)
    .slice(0, Math.max(1, Math.min(limit, 25)));

  if (includeCurrentPrice && process.env.POLYGON_API_KEY) {
    await Promise.all(signals.map(async (sig) => {
      try {
        const price = await getCurrentStockPrice(sig.ticker);
        sig.currentStockPrice = typeof price === 'number' ? Number(price.toFixed(2)) : null;
      } catch {
        sig.currentStockPrice = null;
      }
    }));
  }

  return {
    available: true,
    sourceEndpoint: '/api/darkpool-trades (same as Scanner page)',
    date: latest.filename.replace('.json', ''),
    filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE, minVolumeRatio },
    fieldGlossary: {
      darkPoolAvgPrice: 'Volume-weighted avg dark pool price today (matches Scanner UI Price column).',
      currentStockPrice: 'Last regular-session close from Polygon.',
      volumeRatio: 'Today darkPoolVolume / 7-day avg, format as "Nx".'
    },
    signals
  };
}

async function tool_get_recurring_signals({ minDaysInTop = 2, lookbackDays = 5, minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO } = {}) {
  const { windowFiles, averageFiles, data } = await loadScannerWindow(Math.max(lookbackDays, 5));
  if (windowFiles.length === 0) return { available: false, reason: 'No scanner files' };
  const avgFor = compute7DayAvg(averageFiles, data);
  const appearances = {};
  for (let i = 0; i < Math.min(windowFiles.length, lookbackDays); i++) {
    const file = windowFiles[i];
    const day = data[file.filename];
    if (!day?.tickers) continue;
    const date = file.filename.replace('.json', '');
    const top = day.tickers
      .map((t) => summarizeTicker(t, avgFor(t.ticker)))
      .filter(passesScannerFilters)
      .filter((s) => s.volumeRatio !== null && s.volumeRatio >= minVolumeRatio)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, 5);
    for (const s of top) {
      if (!appearances[s.ticker]) appearances[s.ticker] = { ticker: s.ticker, daysInTop: 0, dates: [], maxRatio: 0 };
      appearances[s.ticker].daysInTop += 1;
      appearances[s.ticker].dates.push(date);
      appearances[s.ticker].maxRatio = Math.max(appearances[s.ticker].maxRatio, s.volumeRatio);
    }
  }
  const recurring = Object.values(appearances)
    .filter((e) => e.daysInTop >= minDaysInTop)
    .sort((a, b) => b.daysInTop - a.daysInTop || b.maxRatio - a.maxRatio);
  return { available: true, lookbackDays, minDaysInTop, recurring };
}

async function tool_get_scanner_history({ ticker, days = 14 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const { windowFiles, data } = await loadScannerWindow(Math.max(days, 1));
  const history = [];
  for (const file of windowFiles) {
    const day = data[file.filename];
    if (!day?.tickers) continue;
    const match = day.tickers.find((t) => t.ticker === sym);
    if (match) {
      history.push({
        date: file.filename.replace('.json', ''),
        darkPoolVolume: match.total_volume,
        darkPoolValue: match.total_value,
        darkPoolAvgPrice: typeof match.avg_price === 'number' ? Number(match.avg_price.toFixed(2)) : null,
        darkPoolTradeCount: match.trade_count
      });
    }
  }
  return { ticker: sym, days, history };
}

async function tool_get_prior_range({ ticker, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  if (!process.env.POLYGON_API_KEY) return { ticker, unavailable: true, reason: 'Polygon API key not configured' };
  const sym = ticker.toUpperCase();
  const endDate = asOfDate || new Date().toISOString().split('T')[0];
  const startDate = new Date(new Date(`${endDate}T12:00:00`).getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  try {
    const hist = await getHistoricalStockData(sym, startDate, endDate);
    const prior = [...hist].reverse().find((d) => d.date < endDate);
    if (!prior) return { ticker: sym, unavailable: true, reason: 'No prior day data' };
    return { ticker: sym, asOfDate: endDate, priorDay: prior };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_straddle_analysis({ ticker } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const result = await getStraddleSuccessRate(sym);
  if (!result) return { ticker: sym, unavailable: true, reason: 'Straddle data unavailable' };
  return { ticker: sym, ...result };
}

async function tool_get_options_analysis({ ticker, strategy = 'straddle' } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const strat = String(strategy).toLowerCase();

  // Special value "all" — return call + put + straddle in one shot.
  if (strat === 'all') {
    const all = await getAllStrategyAnalyses(sym);
    if (!all.call && !all.put && !all.straddle) {
      return { ticker: sym, unavailable: true, reason: 'No options data' };
    }
    const ranked = [all.call, all.put, all.straddle]
      .filter(Boolean)
      .sort((a, b) => b.successRate - a.successRate);
    return {
      ticker: sym,
      strategies: all,
      bestStrategy: ranked[0]?.strategy,
      bestSuccessRate: ranked[0]?.successRate
    };
  }

  if (!STRATEGIES.includes(strat)) {
    throw new Error(`strategy must be one of: ${STRATEGIES.join(', ')}, or "all"`);
  }
  const result = await getOptionsSuccessRate(sym, { strategy: strat });
  if (!result) return { ticker: sym, strategy: strat, unavailable: true, reason: 'Options data unavailable' };
  return result;
}

async function tool_get_stock_price({ ticker } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };

  // Prefer the snapshot endpoint — gives last trade + today's OHLCV + prev day in one call
  // (15-min delayed on Stocks Developer plan, but freshest available).
  try {
    const url = `${POLYGON_API_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}?apiKey=${process.env.POLYGON_API_KEY}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const snap = data.ticker;
      if (snap) {
        // Polygon returns 0 for fields that have no data (e.g. weekends, halts).
        // Use a "first positive number" helper rather than `??` which doesn't catch 0.
        const firstPositive = (...xs) => xs.find((v) => typeof v === 'number' && v > 0) ?? null;

        const lastTrade = firstPositive(snap.lastTrade?.p);
        const lastQuoteMid =
          snap.lastQuote?.b > 0 && snap.lastQuote?.a > 0
            ? (snap.lastQuote.b + snap.lastQuote.a) / 2
            : null;
        const price = firstPositive(lastTrade, lastQuoteMid, snap.day?.c, snap.prevDay?.c);
        if (price) {
          const lastTradeTs = snap.lastTrade?.t ? new Date(Math.floor(snap.lastTrade.t / 1e6)).toISOString() : null;
          return {
            ticker: sym,
            price: Number(price.toFixed(4)),
            asOf: lastTradeTs,
            today: snap.day && snap.day.c ? {
              open: snap.day.o, high: snap.day.h, low: snap.day.l, close: snap.day.c, volume: snap.day.v
            } : null,
            prevDay: snap.prevDay && snap.prevDay.c ? {
              open: snap.prevDay.o, high: snap.prevDay.h, low: snap.prevDay.l, close: snap.prevDay.c, volume: snap.prevDay.v
            } : null,
            changeFromPrev: snap.todaysChange ?? null,
            changePctFromPrev: snap.todaysChangePerc ?? null,
            source: 'polygon snapshot (15-min delayed)'
          };
        }
      }
    }
  } catch (e) {
    console.warn(`Snapshot failed for ${sym}, falling back to prev close:`, e.message);
  }

  // Fallback: previous trading-day close.
  try {
    const price = await getCurrentStockPrice(sym);
    return { ticker: sym, price, source: 'polygon prev close (fallback)' };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// New Polygon-backed tools (Stocks Developer + Options Basic)
// ---------------------------------------------------------------------------

async function polygonFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${POLYGON_API_BASE}${path}${sep}apiKey=${process.env.POLYGON_API_KEY}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Polygon ${res.status}: ${body.slice(0, 160)}`);
  }
  return res.json();
}

async function tool_get_market_status() {
  if (!process.env.POLYGON_API_KEY) return { unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const data = await polygonFetch('/v1/marketstatus/now');
    return {
      market: data.market || null,
      serverTime: data.serverTime || null,
      exchanges: data.exchanges || null,
      currencies: data.currencies || null,
      afterHours: data.afterHours ?? null,
      earlyHours: data.earlyHours ?? null
    };
  } catch (e) {
    return { unavailable: true, reason: e.message };
  }
}

async function tool_get_ticker_details({ ticker } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const data = await polygonFetch(`/v3/reference/tickers/${encodeURIComponent(sym)}`);
    const r = data.results || {};
    return {
      ticker: sym,
      name: r.name || null,
      type: r.type || null,
      market: r.market || null,
      primaryExchange: r.primary_exchange || null,
      currency: r.currency_name || null,
      cik: r.cik || null,
      composite_figi: r.composite_figi || null,
      sic_description: r.sic_description || null,
      market_cap: r.market_cap || null,
      share_class_shares_outstanding: r.share_class_shares_outstanding || null,
      weighted_shares_outstanding: r.weighted_shares_outstanding || null,
      description: r.description ? String(r.description).slice(0, 600) : null,
      list_date: r.list_date || null,
      homepage_url: r.homepage_url || null
    };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_intraday_chart({ ticker, timespan = 'minute', multiplier = 15, days = 1 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };

  const allowedTimespans = ['minute', 'hour', 'day'];
  if (!allowedTimespans.includes(timespan)) {
    throw new Error(`timespan must be one of: ${allowedTimespans.join(', ')}`);
  }
  const lookbackDays = Math.max(1, Math.min(days, 30));
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - lookbackDays);
  const fromStr = start.toISOString().slice(0, 10);
  const toStr = end.toISOString().slice(0, 10);

  try {
    const data = await polygonFetch(
      `/v2/aggs/ticker/${encodeURIComponent(sym)}/range/${Math.max(1, multiplier)}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=500`
    );
    const bars = (data.results || []).map((b) => ({
      t: new Date(b.t).toISOString(),
      o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw
    }));
    return {
      ticker: sym,
      timespan, multiplier,
      from: fromStr, to: toStr,
      count: bars.length,
      bars: bars.slice(0, 100), // limit response size; bars come back desc so newest first
      note: bars.length > 100 ? 'Truncated to 100 most recent bars.' : null
    };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_options_chain({ ticker, expirationDate, strikeWindowPct = 10, contractType } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };

  try {
    const params = new URLSearchParams({ limit: '250' });
    if (expirationDate) params.set('expiration_date', expirationDate);
    if (contractType && ['call', 'put'].includes(contractType)) params.set('contract_type', contractType);

    const data = await polygonFetch(`/v3/snapshot/options/${encodeURIComponent(sym)}?${params}`);
    const results = data.results || [];
    if (results.length === 0) {
      return { ticker: sym, expirationDate: expirationDate || null, count: 0, contracts: [], reason: 'No contracts in snapshot' };
    }

    // Get underlying price to filter the chain to a window around ATM.
    const underlyingPrice = results.find((r) => r.underlying_asset?.price)?.underlying_asset?.price || null;
    const windowFraction = Math.min(Math.max(strikeWindowPct, 1), 50) / 100;

    const filtered = underlyingPrice
      ? results.filter((r) => {
          const k = r.details?.strike_price;
          if (typeof k !== 'number') return false;
          return Math.abs(k - underlyingPrice) / underlyingPrice <= windowFraction;
        })
      : results;

    const contracts = filtered.slice(0, 80).map((r) => ({
      ticker: r.details?.ticker || null,
      contract_type: r.details?.contract_type || null,
      strike_price: r.details?.strike_price ?? null,
      expiration_date: r.details?.expiration_date || null,
      last_quote: r.last_quote ? {
        bid: r.last_quote.bid, ask: r.last_quote.ask, midpoint: r.last_quote.midpoint
      } : null,
      last_trade: r.last_trade ? { price: r.last_trade.price, size: r.last_trade.size } : null,
      day: r.day ? {
        close: r.day.close, volume: r.day.volume, vwap: r.day.vwap, change_percent: r.day.change_percent
      } : null,
      open_interest: r.open_interest ?? null,
      implied_volatility: r.implied_volatility ?? null,
      greeks: r.greeks ? {
        delta: r.greeks.delta, gamma: r.greeks.gamma, theta: r.greeks.theta, vega: r.greeks.vega
      } : null
    }));

    return {
      ticker: sym,
      underlyingPrice,
      expirationDate: expirationDate || null,
      strikeWindowPct: windowFraction * 100,
      count: contracts.length,
      contracts
    };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_option_quote({ optionTicker, ticker } = {}) {
  if (!optionTicker) throw new Error('optionTicker is required (e.g. O:NVDA260619C00130000)');
  const underlying = (ticker || optionTicker.replace(/^O:/, '').match(/^[A-Z]+/)?.[0] || '').toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { optionTicker, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const data = await polygonFetch(`/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(optionTicker)}`);
    const r = data.results;
    if (!r) return { optionTicker, underlying, unavailable: true, reason: 'No snapshot data' };
    return {
      optionTicker,
      underlying,
      underlyingPrice: r.underlying_asset?.price || null,
      details: r.details,
      last_quote: r.last_quote,
      last_trade: r.last_trade,
      day: r.day,
      open_interest: r.open_interest ?? null,
      implied_volatility: r.implied_volatility ?? null,
      greeks: r.greeks
    };
  } catch (e) {
    return { optionTicker, underlying, unavailable: true, reason: e.message };
  }
}

async function tool_get_top_movers({ direction = 'gainers', limit = 10 } = {}) {
  if (!process.env.POLYGON_API_KEY) return { unavailable: true, reason: 'Polygon API key not configured' };
  const dir = String(direction).toLowerCase();
  if (!['gainers', 'losers'].includes(dir)) {
    throw new Error('direction must be "gainers" or "losers"');
  }
  try {
    const data = await polygonFetch(`/v2/snapshot/locale/us/markets/stocks/${dir}`);
    const items = (data.tickers || []).slice(0, Math.max(1, Math.min(limit, 25)));
    const movers = items.map((t) => ({
      ticker: t.ticker,
      price: t.lastTrade?.p ?? t.day?.c ?? null,
      changePct: t.todaysChangePerc ?? null,
      change: t.todaysChange ?? null,
      volume: t.day?.v ?? null,
      prevClose: t.prevDay?.c ?? null
    }));
    return { direction: dir, count: movers.length, movers };
  } catch (e) {
    return { unavailable: true, reason: e.message };
  }
}

async function tool_get_dividends({ ticker, limit = 5 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const data = await polygonFetch(`/v3/reference/dividends?ticker=${encodeURIComponent(sym)}&limit=${Math.min(Math.max(limit, 1), 20)}&order=desc&sort=ex_dividend_date`);
    const items = (data.results || []).map((d) => ({
      cash_amount: d.cash_amount,
      currency: d.currency,
      declaration_date: d.declaration_date,
      ex_dividend_date: d.ex_dividend_date,
      record_date: d.record_date,
      pay_date: d.pay_date,
      frequency: d.frequency,
      dividend_type: d.dividend_type
    }));
    return { ticker: sym, count: items.length, dividends: items };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_news({ ticker, limit = 5 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const url = `${POLYGON_API_BASE}/v2/reference/news?ticker=${encodeURIComponent(sym)}&limit=${Math.min(limit, 10)}&order=desc&sort=published_utc&apiKey=${process.env.POLYGON_API_KEY}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Polygon news ${res.status}`);
    const data = await res.json();
    const news = (data.results || []).slice(0, limit).map((item) => {
      const text = `${item.title || ''} ${item.description || ''}`;
      return {
        title: item.title,
        publisher: item.publisher?.name || item.author || null,
        publishedAt: item.published_utc || null,
        url: item.article_url || null,
        catalysts: detectCatalysts(text),
        keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6) : []
      };
    });
    return { ticker: sym, news, catalysts: [...new Set(news.flatMap((n) => n.catalysts))] };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

// -------------- Tool registry --------------

const TOOLS = [
  {
    name: 'get_scanner_signals',
    description:
      'Return today\'s scanner signals (tradable tickers above the volume-ratio threshold), sorted by volume ratio. THIS IS THE SAME DATA THE SCANNER PAGE SHOWS. Each signal includes darkPoolAvgPrice (Scanner Price column), currentStockPrice (last close), volumeRatio, darkPoolVolume, darkPoolValue. ALWAYS use these verbatim - never invent numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        minVolumeRatio: { type: 'number', description: 'Minimum volume ratio (today vs 7-day avg). Default 2.0.', default: 2.0 },
        limit: { type: 'integer', description: 'Max signals to return (1-25).', default: 10 },
        includeCurrentPrice: { type: 'boolean', description: 'Whether to fetch the live last-close stock price for each signal. Default true.', default: true }
      }
    },
    handler: tool_get_scanner_signals
  },
  {
    name: 'get_recurring_signals',
    description:
      'Return tickers that appeared in the daily scanner top list multiple days within the lookback window. Use this to identify sustained dark-pool interest, not just one-day spikes.',
    inputSchema: {
      type: 'object',
      properties: {
        minDaysInTop: { type: 'integer', description: 'Min number of days a ticker must be in the top list. Default 2.', default: 2 },
        lookbackDays: { type: 'integer', description: 'How many days back to look. Default 5.', default: 5 },
        minVolumeRatio: { type: 'number', description: 'Minimum volume ratio per day. Default 2.0.', default: 2.0 }
      }
    },
    handler: tool_get_recurring_signals
  },
  {
    name: 'get_scanner_history',
    description:
      'Return the dark-pool scanner history (per day) for a single ticker over the requested window. Use this to inspect trend (volume building / fading) and average price drift.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL).' },
        days: { type: 'integer', description: 'Lookback days. Default 14, max 30.', default: 14 }
      }
    },
    handler: tool_get_scanner_history
  },
  {
    name: 'get_prior_range',
    description:
      'Return the prior trading day high/low/close for a ticker. Use this to determine whether the current dark-pool average price is above, inside, or below the prior range.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' }
      }
    },
    handler: tool_get_prior_range
  },
  {
    name: 'get_options_analysis',
    description:
      'Return the 30-day ATM analysis for a ticker for a CALL, PUT, or STRADDLE — success rate, premium, breakevens, DTE, sample size, options liquidity (volume/OI/spread), and IV. Pass strategy="all" to get call + put + straddle in one call (returns `strategies`, `bestStrategy`, `bestSuccessRate`). Use this to pick the best directional read for a setup.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        strategy: {
          type: 'string',
          enum: ['call', 'put', 'straddle', 'all'],
          default: 'straddle',
          description: 'Which leg to analyze. Pass "all" to get call + put + straddle in one response.'
        }
      }
    },
    handler: tool_get_options_analysis
  },
  {
    name: 'get_straddle_analysis',
    description:
      'LEGACY. Use get_options_analysis instead. Returns the same payload as get_options_analysis(ticker, "straddle").',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    },
    handler: tool_get_straddle_analysis
  },
  {
    name: 'get_stock_price',
    description:
      'Return a FRESH price snapshot for a ticker (last trade, today\'s OHLCV, prev day, and intraday change). Uses Polygon snapshot endpoint — 15-min delayed but the freshest data available without an exchange feed. Includes `asOf` timestamp. PREFER THIS over guessing or using stale numbers from chat history.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    },
    handler: tool_get_stock_price
  },
  {
    name: 'get_market_status',
    description:
      'Return whether the US stock market is currently open, in pre-market, after-hours, or closed. Use this BEFORE quoting "current" prices so you can frame them correctly (e.g. "last trade at 3:58pm ET" vs "Friday close").',
    inputSchema: { type: 'object', properties: {} },
    handler: tool_get_market_status
  },
  {
    name: 'get_ticker_details',
    description:
      'Return company-level reference data for a ticker: name, type (CS / ETF), market cap, sector (SIC description), exchange, shares outstanding, description, list date. Use this for context (sector classification, market cap tier) and to confirm a ticker is a tradeable common stock before recommending it.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    },
    handler: tool_get_ticker_details
  },
  {
    name: 'get_intraday_chart',
    description:
      'Return intraday OHLCV bars for a ticker. Useful for confirming a setup ("is the stock breaking out today?") or computing realized move vs IV. Defaults: 15-minute bars over the last 1 day. Supports `timespan`: minute|hour|day, `multiplier` (1-60), and `days` (1-30 lookback). Returns up to 100 most recent bars (newest first).',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        timespan: { type: 'string', enum: ['minute', 'hour', 'day'], default: 'minute' },
        multiplier: { type: 'integer', description: 'Bar size multiplier (e.g. timespan=minute, multiplier=15 → 15-min bars).', default: 15 },
        days: { type: 'integer', description: 'Lookback days (1-30). Default 1.', default: 1 }
      }
    },
    handler: tool_get_intraday_chart
  },
  {
    name: 'get_options_chain',
    description:
      'Return a snapshot of the options chain for a ticker — strikes near ATM, with per-contract bid/ask, last trade, day OHLCV, open interest, IV, and Greeks (delta/gamma/theta/vega). Use this to PICK the right strike/expiration for a recommendation. Specify `expirationDate` (YYYY-MM-DD) to focus on one expiry; otherwise returns all expiries within the strike window. `strikeWindowPct` (default 10) limits to ±N% of the spot price.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        expirationDate: { type: 'string', description: 'YYYY-MM-DD (optional). If omitted, returns all expirations within the strike window.' },
        strikeWindowPct: { type: 'number', description: 'Half-width of the strike window as a percent of spot (default 10).', default: 10 },
        contractType: { type: 'string', enum: ['call', 'put'], description: 'Filter to one leg.' }
      }
    },
    handler: tool_get_options_chain
  },
  {
    name: 'get_option_quote',
    description:
      'Return a live snapshot for a specific option contract (bid/ask, last trade, OI, IV, Greeks). Use this AFTER you\'ve picked the contract — e.g. after `get_options_chain` returns a contract ticker — to quote the latest premium.',
    inputSchema: {
      type: 'object',
      required: ['optionTicker'],
      properties: {
        optionTicker: { type: 'string', description: 'Full options ticker, e.g. "O:NVDA260619C00130000".' },
        ticker: { type: 'string', description: 'Underlying ticker (optional; will be parsed from optionTicker).' }
      }
    },
    handler: tool_get_option_quote
  },
  {
    name: 'get_top_movers',
    description:
      'Return today\'s biggest gainers or losers in the US stock market with current price and percent change. Use this for market color or to see if a scanner ticker is also on the macro mover list.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['gainers', 'losers'], default: 'gainers' },
        limit: { type: 'integer', description: 'How many to return (1-25). Default 10.', default: 10 }
      }
    },
    handler: tool_get_top_movers
  },
  {
    name: 'get_dividends',
    description:
      'Return upcoming and historical dividend events for a ticker (ex-date, pay-date, cash amount, frequency). Use this to flag IV-affecting events (large dividends crush calls / boost puts on ex-date).',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        limit: { type: 'integer', description: 'How many records to return (1-20). Default 5.', default: 5 }
      }
    },
    handler: tool_get_dividends
  },
  {
    name: 'get_news',
    description:
      'Return recent news headlines for a ticker, each tagged with detected catalyst categories (earnings, fda, m&a, analyst, product, capital, macro, legal). Use this to find qualitative catalysts.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        limit: { type: 'integer', description: 'Max headlines (1-10). Default 5.', default: 5 }
      }
    },
    handler: tool_get_news
  }
];

// -------------- JSON-RPC handlers --------------

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data = undefined) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

async function handleRpc(message) {
  const { id = null, method, params = {} } = message || {};

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    });
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return null;
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);
    try {
      const data = await tool.handler(args);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        isError: false
      });
    } catch (error) {
      console.error(`MCP tool ${name} failed:`, error);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true
      });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

// -------------- HTTP transport --------------

function isAuthorized(req) {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return true; // dev mode: no auth required
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  return header.slice(7) === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: PROTOCOL_VERSION,
      transport: 'http-jsonrpc',
      tools: TOOLS.map((t) => t.name)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid Bearer token' });
  }

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Empty body' });

  try {
    if (Array.isArray(body)) {
      const responses = [];
      for (const msg of body) {
        const out = await handleRpc(msg);
        if (out) responses.push(out);
      }
      return res.status(200).json(responses);
    }

    const out = await handleRpc(body);
    if (out === null) {
      return res.status(202).end();
    }
    return res.status(200).json(out);
  } catch (error) {
    console.error('MCP handler error:', error);
    return res.status(500).json(rpcError(body?.id || null, -32603, error.message));
  }
}
