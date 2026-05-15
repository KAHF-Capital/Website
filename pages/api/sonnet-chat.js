import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { listDataFiles, getDataFile } from '../../lib/blob-data';
import { getScannerSnapshot } from '../../lib/scanner-snapshot';
import { verifyIdToken, isFirebaseAdminConfigured, getFirestoreAdmin } from '../../lib/firebase-admin';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';

const ANON_LIMIT = parseInt(process.env.KAHF_AI_ANON_MESSAGE_LIMIT || '1', 10);
// Signed-in but not subscribed: small monthly quota (encourages signup, gates Pro).
const FREE_ACCOUNT_LIMIT = parseInt(process.env.KAHF_AI_FREE_ACCOUNT_LIMIT || '5', 10);
const MAX_CONTEXT_TICKERS = 12;
const MAX_STRADDLE_TICKERS = 5;
const MAX_RESEARCH_TICKERS = 5;
const SCANNER_LOOKBACK_DAYS = parseInt(process.env.KAHF_AI_LOOKBACK_DAYS || '5', 10);
const TOP_PER_DAY = 5;

const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');
const SIGNAL_MIN_VOLUME_RATIO = parseFloat(process.env.KAHF_AI_MIN_VOLUME_RATIO || '2.0');

const WEB_SEARCH_ENABLED = (process.env.KAHF_AI_WEB_SEARCH || 'true').toLowerCase() !== 'false';
const WEB_SEARCH_MAX_USES = parseInt(process.env.KAHF_AI_WEB_SEARCH_USES || '3', 10);

