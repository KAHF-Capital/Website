/**
 * KAHF Data MCP Server
 *
 * Implements the Model Context Protocol over HTTP (JSON-RPC) so the chat
 * backend can call KAHF data tools on demand.
 *
 * Transport: Streamable HTTP, JSON responses (no SSE required for stateless tools).
 * Auth: Bearer token via Authorization header. Set MCP_AUTH_TOKEN env var.
 *
 * The chat backend wires this in via:
 *   mcp_servers: [{
 *     type: 'url',
 *     url: 'https://yourdomain/api/mcp',
 *     name: 'kahf-data',
 *     authorization_token: process.env.MCP_AUTH_TOKEN
 *   }]
 */

import { getScannerSnapshot } from '../../lib/scanner-snapshot';
import { getPublicTrackRecord } from '../../lib/track-record-public.js';
import { getCatalystCalendar } from '../../lib/benzinga-calendar.js';
import { getTickerHistory, getScannerDay, getRecentSignalBoards } from '../../lib/scanner-history';
import { VOLUME_RATIO_METHOD } from '../../lib/scanner-math';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';
import { getOptionsSuccessRate, getAllStrategyAnalyses, STRATEGIES } from '../../lib/options-analysis-service.js';
import {
  POLYGON_API_BASE,
  SCANNER_MIN_VOLUME,
  SCANNER_MIN_PRICE,
  SIGNAL_MIN_VOLUME_RATIO,
  detectCatalysts,
  summarizeTicker,
  passesScannerFilters
} from '../../lib/scanner-signals';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'kahf-data';
const SERVER_VERSION = '1.0.0';

// -------------- Tool implementations --------------

function isPastAsOf(asOfDate) {
  return typeof asOfDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
    && asOfDate < new Date().toISOString().slice(0, 10);
}

function toHistoryDay(row) {
  return {
    date: row.date,
    darkPoolVolume: row.total_volume,
    darkPoolValue: row.total_value,
    darkPoolAvgPrice: typeof row.avg_price === 'number' ? Number(row.avg_price.toFixed(2)) : null,
    darkPoolTradeCount: row.trade_count,
    avg7DayDarkPoolVolume: row.avg_7day_volume,
    volumeRatio: row.volume_ratio,
    windowDays: row.window_days,
    windowStart: row.window_start
  };
}

async function tool_get_scanner_signals({ minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO, limit = 10, includeCurrentPrice = true, asOfDate } = {}) {
  if (asOfDate) {
    const day = await getScannerDay(asOfDate, {
      minVolumeRatio,
      limit,
      universe: 'signals',
      includeCurrentPrice: false
    });
    return {
      ...day,
      method: VOLUME_RATIO_METHOD,
      signals: (day.rows || []).map((row) => ({
        ticker: row.ticker,
        darkPoolVolume: row.total_volume,
        darkPoolValue: row.total_value,
        darkPoolAvgPrice: typeof row.avg_price === 'number' ? Number(row.avg_price.toFixed(2)) : null,
        darkPoolTradeCount: row.trade_count,
        avg7DayDarkPoolVolume: row.avg_7day_volume,
        volumeRatio: row.volume_ratio
      }))
    };
  }
  const snapshot = await getScannerSnapshot();
  if (!snapshot) return { available: false, reason: 'No scanner files' };
  if (!snapshot.tickers?.length) return { available: false, reason: 'Latest scanner empty' };
  const signals = snapshot.tickers
    .map((t) => summarizeTicker(t))
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
    date: snapshot.date,
    filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE, minVolumeRatio },
    fieldGlossary: {
      darkPoolAvgPrice: 'Volume-weighted avg dark pool price today (matches Scanner UI Price column).',
      currentStockPrice: 'Last regular-session close from Polygon.',
      volumeRatio: 'Today darkPoolVolume / 7-day avg, format as "Nx".'
    },
    signals
  };
}

async function tool_get_recurring_signals({ minDaysInTop = 2, lookbackDays = 10, minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO, asOfDate } = {}) {
  const boards = await getRecentSignalBoards({
    asOf: asOfDate || null,
    days: Math.max(1, Math.min(Number(lookbackDays) || 10, 40)),
    minVolumeRatio,
    limitPerDay: 5
  });
  if (!boards.available) return { available: false, reason: boards.reason || 'No scanner files', lookahead: false };
  const appearances = {};
  for (const session of boards.sessions) {
    for (const row of session.top || []) {
      if (!appearances[row.ticker]) {
        appearances[row.ticker] = { ticker: row.ticker, daysInTop: 0, dates: [], maxRatio: 0 };
      }
      appearances[row.ticker].daysInTop += 1;
      appearances[row.ticker].dates.push(session.date);
      appearances[row.ticker].maxRatio = Math.max(appearances[row.ticker].maxRatio, row.volumeRatio || 0);
    }
  }
  const recurring = Object.values(appearances)
    .filter((entry) => entry.daysInTop >= minDaysInTop)
    .sort((a, b) => b.daysInTop - a.daysInTop || b.maxRatio - a.maxRatio);
  return { available: true, lookahead: false, asOf: boards.asOf, method: VOLUME_RATIO_METHOD, lookbackDays, minDaysInTop, recurring };
}