const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || (process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/mcp` : '');
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const MCP_ENABLED = (process.env.KAHF_AI_MCP_ENABLED || 'true').toLowerCase() !== 'false' && Boolean(MCP_PUBLIC_URL);

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

const anonymousUsage = new Map();

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 48);
}

function getPeriodKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 2500)
    }))
    .filter((message) => message.content.trim())
    .slice(-10);
}

function extractTickers(messages) {
  const ignored = new Set([
    'A', 'I', 'AI', 'API', 'ATM', 'DTE', 'ETF', 'IV', 'ME', 'MY', 'NO', 'OR',
    'ASK', 'BUY', 'CALL', 'CHAT', 'DARK', 'FOR', 'GET', 'NEWS', 'POOL', 'PRICE',
    'PRO', 'PUT', 'QUICK', 'RESEARCH', 'SELL', 'SETUP', 'SHOW', 'THE', 'TOP',
    'TRADE', 'USD', 'US', 'VOL', 'WHY', 'YOU'
  ]);
  const text = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join(' ');

  const dollarMatches = (text.match(/\$([A-Za-z]{1,5})\b/g) || [])
    .map((token) => token.replace('$', '').toUpperCase());
  const upperMatches = (text.toUpperCase().match(/\b[A-Z]{1,5}\b/g) || []);

  const candidates = [...dollarMatches, ...upperMatches]
    .filter((ticker) => !ignored.has(ticker));
  return [...new Set(candidates)].slice(0, MAX_CONTEXT_TICKERS);
}

async function getIdentity(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const sessionId = String(req.body?.sessionId || '').slice(0, 120);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const forwardedFor = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    return {
      type: 'anonymous',
      key: `anon:${hashValue(`${sessionId}:${forwardedFor}:${userAgent}`)}`,
      tier: 'anonymous',
      limit: ANON_LIMIT,
      isUnlimited: false,
      userData: null
    };
  }

  if (!isFirebaseAdminConfigured()) {
    const error = new Error(
      'Server is not configured for signed-in users. Add a Firebase service account in Vercel env vars (FIREBASE_SERVICE_ACCOUNT_BASE64).'
    );
    error.statusCode = 503;
    throw error;
  }

  const verified = await verifyIdToken(token);
  if (!verified.success) {
    const error = new Error(`Authentication failed: ${verified.error || 'Invalid token'}`);
    error.statusCode = 401;
    throw error;
  }

  // Look up subscription status. Only Pro (subscription.status === 'active') gets unlimited.
  let isPro = false;
  let userData = null;
  try {
    const firestore = getFirestoreAdmin();
    const snap = await firestore.collection('users').doc(verified.uid).get();
    if (snap.exists) {
      userData = snap.data();
      const status = userData?.subscription?.status;
      isPro = status === 'active' || status === 'trialing';
    }
  } catch (err) {
    console.error('[sonnet-chat] Could not read subscription for', verified.uid, err.message);
  }

  if (isPro) {
    return {
      type: 'pro',
      key: `uid:${verified.uid}`,
      uid: verified.uid,
      email: verified.email,
      tier: 'pro',
      limit: null,
      isUnlimited: true,
      userData
    };
  }

  return {
    type: 'free_account',
    key: `uid:${verified.uid}`,
    uid: verified.uid,
    email: verified.email,
    tier: 'free',
    limit: FREE_ACCOUNT_LIMIT,
    isUnlimited: false,
    userData
  };
}

// Persistent monthly usage counter for signed-in free users (survives Vercel cold starts).
async function incrementFirestoreUsage(uid, period, limit) {
  const firestore = getFirestoreAdmin();
  const ref = firestore.collection('users').doc(uid).collection('usage').doc(period);
  return firestore.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const current = snap.exists ? Number(snap.data().count || 0) : 0;
    if (current >= limit) {
      const error = new Error('You\'ve used your free KAHF AI messages this month. Start a 7-day Pro free trial for unlimited access.');
      error.statusCode = 429;
      error.usage = { tier: 'free', limit, used: current, remaining: 0, isUnlimited: false, period };
      throw error;
    }
    const next = current + 1;
    txn.set(ref, { count: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
}

async function reserveUsage(identity) {
  const period = getPeriodKey();

  if (identity.isUnlimited) {
    return {
      tier: identity.tier,
      limit: null,
      used: 0,
      remaining: null,
      isUnlimited: true,
      period
    };
  }

  const limit = identity.limit;

  // Signed-in free users: persist count in Firestore so the limit holds across cold starts.
  if (identity.tier === 'free' && identity.uid) {
    try {
      const used = await incrementFirestoreUsage(identity.uid, period, limit);
      return {
        tier: identity.tier,
        limit,
        used,
        remaining: Math.max(limit - used, 0),
        isUnlimited: false,
        period
      };
    } catch (err) {
      if (err.statusCode === 429) throw err;
      console.error('[sonnet-chat] Firestore usage failed, falling back to in-memory:', err.message);
      // fall through to in-memory below
    }
  }

  // Anonymous (or Firestore fallback): in-memory counter.
  const fallbackKey = `${period}:${identity.key}`;
  const currentCount = anonymousUsage.get(fallbackKey) || 0;
  if (currentCount >= limit) {
    const error = new Error(
      identity.tier === 'free'
        ? 'You\'ve used your free KAHF AI messages this month. Start a 7-day Pro free trial for unlimited access.'
        : 'You used your free KAHF AI message. Sign in or upgrade to Pro for more.'
    );
    error.statusCode = 429;
    error.usage = {
      tier: identity.tier,
      limit,
      used: currentCount,
      remaining: 0,
      isUnlimited: false,
      period
    };
    throw error;
  }

  const nextCount = currentCount + 1;
  anonymousUsage.set(fallbackKey, nextCount);

  return {
    tier: identity.tier,
    limit,
    used: nextCount,
    remaining: Math.max(limit - nextCount, 0),
    isUnlimited: false,
    period
  };
}

function summarizeTicker(ticker, avg7DayVolume) {
  // If the ticker already carries a precomputed ratio (from the shared
  // scanner-snapshot helper), use it verbatim so the AI matches the
  // Scanner UI byte-for-byte. Otherwise fall back to local compute.
  const precomputedRatio = typeof ticker.volume_ratio === 'number' && Number.isFinite(ticker.volume_ratio)
    ? ticker.volume_ratio
    : null;
  const precomputedAvg = typeof ticker.avg_7day_volume === 'number' && ticker.avg_7day_volume > 0
    ? ticker.avg_7day_volume
    : null;

  const avgForRatio = precomputedAvg ?? avg7DayVolume;
  const ratio = precomputedRatio !== null
    ? precomputedRatio
    : avgForRatio > 0
      ? Number((ticker.total_volume / avgForRatio).toFixed(2))
      : null;
  const avgPriceRounded = typeof ticker.avg_price === 'number' ? Number(ticker.avg_price.toFixed(2)) : null;
  return {
    ticker: ticker.ticker,
    darkPoolVolume: ticker.total_volume,
    darkPoolValue: ticker.total_value,
    darkPoolAvgPrice: avgPriceRounded,
    darkPoolTradeCount: ticker.trade_count,
    avg7DayDarkPoolVolume: avgForRatio,
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

async function getPriorRange(ticker, scannerDate) {
  if (!process.env.POLYGON_API_KEY) return null;

  try {
    const endDate = scannerDate || new Date().toISOString().split('T')[0];
    const startDate = new Date(new Date(`${endDate}T12:00:00`).getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const history = await getHistoricalStockData(ticker, startDate, endDate);
    const prior = [...history].reverse().find((day) => day.date < endDate);
    if (!prior) return null;
    return {
      date: prior.date,
      high: prior.high,
      low: prior.low,
      close: prior.close
    };
  } catch (error) {
    console.warn(`Prior range unavailable for ${ticker}:`, error.message);
    return null;
  }
}

async function buildScannerContext(requestedTickers) {
  // Latest-day data + per-ticker 7-day average + volume ratio comes from the
  // SAME helper the Scanner UI uses. This guarantees today's numbers match.
  const snapshot = await getScannerSnapshot();
  if (!snapshot) {
    return {
      available: false,
      reason: 'No scanner files found',
      tradableTickers: [],
      filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE }
    };
  }

  const files = snapshot.files;
  const latestFile = snapshot.latestFile;
  // snapshot.tickers already has avg_7day_volume + volume_ratio baked in.
  const latestData = {
    tickers: snapshot.tickers,
    total_tickers: snapshot.total_tickers,
    total_volume: snapshot.total_volume,
    processed_at: snapshot.last_updated
  };

  if (!latestData.tickers?.length) {
    return {
      available: false,
      reason: 'Latest scanner file has no tickers',
      tradableTickers: [],
      filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE }
    };
  }

  const recentFiles = files.slice(0, 20);
  // averageFiles is still used for the rolling 20-day "recurring signals"
  // pass below; the latest-day numbers no longer depend on it.
  const averageFiles = files.slice(0, 7);
  const volumeTotals = {};
  const volumeCounts = {};
  const requestedSet = new Set(requestedTickers);
  const historyByTicker = {};
  const dailySnapshots = [];
  const tickerAppearances = {};

  for (const [index, file] of recentFiles.entries()) {
    try {
      const data = file.url === latestFile.url ? latestData : await getDataFile(file.url);
      if (!data?.tickers) continue;

      const date = file.filename.replace('.json', '');

      for (const ticker of data.tickers) {
        if (averageFiles.some((averageFile) => averageFile.filename === file.filename)) {
          volumeTotals[ticker.ticker] = (volumeTotals[ticker.ticker] || 0) + ticker.total_volume;
          volumeCounts[ticker.ticker] = (volumeCounts[ticker.ticker] || 0) + 1;
        }

        if (requestedSet.has(ticker.ticker)) {
          if (!historyByTicker[ticker.ticker]) historyByTicker[ticker.ticker] = [];
          historyByTicker[ticker.ticker].push({
            date,
            darkPoolVolume: ticker.total_volume,
            darkPoolAvgPrice: typeof ticker.avg_price === 'number' ? Number(ticker.avg_price.toFixed(2)) : null,
            darkPoolValue: ticker.total_value,
            darkPoolTradeCount: ticker.trade_count
          });
        }
      }

      if (index < SCANNER_LOOKBACK_DAYS) {
        const sevenDayAvg = (ticker) => {
          const c = volumeCounts[ticker] || 0;
          return c > 0 ? Math.round((volumeTotals[ticker] || 0) / c) : 0;
        };

        const summaries = data.tickers
          .map((ticker) => summarizeTicker(ticker, sevenDayAvg(ticker.ticker)))
          .filter(passesScannerFilters)
          .filter((ticker) => ticker.volumeRatio !== null && ticker.volumeRatio >= SIGNAL_MIN_VOLUME_RATIO);

        const top = summaries
          .sort((a, b) => b.volumeRatio - a.volumeRatio)
          .slice(0, TOP_PER_DAY);

        dailySnapshots.push({
          date,
          isLatest: index === 0,
          topByVolumeRatio: top.map((ticker) => ({
            ticker: ticker.ticker,
            volumeRatio: ticker.volumeRatio,
            darkPoolAvgPrice: ticker.darkPoolAvgPrice,
            darkPoolValue: ticker.darkPoolValue
          }))
        });

        for (const ticker of top) {
          if (!tickerAppearances[ticker.ticker]) {
            tickerAppearances[ticker.ticker] = { ticker: ticker.ticker, daysInTop: 0, dates: [], maxRatio: 0 };
          }
          tickerAppearances[ticker.ticker].daysInTop += 1;
          tickerAppearances[ticker.ticker].dates.push(date);
          tickerAppearances[ticker.ticker].maxRatio = Math.max(
            tickerAppearances[ticker.ticker].maxRatio,
            ticker.volumeRatio
          );
        }
      }
    } catch (error) {
      console.warn(`Skipping scanner context file ${file.filename}:`, error.message);
    }
  }

  const averageFor = (ticker) => {
    const count = volumeCounts[ticker] || 0;
    return count > 0 ? Math.round((volumeTotals[ticker] || 0) / count) : 0;
  };

  const allSummaries = latestData.tickers.map((ticker) => summarizeTicker(ticker, averageFor(ticker.ticker)));
  const tradableSummaries = allSummaries.filter(passesScannerFilters);

  const qualifyingSummaries = tradableSummaries
    .filter((ticker) => ticker.volumeRatio !== null && ticker.volumeRatio >= SIGNAL_MIN_VOLUME_RATIO);

  const topSignals = qualifyingSummaries
    .sort((a, b) => b.volumeRatio - a.volumeRatio)
    .slice(0, MAX_CONTEXT_TICKERS);

  const tradableTickerSet = new Set(tradableSummaries.map((ticker) => ticker.ticker));

  const recurringSignals = Object.values(tickerAppearances)
    .filter((entry) => entry.daysInTop >= 2 && entry.maxRatio >= SIGNAL_MIN_VOLUME_RATIO)
    .sort((a, b) => b.daysInTop - a.daysInTop || b.maxRatio - a.maxRatio)
    .slice(0, MAX_CONTEXT_TICKERS);

  const selectedSymbols = [
    ...new Set([
      ...requestedTickers.filter((ticker) => tradableTickerSet.has(ticker)),
      ...topSignals.map((ticker) => ticker.ticker),
      ...recurringSignals.map((entry) => entry.ticker)
    ])
  ].slice(0, MAX_CONTEXT_TICKERS);

  const selectedSignals = await Promise.all(selectedSymbols.map(async (symbol) => {
    const latest = tradableSummaries.find((ticker) => ticker.ticker === symbol);
    if (!latest) return null;
    const [priorRange, currentStockPrice] = await Promise.all([
      getPriorRange(symbol, latestFile.filename.replace('.json', '')),
      getCurrentStockPrice(symbol).catch(() => null)
    ]);
    const recurrence = tickerAppearances[symbol] || null;
    return {
      ...latest,
      currentStockPrice: typeof currentStockPrice === 'number' ? Number(currentStockPrice.toFixed(2)) : null,
      priorRange,
      darkPoolAvgPriceVsPriorRange: priorRange
        ? latest.darkPoolAvgPrice > priorRange.high
          ? 'above prior range'
          : latest.darkPoolAvgPrice < priorRange.low
            ? 'below prior range'
            : 'inside prior range'
        : 'unavailable',
      daysInTopOverLookback: recurrence ? recurrence.daysInTop : 1,
      lookbackDates: recurrence ? recurrence.dates : []
    };
  }));

  const requestedOffScanner = requestedTickers.filter((ticker) => !tradableTickerSet.has(ticker));

  return {
    available: true,
    sourceEndpoint: '/api/darkpool-trades (same data as the Scanner page)',
    date: latestFile.filename.replace('.json', ''),
    lookbackDays: SCANNER_LOOKBACK_DAYS,
    filters: {
      minVolumeUsd: SCANNER_MIN_VOLUME,
      minPrice: SCANNER_MIN_PRICE,
      description: `Tickers must show >= $${(SCANNER_MIN_VOLUME / 1e6).toFixed(0)}M dark pool value and >= $${SCANNER_MIN_PRICE} avg price.`
    },
    fieldGlossary: {
      darkPoolVolume: 'Total share volume of dark pool prints today.',
      darkPoolValue: 'Total dollar value of dark pool prints today (= darkPoolVolume * darkPoolAvgPrice).',
      darkPoolAvgPrice: 'Volume-weighted average dark pool trade price for today, rounded to 2 decimals. THIS IS WHAT THE SCANNER PAGE SHOWS IN ITS "PRICE" COLUMN.',
      currentStockPrice: 'Last regular-session close from Polygon, rounded to 2 decimals. Use this when the user asks for the stock price.',
      volumeRatio: 'Today darkPoolVolume divided by the 7-day avg dark pool volume, rounded to 2 decimals. Display as e.g. "5.27x".',
      avg7DayDarkPoolVolume: '7-day trailing average dark pool volume.',
      priorRange: 'Prior trading day high/low/close from Polygon.',
      darkPoolAvgPriceVsPriorRange: 'Where the darkPoolAvgPrice falls vs. priorRange (above / inside / below).'
    },
    totalTickers: latestData.total_tickers || latestData.tickers.length,
    tradableCount: tradableTickerSet.size,
    totalDarkPoolVolume: latestData.total_volume,
    tradableTickers: [...tradableTickerSet].sort(),
    topSignals,
    selectedSignals: selectedSignals.filter(Boolean),
    dailySnapshots,
    recurringSignals,
    requestedHistory: historyByTicker,
    requestedOffScanner
  };
}

async function buildStraddleContext(tickers) {
  if (!process.env.POLYGON_API_KEY || tickers.length === 0) {
    return {
      available: false,
      reason: process.env.POLYGON_API_KEY ? 'No tickers requested' : 'Polygon API key not configured'
    };
  }

  const analyses = await Promise.all(tickers.slice(0, MAX_STRADDLE_TICKERS).map(async (ticker) => {
    const analysis = await getStraddleSuccessRate(ticker);
    return analysis ? { ticker, ...analysis } : { ticker, unavailable: true };
  }));

  return {
    available: true,
    analyses
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KAHF-Capital-AI/1.0',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Research request failed: ${response.status}`);
  }

  return response.json();
}

function detectCatalysts(text) {
  if (!text) return [];
  const lowered = text.toLowerCase();
  const hits = new Set();
  for (const group of CATALYST_KEYWORDS) {
    for (const word of group.words) {
      if (lowered.includes(word)) {
        hits.add(group.kind);
        break;
      }
    }
  }
  return [...hits];
}

async function getPolygonNews(ticker) {
  if (!process.env.POLYGON_API_KEY) {
    return { ticker, unavailable: true, reason: 'Polygon API key not configured', source: 'polygon' };
  }
  try {
    const data = await fetchJson(
      `${POLYGON_API_BASE}/v2/reference/news?ticker=${encodeURIComponent(ticker)}&limit=8&order=desc&sort=published_utc&apiKey=${process.env.POLYGON_API_KEY}`
    );
    const items = (data.results || []).slice(0, 8);
    if (items.length === 0) {
      return { ticker, source: 'polygon', news: [], catalysts: [] };
    }
    const news = items.map((item) => {
      const titleAndDesc = `${item.title || ''} ${item.description || ''}`;
      return {
        title: item.title,
        publisher: item.publisher?.name || item.author || null,
        publishedAt: item.published_utc || null,
        url: item.article_url || null,
        catalysts: detectCatalysts(titleAndDesc),
        keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6) : []
      };
    });
    const catalysts = [...new Set(news.flatMap((item) => item.catalysts))];
    return { ticker, source: 'polygon', news, catalysts };
  } catch (error) {
    console.warn(`Polygon news unavailable for ${ticker}:`, error.message);
    return { ticker, source: 'polygon', unavailable: true, reason: error.message };
  }
}