async function tool_get_scanner_history({ ticker, days, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const history = await getTickerHistory(ticker, { asOf: asOfDate || null });
  let rows = history.days || [];
  const capped = days != null && Number(days) > 0;
  if (capped) rows = rows.slice(-Math.max(1, Number(days)));
  return {
    ticker: history.ticker,
    available: history.available,
    lookahead: false,
    method: VOLUME_RATIO_METHOD,
    asOf: history.asOf,
    firstDate: history.firstDate,
    lastDate: history.lastDate,
    dayCount: rows.length,
    archiveDayCount: history.dayCount,
    daysWithheldAfterAsOf: history.daysWithheldAfterAsOf || 0,
    complete: !capped,
    reason: history.reason,
    history: rows.map(toHistoryDay)
  };
}

async function tool_get_scanner_day({ date, ticker, universe = 'signals', minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO, limit = 25, offset = 0, includeHistory = false } = {}) {
  if (!date) throw new Error('date is required (YYYY-MM-DD)');
  const day = await getScannerDay(date, {
    ticker,
    universe: universe === 'all' ? 'all' : 'signals',
    minVolumeRatio: universe === 'all' ? null : minVolumeRatio,
    limit,
    offset,
    includeHistory
  });
  return {
    ...day,
    method: VOLUME_RATIO_METHOD,
    rows: (day.rows || []).map((row) => ({
      ticker: row.ticker,
      ...toHistoryDay({ ...row, date: day.date })
    }))
  };
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

async function tool_get_options_analysis({ ticker, strategy = 'straddle', asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const strat = String(strategy).toLowerCase();

  // Special value "all" — return call + put + straddle in one shot.
  if (strat === 'all') {
    const all = await getAllStrategyAnalyses(sym, { asOfDate: asOfDate || null });
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
  const result = await getOptionsSuccessRate(sym, { strategy: strat, asOfDate: asOfDate || null });
  if (!result) return { ticker: sym, strategy: strat, unavailable: true, reason: 'Options data unavailable' };
  return result;
}

async function tool_get_stock_price({ ticker, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };

  if (isPastAsOf(asOfDate)) {
    try {
      const start = new Date(new Date(`${asOfDate}T12:00:00Z`).getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const history = await getHistoricalStockData(sym, start, asOfDate);
      const bar = [...history].reverse().find((day) => day.date <= asOfDate);
      if (!bar) return { ticker: sym, asOfDate, unavailable: true, lookahead: false, reason: 'No close on or before that date' };
      return {
        ticker: sym,
        price: bar.close,
        asOf: bar.date,
        requestedAsOf: asOfDate,
        lookahead: false,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        source: 'historical daily close on or before asOfDate'
      };
    } catch (e) {
      return { ticker: sym, asOfDate, unavailable: true, lookahead: false, reason: e.message };
    }
  }

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

async function tool_get_intraday_chart({ ticker, timespan = 'minute', multiplier = 15, days = 1, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };

  const allowedTimespans = ['minute', 'hour', 'day'];
  if (!allowedTimespans.includes(timespan)) {
    throw new Error(`timespan must be one of: ${allowedTimespans.join(', ')}`);
  }
  const lookbackDays = Math.max(1, Math.min(days, 30));
  const end = isPastAsOf(asOfDate) ? new Date(`${asOfDate}T12:00:00Z`) : new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - lookbackDays);
  const fromStr = start.toISOString().slice(0, 10);
  const toStr = isPastAsOf(asOfDate) ? asOfDate : end.toISOString().slice(0, 10);

  try {
    const data = await polygonFetch(
      `/v2/aggs/ticker/${encodeURIComponent(sym)}/range/${Math.max(1, multiplier)}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=500`
    );
    const bars = (data.results || []).map((b) => ({
      t: new Date(b.t).toISOString(),
      o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw
    })).filter((bar) => !isPastAsOf(asOfDate) || bar.t.slice(0, 10) <= asOfDate);
    return {
      ticker: sym,
      timespan, multiplier,
      from: fromStr, to: toStr,
      asOfDate: asOfDate || null,
      lookahead: false,
      count: bars.length,
      bars: bars.slice(0, 100),
      note: bars.length > 100 ? 'Truncated to 100 most recent bars on or before the cutoff.' : null
    };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_options_chain({ ticker, expirationDate, strikeWindowPct = 10, contractType, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (isPastAsOf(asOfDate)) {
    return {
      ticker: sym,
      asOfDate,
      unavailable: true,
      lookahead: false,
      reason: 'The live options chain is today\'s market. It is withheld for a past signal so it is not mistaken for the chain on that date.'
    };
  }
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

async function tool_get_option_quote({ optionTicker, ticker, asOfDate } = {}) {
  if (isPastAsOf(asOfDate)) {
    return {
      optionTicker,
      asOfDate,
      unavailable: true,
      lookahead: false,
      reason: 'A live option quote is today\'s market. It is withheld for a past signal.'
    };
  }
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

async function tool_get_news({ ticker, limit = 5, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const cutoff = asOfDate ? `&published_utc.lte=${encodeURIComponent(`${asOfDate}T23:59:59Z`)}` : '';
    const url = `${POLYGON_API_BASE}/v2/reference/news?ticker=${encodeURIComponent(sym)}&limit=${Math.min(limit, 10)}&order=desc&sort=published_utc&apiKey=${process.env.POLYGON_API_KEY}${cutoff}`;
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
    }).filter((item) => !asOfDate || !item.publishedAt || item.publishedAt.slice(0, 10) <= asOfDate);
    return { ticker: sym, asOfDate: asOfDate || null, lookahead: false, news, catalysts: [...new Set(news.flatMap((n) => n.catalysts))] };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_news_scanner({ days = 30, ticker, eventType } = {}) {
  const requested = Number(days);
  const windowDays = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 90) : 30;
  const calendar = await getCatalystCalendar({ days: windowDays });
  const sym = ticker ? String(ticker).toUpperCase().trim() : '';
  const kind = eventType ? String(eventType).toLowerCase().trim() : '';
  const events = (calendar.events || []).filter((event) => {
    if (sym && event.ticker !== sym) return false;
    if (kind && kind !== 'all' && event.eventType !== kind) return false;
    return true;
  }).map((event) => ({
    ticker: event.ticker,
    name: event.name || null,
    eventType: event.eventType,
    eventLabel: event.eventLabel,
    eventDate: event.eventDate,
    session: event.session || null,
    dateStatus: event.dateStatus || null,
    detail: event.detail || null,
    importance: event.importance ?? null
  }));
  return {
    source: 'news-scanner',
    from: calendar.from,
    to: calendar.to,
    days: windowDays,
    count: events.length,
    events,
    note: 'Same upcoming board as the News Scanner page. eventType is earnings, fda, ma, dividend, macro, split, or ipo. dateStatus is confirmed, announced, or estimated.'
  };
}

async function tool_get_track_record({ ticker } = {}) {
  const record = await getPublicTrackRecord();
  const sym = ticker ? String(ticker).toUpperCase().trim() : '';
  const rows = sym ? record.rows.filter((r) => r.ticker === sym) : record.rows;
  return {
    summary: record.summary,
    count: rows.length,
    rows,
    note: 'Same reads as the public track record. returnPct is the marked options return. holdingDays is calendar days from the signal date through the exit, or through today if the read is still open. Calls and puts are held to expiry. Straddles exit at +40% or -30%.'
  };
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
        minVolumeRatio: { type: 'number', description: 'Minimum volume ratio (that session vs its own trailing 7-day average). Default 2.0.', default: 2.0 },
        limit: { type: 'integer', description: 'Max signals to return (1-25).', default: 10 },
        includeCurrentPrice: { type: 'boolean', description: 'Fetch the live stock price. Ignored when asOfDate is a past session.', default: true },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Omit for today. For a past signal this returns that session only, with no later data.' }
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
        lookbackDays: { type: 'integer', description: 'How many sessions back to look, ending at asOfDate or today. Default 10, max 40.', default: 10 },
        minVolumeRatio: { type: 'number', description: 'Minimum point-in-time volume ratio per session. Default 2.0.', default: 2.0 },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. The lookback ends on this date and cannot see later sessions.' }
      }
    },
    handler: tool_get_recurring_signals
  },
  {
    name: 'get_scanner_history',
    description:
      'Return the FULL dark-pool history for one ticker: share volume, average price, dollar value, trade count, and point-in-time volume ratio on every archived date. Ratios never use a later session. Pass asOfDate to withhold every date after a past signal. Omit days to return the entire tape.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL).' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. History stops on this date. Later sessions are withheld.' },
        days: { type: 'integer', description: 'Optional cap on the most recent sessions returned. Omit for the full history.' }
      }
    },
    handler: tool_get_scanner_history
  },
  {
    name: 'get_scanner_day',
    description:
      'Return one dark-pool session. Use this to see who printed on a date, with each ticker\'s volume, average price, and point-in-time volume ratio. universe "signals" applies the scanner filters. universe "all" pages every ticker that printed. Pass ticker to get one name, and includeHistory to attach that ticker\'s full tape through the session.',
    inputSchema: {
      type: 'object',
      required: ['date'],
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD. If that calendar day had no session, the prior session is used and later days are not.' },
        ticker: { type: 'string', description: 'Optional. Limit the board to one ticker.' },
        universe: { type: 'string', enum: ['signals', 'all'], description: 'signals = scanner filters. all = every ticker that printed, paged.', default: 'signals' },
        minVolumeRatio: { type: 'number', description: 'Used when universe is signals. Default 2.0.', default: 2.0 },
        limit: { type: 'integer', description: 'Page size. Default 25.', default: 25 },
        offset: { type: 'integer', description: 'Page offset. Default 0.', default: 0 },
        includeHistory: { type: 'boolean', description: 'When ticker is set, also return the full history through this session.', default: false }
      }
    },
    handler: tool_get_scanner_day
  },
  {
    name: 'get_track_record',
    description:
      'Return the public track record: every scored read with ticker, structure (Long Call, Long Put, or ATM Straddle), holding period, and marked return. This is the same record as /wins. Pass ticker to limit the rows to one symbol. Quote returnPct and holdingPeriod verbatim. A ticker with count 0 was not a scored read.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Optional. Limit rows to this symbol, e.g. AAPL.' }
      }
    },
    handler: tool_get_track_record
  },
  {
    name: 'get_news_scanner',
    description:
      'Return the News Scanner calendar: upcoming earnings, FDA, M&A, dividends, macro, splits, and IPOs that already have a date. Same events as the News Scanner page. Pass ticker and/or eventType to narrow it. Quote eventDate, dateStatus, and detail verbatim. Do not invent a catalyst date that is not in the result.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many calendar days ahead, including today. Default 30. Max 90.', default: 30 },
        ticker: { type: 'string', description: 'Optional. Limit events to this symbol.' },
        eventType: { type: 'string', enum: ['all', 'earnings', 'fda', 'ma', 'dividend', 'macro', 'split', 'ipo'], description: 'Optional event filter. Default all.' }
      }
    },
    handler: tool_get_news_scanner
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
        },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Hit rate uses stock history only through this date. Premium and IV remain today\'s live quote.' }
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
      'Return a price for a ticker. With no asOfDate, this is the live snapshot (15-min delayed) and an asOf timestamp. With asOfDate in the past, this is the daily close on or before that date — not today\'s price.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Required when discussing a past signal.' }
      }
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
      'Return company-level reference data for a ticker: name, type (CS / ETF), market cap, sector (SIC description), exchange, shares outstanding, description, list date. Use this for context (sector classification, market cap tier) and to see whether a name is a common stock or an ETF.',
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
        days: { type: 'integer', description: 'Lookback days (1-30). Default 1.', default: 1 },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Bars after this date are dropped.' }
      }
    },
    handler: tool_get_intraday_chart
  },
  {
    name: 'get_options_chain',
    description:
      'Return a snapshot of the options chain for a ticker — strikes near ATM, with per-contract bid/ask, last trade, day OHLCV, open interest, IV, and Greeks (delta/gamma/theta/vega). Use this to quote a real strike, premium, IV, and Greeks. Do not use it to tell the user which contract to trade. Specify `expirationDate` (YYYY-MM-DD) to focus on one expiry; otherwise returns all expiries within the strike window. `strikeWindowPct` (default 10) limits to ±N% of the spot price.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        expirationDate: { type: 'string', description: 'YYYY-MM-DD (optional). If omitted, returns all expirations within the strike window.' },
        strikeWindowPct: { type: 'number', description: 'Half-width of the strike window as a percent of spot (default 10).', default: 10 },
        contractType: { type: 'string', enum: ['call', 'put'], description: 'Filter to one leg.' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. A past date withholds the live chain so it is not treated as that day\'s market.' }
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
        ticker: { type: 'string', description: 'Underlying ticker (optional; will be parsed from optionTicker).' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. A past date withholds the live quote.' }
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
        limit: { type: 'integer', description: 'Max headlines (1-10). Default 5.', default: 5 },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Headlines published after this date are dropped.' }
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