async function getYahooFallback(ticker) {
  try {
    const data = await fetchJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=5`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KAHFAI/1.0)',
          Accept: 'application/json,text/plain,*/*'
        }
      }
    );
    const news = (data.news || []).slice(0, 5).map((item) => ({
      title: item.title,
      publisher: item.publisher,
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : null,
      url: item.link,
      catalysts: detectCatalysts(item.title || '')
    }));
    return { ticker, source: 'yahoo', news, catalysts: [...new Set(news.flatMap((n) => n.catalysts))] };
  } catch (error) {
    return { ticker, source: 'yahoo', unavailable: true, reason: error.message };
  }
}

async function getNewsResearch(ticker) {
  const polygon = await getPolygonNews(ticker);
  if (!polygon.unavailable && Array.isArray(polygon.news) && polygon.news.length > 0) {
    return polygon;
  }
  const yahoo = await getYahooFallback(ticker);
  if (!yahoo.unavailable && Array.isArray(yahoo.news) && yahoo.news.length > 0) {
    return yahoo;
  }
  return polygon.unavailable ? polygon : yahoo;
}

async function getPriceResearch(ticker) {
  try {
    if (!process.env.POLYGON_API_KEY) {
      return { ticker, unavailable: true, reason: 'Polygon API key not configured' };
    }

    const price = await getCurrentStockPrice(ticker);
    return {
      ticker,
      price,
      source: 'site price API'
    };
  } catch (error) {
    console.warn(`Price research unavailable for ${ticker}:`, error.message);
    return {
      ticker,
      unavailable: true,
      reason: error.message
    };
  }
}

async function buildResearchContext(tickers) {
  const researchTickers = tickers.slice(0, MAX_RESEARCH_TICKERS);
  const [prices, news] = await Promise.all([
    Promise.all(researchTickers.map(getPriceResearch)),
    Promise.all(researchTickers.map(getNewsResearch))
  ]);

  const catalystMap = {};
  for (const item of news) {
    if (item.catalysts && item.catalysts.length > 0) {
      catalystMap[item.ticker] = item.catalysts;
    }
  }

  return {
    enabled: true,
    scope: 'Polygon news (primary) + Yahoo Finance (fallback) pre-fetched for top scanner tickers. Use the web_search tool for live questions or anything outside this list.',
    webSearchEnabled: WEB_SEARCH_ENABLED,
    prices,
    news,
    catalystMap
  };
}

async function buildMarketContext(messages) {
  const requestedTickers = extractTickers(messages);
  const scanner = await buildScannerContext(requestedTickers);
  const tradableSet = new Set(scanner.tradableTickers || []);

  if (MCP_ENABLED) {
    return {
      requestedTickers,
      scanner,
      straddle: { available: false, reason: 'Use the kahf-data MCP tool `get_straddle_analysis` on demand.' },
      research: {
        enabled: true,
        webSearchEnabled: WEB_SEARCH_ENABLED,
        scope: 'Live data via the kahf-data MCP server tools (get_news, get_stock_price, get_scanner_history, etc.) plus web_search.'
      }
    };
  }

  const tickersForStraddle = (
    requestedTickers.filter((ticker) => tradableSet.has(ticker)).length > 0
      ? requestedTickers.filter((ticker) => tradableSet.has(ticker))
      : scanner.topSignals?.slice(0, MAX_STRADDLE_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const tickersForResearch = (
    requestedTickers.length > 0
      ? requestedTickers
      : scanner.topSignals?.slice(0, MAX_RESEARCH_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const straddle = await buildStraddleContext(tickersForStraddle);
  const research = await buildResearchContext(tickersForResearch);

  return {
    requestedTickers,
    scanner,
    straddle,
    research
  };
}

function buildSystemPrompt() {
  const mcpBlock = MCP_ENABLED
    ? [
        '# Tools (kahf-data MCP server) - PREFER these over relying on context alone',
        'You have direct access to KAHF\'s data via these MCP tools. Call them as needed:',
        '- `get_scanner_signals(minVolumeRatio?, limit?)` - today\'s top scanner candidates.',
        '- `get_recurring_signals(minDaysInTop?, lookbackDays?, minVolumeRatio?)` - tickers in the top list multiple days.',
        '- `get_scanner_history(ticker, days?)` - per-day scanner history for one ticker (max 30 days).',
        '- `get_prior_range(ticker, asOfDate?)` - prior trading day high/low/close.',
        '- `get_straddle_analysis(ticker)` - 30-day ATM straddle premium, success rate, liquidity, IV.',
        '- `get_stock_price(ticker)` - latest close.',
        '- `get_news(ticker, limit?)` - recent headlines tagged with catalyst categories.',
        'Tool-use rules: call the smallest tool you need; chain calls if a question needs multiple data points; never guess values you can fetch.'
      ].join('\n')
    : '';

  return [
    '# Role',
    'You are KAHF AI, a concise volatility-trading assistant for KAHF Capital. Speak like a calm, experienced trader briefing a teammate. Plain English, no jargon dumps, no hype.',

    mcpBlock,

    '# Data you have in the prompt',
    'Scanner snapshot is pre-attached and IS THE SAME DATA THE SCANNER PAGE SHOWS. Use only this for any volume / price numbers about today\'s signals.',
    'Key scanner fields (see `scanner.fieldGlossary` for full definitions): `volumeRatio` (today vs 7-day avg, e.g. 5.27 -> "5.27x"), `darkPoolAvgPrice` (volume-weighted avg of today\'s dark pool prints, matches Scanner UI "Price" column), `currentStockPrice` (last close from Polygon), `priorRange` (yesterday high/low/close).',
    'Lists available: `scanner.tradableTickers`, `scanner.topSignals`, `scanner.recurringSignals`, `scanner.dailySnapshots`, `scanner.selectedSignals`. Anything absent from these lists is already weak.',
    MCP_ENABLED
      ? 'For straddle analysis, news, prior range, and any ticker history beyond what is pre-attached, use the MCP tools above.'
      : 'Straddle analysis and news are pre-fetched for the top scanner tickers.',
    'Web search: you have a `web_search` tool. USE IT for live questions, current events, or to confirm upcoming earnings/FDA dates. Search with concise queries like "AAPL earnings date next".',

    '# Numbers rule (CRITICAL)',
    'Every numeric value you mention (volume ratio, price, premium, success rate, etc.) MUST be quoted verbatim from the data context or returned by a tool call. Do not round, paraphrase, estimate, or invent.',
    'When the user asks for "the price" of a ticker on the scanner, quote `currentStockPrice` from `scanner.selectedSignals[i]` or `scanner.topSignals[i]`. If that field is missing, fetch via `get_stock_price` (MCP) or say "current price unavailable".',
    'When discussing dark pool levels (e.g. avg vs prior range), use `darkPoolAvgPrice`, NEVER confuse it with the live stock price.',
    'When citing a volume ratio, format it as "Nx" with the same precision the data shows (`5.27x`, not `5x` or `5.3x`).',
    'If a number you need is not in the provided data and not fetchable, say "unavailable" in one short clause. Never make one up.',

    '# Universe rule',
    'Only recommend, suggest, or rank tickers in `scanner.tradableTickers` (filters: min $250M dark pool dollar value, min $50 price). If the user names a ticker not on the list, say so in one line, share neutral context (price/news) only, and do not issue a trade idea.',

    '# High-conviction trade criteria (use these to score and filter)',
    'A "good" setup typically has all four:',
    '1. Volume ratio >= 3.0 (today vs 7-day avg). 2x is borderline; 3x+ is unusual; 5x+ is exceptional.',
    '2. Straddle success rate >= 55% with sample size >= 25 ("medium" data quality or better).',
    '3. Liquid options: `straddle.liquidity.rating` is "medium" or "high" (preferred), or call+put OI >= 1,000 and total day volume >= 500. Bid-ask spread under ~10% of premium. Fetch via `get_straddle_analysis` when MCP is enabled.',
    '4. A real qualitative catalyst in the next ~30 days or just hit (earnings, FDA, M&A, analyst action, product launch). Use `get_news` first; if no clear catalyst, run a `web_search` before concluding "no catalyst".',
    'Score each candidate: 4/4 = Trade. 3/4 = Watch. <3 = Skip.',

    '# Multi-day perspective',
    'Always check `scanner.dailySnapshots` and `scanner.recurringSignals`. A ticker that printed 3x+ volume two or three days in a row is a stronger signal than a one-day spike. If a setup from 1-3 days ago still has no catalyst yet has held above the prior range, flag it as still-valid.',

    '# What to show the user (CRITICAL)',
    'NEVER show, list, or name tickers that you would Skip. Only surface Trade or Watch verdicts.',
    'If asked for "top setups" or "find me a trade", evaluate every qualifying candidate silently and respond ONLY with the Trade/Watch winners (max 3). Do not enumerate the rejects or explain who you skipped.',
    'If nothing qualifies as Trade or Watch, say exactly: "No qualifying setups today. Best to wait." then offer ONE concrete next step (e.g., "Want me to look back 3-5 days?" or "I can lower the bar to 2x volume - say the word.").',
    'Never use the word "Skip" in the output. Internal scoring only.',

    '# Output format for trades',
    'For each Trade or Watch you surface, use this exact markdown structure:',
    '**Verdict:** Trade or Watch',
    '**Setup:** one-line summary (ticker, current stock price from `currentStockPrice`, strategy, expiration).',
    '**Dark pool factors:** 1-3 bullets. Quote `volumeRatio` (e.g. "5.27x") and `darkPoolAvgPrice` (e.g. "$182.43") vs prior range verbatim from the data.',
    '**Quantitative factors:** 1-3 bullets. Cite straddle success rate, DTE, premium, liquidity rating - all from the data.',
    '**Qualitative factors:** 1-3 bullets. Cite catalyst type + headline + publish date or web_search source.',
    '**Why now:** one line tying it together.',
    '**Risk note:** one line. Always close each recommendation with: "Research, not financial advice."',

    '# General behavior',
    'Be brief. Bullets over paragraphs. Numbers over adjectives.',
    'Never invent data. If a field is missing or `unavailable: true`, run a web_search first, then say "unavailable" only if the search also turns up nothing.',
    'If the user is new or asks "what is this", give a 3-bullet primer on the dark pool signal and offer one example, no jargon.'
  ].join('\n');
}

function buildUserPrompt(messages, marketContext) {
  const conversation = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  return [
    'Market context JSON (authoritative; ignore anything outside this for trade recommendations):',
    JSON.stringify(marketContext),
    '',
    'Conversation so far:',
    conversation,
    '',
    'Task:',
    '- Answer the latest user message using the market context. Use the web_search tool for live questions or to fill in missing catalysts/news.',
    '- Apply the four high-conviction criteria (volume ratio >= 3x, success rate >= 55%, liquid options, catalyst).',
    '- Show ONLY Trade or Watch verdicts. Never list, name, or describe tickers you would skip. If none qualify, say "No qualifying setups today. Best to wait." and offer one concrete next step.',
    '- Trade recommendations must be limited to tickers in scanner.tradableTickers.',
    '- Use scanner.dailySnapshots and scanner.recurringSignals to consider setups from the past few days that still make sense.'
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    const messages = normalizeMessages(req.body?.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'A latest user message is required' });
    }

    const identity = await getIdentity(req);
    const usage = await reserveUsage(identity);
    const marketContext = await buildMarketContext(messages);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const requestPayload = {
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-7',
      max_tokens: parseInt(process.env.KAHF_AI_MAX_TOKENS || process.env.SONNET_MAX_TOKENS || '1500', 10),
      temperature: parseFloat(process.env.KAHF_AI_TEMPERATURE || '0.15'),
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(messages, marketContext)
        }
      ]
    };

    if (WEB_SEARCH_ENABLED) {
      requestPayload.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: WEB_SEARCH_MAX_USES
        }
      ];
    }

    const requestOptions = {};
    if (MCP_ENABLED) {
      requestPayload.mcp_servers = [
        {
          type: 'url',
          url: MCP_PUBLIC_URL,
          name: 'kahf-data',
          ...(MCP_AUTH_TOKEN ? { authorization_token: MCP_AUTH_TOKEN } : {})
        }
      ];
      requestOptions.headers = { 'anthropic-beta': 'mcp-client-2025-04-04' };
    }

    let completion;
    let mcpDisabledForRetry = false;
    let webSearchDisabledForRetry = false;
    try {
      completion = await anthropic.messages.create(requestPayload, requestOptions);
    } catch (firstError) {
      const msg = firstError.message || '';
      if (MCP_ENABLED && /mcp|mcp_server|mcp-client/i.test(msg)) {
        console.warn('Anthropic MCP connector rejected, retrying without MCP:', msg);
        delete requestPayload.mcp_servers;
        delete requestOptions.headers;
        mcpDisabledForRetry = true;
        try {
          completion = await anthropic.messages.create(requestPayload, requestOptions);
        } catch (secondError) {
          if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(secondError.message || '')) {
            console.warn('Anthropic web_search also rejected, retrying without tools:', secondError.message);
            delete requestPayload.tools;
            webSearchDisabledForRetry = true;
            completion = await anthropic.messages.create(requestPayload, requestOptions);
          } else {
            throw secondError;
          }
        }
      } else if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(msg)) {
        console.warn('Anthropic web_search rejected, retrying without tool:', msg);
        delete requestPayload.tools;
        webSearchDisabledForRetry = true;
        completion = await anthropic.messages.create(requestPayload, requestOptions);
      } else {
        throw firstError;
      }
    }

    const reply = completion.content
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    const contentParts = completion.content || [];
    const webSearchesUsed = contentParts.filter((part) =>
      part.type === 'server_tool_use' || part.type === 'web_search_tool_result'
    ).length;
    const mcpToolUses = contentParts.filter((part) =>
      part.type === 'mcp_tool_use' || part.type === 'mcp_tool_result'
    ).length;
    const mcpToolNames = contentParts
      .filter((part) => part.type === 'mcp_tool_use')
      .map((part) => part.name)
      .filter(Boolean);

    return res.status(200).json({
      reply: reply || 'No response generated.',
      usage,
      context: {
        requestedTickers: marketContext.requestedTickers,
        scannerDate: marketContext.scanner?.date || null,
        scannerFilters: marketContext.scanner?.filters || null,
        tradableCount: marketContext.scanner?.tradableCount || 0,
        webSearchEnabled: WEB_SEARCH_ENABLED && !webSearchDisabledForRetry,
        webSearchesUsed,
        mcpEnabled: MCP_ENABLED && !mcpDisabledForRetry,
        mcpToolUses,
        mcpToolNames
      }
    });
  } catch (error) {
    console.error('KAHF AI chat error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate KAHF AI response',
      usage: error.usage || null
    });
  }
}
