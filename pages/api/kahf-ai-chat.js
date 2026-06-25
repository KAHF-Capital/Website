import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { listDataFiles, getDataFile } from '../../lib/blob-data';
import { getScannerSnapshot } from '../../lib/scanner-snapshot';
import { verifyIdToken, isFirebaseAdminConfigured, getFirestoreAdmin } from '../../lib/firebase-admin';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';
import { getAllStrategyAnalyses } from '../../lib/options-analysis-service.js';

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

// Primary model + automatic fallbacks. If the configured model is unavailable on
// the deployment (retired, typo'd env var, or no org access) Anthropic returns a
// 404 not_found_error. Rather than surface that to the user we fall through this
// list of known-good models so the chat keeps working.
const PRIMARY_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MODEL_FALLBACKS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-7'];

// Opus 4.7+, Opus 5, Sonnet 4.6+, Fable and Mythos all deprecated the
// `temperature` sampling parameter; sending it returns a 400. Only set it for
// older models that still accept it.
function modelSupportsTemperature(model) {
  return !/opus-4-[789]|opus-[5-9]|sonnet-4-[6-9]|sonnet-[5-9]|fable|mythos/i.test(model || '');
}

function isModelUnavailableError(error) {
  const status = error?.status || error?.statusCode;
  return status === 404 || /not_found_error|model:/i.test(error?.message || '');
}

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
  // Common English words that look like tickers but never are. Polygon will 500
  // if we ask for them, so we filter them client-side.
  const ignored = new Set([
    'A', 'AN', 'I', 'AI', 'API', 'ATM', 'DTE', 'ETF', 'IV', 'ME', 'MY', 'NO', 'OR',
    'AND', 'BUT', 'IF', 'IS', 'IT', 'ON', 'TO', 'BE', 'AT', 'IN', 'OF', 'AS', 'BY',
    'WE', 'HE', 'SHE', 'WAS', 'ARE', 'CAN', 'WILL', 'WERE', 'BEEN', 'WHEN', 'WHERE',
    'WHAT', 'WHICH', 'WHO', 'HOW', 'READ', 'GIVE', 'TELL', 'MAKE', 'TAKE', 'SEEN',
    'SEE', 'LOOK', 'HELP', 'NEED', 'WANT', 'LIKE', 'GOOD', 'BAD', 'NEW', 'OLD',
    'NOW', 'THEN', 'JUST', 'ONLY', 'MORE', 'LESS', 'MOST', 'NEXT', 'LAST', 'BEST',
    'WORST', 'HIGH', 'LOW', 'BIG', 'SMALL', 'FULL', 'EMPTY', 'OPEN', 'CLOSE',
    'ASK', 'BUY', 'CALL', 'CHAT', 'DARK', 'FOR', 'GET', 'NEWS', 'POOL', 'PRICE',
    'PRO', 'PUT', 'QUICK', 'RESEARCH', 'SELL', 'SETUP', 'SHOW', 'THE', 'TOP',
    'TRADE', 'USD', 'US', 'VOL', 'WHY', 'YOU', 'KAHF', 'SCAN', 'STOP', 'PLAY',
    'INTO', 'WITH', 'FROM', 'OVER', 'UNDER', 'EACH', 'SOME', 'MANY', 'FEW', 'ANY',
    'ALL', 'BOTH', 'PAST', 'YEAR', 'WEEK', 'DAY', 'HOUR', 'MIN', 'SEC', 'TIME'
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
    console.error('[kahf-ai-chat] Could not read subscription for', verified.uid, err.message);
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
      console.error('[kahf-ai-chat] Firestore usage failed, falling back to in-memory:', err.message);
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

async function buildOptionsContext(tickers) {
  if (!process.env.POLYGON_API_KEY || tickers.length === 0) {
    return {
      available: false,
      reason: process.env.POLYGON_API_KEY ? 'No tickers requested' : 'Polygon API key not configured'
    };
  }

  // For each ticker, score all three strategies (call/put/straddle) so the AI
  // can pick the directional read with the best edge, not just default to straddle.
  const analyses = await Promise.all(
    tickers.slice(0, MAX_STRADDLE_TICKERS).map(async (ticker) => {
      try {
        const strategies = await getAllStrategyAnalyses(ticker);
        if (!strategies.call && !strategies.put && !strategies.straddle) {
          return { ticker, unavailable: true };
        }
        // Best historical edge across the three strategies (for AI ranking).
        const candidates = [strategies.call, strategies.put, strategies.straddle].filter(Boolean);
        const best = candidates.reduce((a, b) => (a.successRate >= b.successRate ? a : b));
        return {
          ticker,
          strategies,
          bestStrategy: best?.strategy,
          bestSuccessRate: best?.successRate,
          flow: deriveFlowSignal(strategies),
          valuation: derivePricedInSignal(strategies)
        };
      } catch (err) {
        console.warn(`[buildOptionsContext] ${ticker} failed:`, err.message);
        return { ticker, unavailable: true, error: err.message };
      }
    })
  );

  return {
    available: true,
    analyses,
    fieldGlossary: {
      strategies: 'For each ticker: { call, put, straddle } each with successRate, breakevens, liquidity, IV, premium, dte.',
      bestStrategy: 'Which of the three (call/put/straddle) has the highest historical hit rate for this ticker at ~30 DTE.',
      bestSuccessRate: 'The hit rate (%) of the best strategy. Cite this verbatim when ranking tickers.',
      flow: 'Options flow direction: cpVolumeRatio (call vol / put vol) and cpOIRatio (call OI / put OI) today, plus lean (bullish/bearish/neutral). >1.3 vol = call-heavy/bullish lean; <0.77 = put-heavy/bearish lean. This is Factor 2 (Directional signal).',
      valuation: 'Priced-in gauge (Factor 5): impliedMovePct = ATM straddle premium / strike (the move the options are pricing); realizedAvgMovePct = average historical move over the same window; pricedInRatio = implied / realized; verdict ("cheap" <0.9, "fair" 0.9-1.2, "rich/priced-in" >1.2). Rich = prefer a spread or pass on naked longs.'
    }
  };
}

// Factor 2 — directional signal from current options flow (call vs put).
function deriveFlowSignal(strategies) {
  const liq = strategies.straddle?.liquidity || strategies.call?.liquidity || strategies.put?.liquidity;
  if (!liq) return { available: false };
  const cv = liq.callVolume || 0;
  const pv = liq.putVolume || 0;
  const co = liq.callOpenInterest || 0;
  const po = liq.putOpenInterest || 0;
  const cpVolumeRatio = pv > 0 ? Number((cv / pv).toFixed(2)) : null;
  const cpOIRatio = po > 0 ? Number((co / po).toFixed(2)) : null;
  let lean = 'neutral';
  const ref = cpVolumeRatio ?? cpOIRatio;
  if (ref != null) {
    if (ref >= 1.3) lean = 'bullish';
    else if (ref <= 0.77) lean = 'bearish';
  }
  return { available: true, cpVolumeRatio, cpOIRatio, lean };
}

// Factor 5 — is the expected move already priced into the options?
function derivePricedInSignal(strategies) {
  const s = strategies.straddle;
  if (!s || !s.strikePrice || !s.premium) return { available: false };
  const impliedMovePct = Number(((s.premium / s.strikePrice) * 100).toFixed(1));
  // Realized average move over the same window (abs of up/down legs).
  const up = Math.abs(s.avgUpMove || 0);
  const down = Math.abs(s.avgDownMove || 0);
  const realizedAvgMovePct = up || down ? Number(((up + down) / 2).toFixed(1)) : null;
  let pricedInRatio = null;
  let verdict = 'unknown';
  if (realizedAvgMovePct && realizedAvgMovePct > 0) {
    pricedInRatio = Number((impliedMovePct / realizedAvgMovePct).toFixed(2));
    verdict = pricedInRatio > 1.2 ? 'rich' : pricedInRatio < 0.9 ? 'cheap' : 'fair';
  }
  return { available: true, impliedMovePct, realizedAvgMovePct, pricedInRatio, verdict };
}

// Backwards-compatible alias so old code that called buildStraddleContext keeps working.
async function buildStraddleContext(tickers) {
  return buildOptionsContext(tickers);
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
      options: { available: false, reason: 'Use the kahf-data MCP tool `get_options_analysis` (strategy: call|put|straddle) on demand.' },
      straddle: { available: false, reason: 'Use the kahf-data MCP tool `get_options_analysis` (strategy: straddle) on demand. (Legacy alias kept for back-compat.)' },
      research: {
        enabled: true,
        webSearchEnabled: WEB_SEARCH_ENABLED,
        scope: 'Live data via the kahf-data MCP server tools (get_news, get_stock_price, get_scanner_history, etc.) plus web_search.'
      }
    };
  }

  const tickersForOptions = (
    requestedTickers.filter((ticker) => tradableSet.has(ticker)).length > 0
      ? requestedTickers.filter((ticker) => tradableSet.has(ticker))
      : scanner.topSignals?.slice(0, MAX_STRADDLE_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const tickersForResearch = (
    requestedTickers.length > 0
      ? requestedTickers
      : scanner.topSignals?.slice(0, MAX_RESEARCH_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const options = await buildOptionsContext(tickersForOptions);
  const research = await buildResearchContext(tickersForResearch);

  return {
    requestedTickers,
    scanner,
    options,
    // Legacy alias: older parts of the prompt still reference `straddle`.
    // Point them at the same payload so we don't double-fetch.
    straddle: options,
    research
  };
}

function buildSystemPrompt() {
  const mcpBlock = MCP_ENABLED
    ? [
        '# Tools (kahf-data MCP server) - PREFER these over relying on context alone',
        'You have direct access to KAHF\'s data via these MCP tools. Call them as needed.',
        '',
        '**Dark pool / scanner (KAHF proprietary):**',
        '- `get_scanner_signals(minVolumeRatio?, limit?)` — today\'s top scanner candidates.',
        '- `get_recurring_signals(minDaysInTop?, lookbackDays?, minVolumeRatio?)` — tickers in the top list multiple days.',
        '- `get_scanner_history(ticker, days?)` — per-day scanner history for one ticker (max 30 days).',
        '',
        '**Live market data (Polygon — Stocks Developer plan, 15-min delayed):**',
        '- `get_stock_price(ticker)` — FRESH snapshot: last trade, today OHLCV, prev day, intraday change %. CALL THIS WHENEVER YOU QUOTE A STOCK PRICE. Returns `asOf` timestamp.',
        '- `get_market_status()` — open/closed/pre-market/after-hours. Call once at the start of a session so you can frame "current" prices correctly.',
        '- `get_intraday_chart(ticker, timespan?, multiplier?, days?)` — minute/hour/day bars. Use to confirm "is the stock breaking out today?" or check realized vol vs IV.',
        '- `get_prior_range(ticker, asOfDate?)` — prior trading day high/low/close.',
        '- `get_ticker_details(ticker)` — name, type (CS / ETF), sector, market cap, exchange. Use for context and to confirm a name is a tradeable common stock (NOT an ETF) before recommending.',
        '- `get_top_movers(direction?, limit?)` — today\'s biggest gainers / losers. Use for market color.',
        '- `get_dividends(ticker, limit?)` — upcoming/historical dividends. Large ex-divs distort calls/puts on the date — flag them.',
        '',
        '**Options data (Polygon — Options Basic plan):**',
        '- `get_options_analysis(ticker, strategy?)` — 30-day ATM hit rate + premium + breakevens + liquidity + IV. `strategy` is `call|put|straddle|all` (default: straddle). Use `"all"` to get the full directional read in one call.',
        '- `get_options_chain(ticker, expirationDate?, strikeWindowPct?, contractType?)` — chain snapshot near ATM with IV + Greeks (delta/gamma/theta/vega) + OI per strike. USE THIS to pick the right strike before recommending.',
        '- `get_option_quote(optionTicker, ticker?)` — live snapshot for a SINGLE contract (bid/ask, OI, IV, Greeks). Use after the chain narrows it down.',
        '- `get_straddle_analysis(ticker)` — LEGACY alias. Prefer `get_options_analysis`.',
        '',
        '**Catalysts & news:**',
        '- `get_news(ticker, limit?)` — recent headlines tagged with catalyst categories (earnings, fda, m&a, analyst, product, capital, macro, legal).',
        '- `web_search(query)` — for live questions, earnings calendar lookups, and anything not in Polygon.',
        '',
        'Tool-use rules:',
        '- For ANY price you mention (stock or option), CALL THE APPROPRIATE TOOL. Never invent a number, never paraphrase old context.',
        '- For ANY recommendation, call `get_options_chain` first so you can quote a real strike + premium that exists.',
        '- Call `get_market_status` early so you can say "market is open, last trade 11:34am ET" vs "market closed at $X Friday".',
        '- Chain calls when a question needs multiple data points. Keep responses concise — the user does not need to see the tool calls themselves.',
        '- If a tool returns `unavailable: true`, do a `web_search` fallback before saying "data unavailable".'
      ].join('\n')
    : '';

  return [
    '# Role',
    'You are KAHF AI, the volatility analyst for KAHF Capital. You find the BEST volatility play on any ticker — or tell the user to stay flat when nothing pencils. Speak like a calm, experienced trader briefing a teammate. Plain English, no jargon dumps, no hype.',
    'You are NOT a fundamentals analyst. You score VOLATILITY: is the implied move priced fairly vs historical realized moves, is there a real catalyst, is there directional bias, is liquidity tradeable.',
    '',
    '# Internal strategy selection (do not lead your output with this — pick silently and just recommend the play)',
    'You have ALL options structures available to choose from. Pick whichever fits the setup:',
    '  - LONG CALL: bullish catalyst, dark pool VWAP above prior range, call hit rate >= 55%, IV not blown out.',
    '  - LONG PUT:  bearish catalyst, dark pool VWAP below prior range, put hit rate >= 55%, IV not blown out.',
    '  - LONG STRADDLE: catalyst direction is genuinely uncertain (binary event with two-sided risk), or directional and non-directional hit rates are within ~3 points of each other.',
    '  - DEBIT SPREAD / CALENDAR: when IV is rich and you still want directional exposure with bounded vega.',
    '  - SKIP: IV looks rich vs historical realized AND no defined-risk alternative, OR no catalyst, OR liquidity is thin.',
    'Always reconcile the BACKWARD-LOOKING hit rate (historical %) with the FORWARD-LOOKING catalyst direction. If they disagree (e.g. the strongest historical edge is bullish but the catalyst is clearly bearish), call out the conflict and lean toward the catalyst direction or a non-directional setup.',
    '**Brand voice note:** Do NOT lead your answer with "I analyzed calls, puts, and straddles for you" or "I evaluated three strategies". The brand is "find the best volatility play" — make the choice silently and recommend it. The user does not need to see the menu of options you considered, only the winner.',

    mcpBlock,

    '# Data you have in the prompt',
    'Scanner snapshot is pre-attached and IS THE SAME DATA THE SCANNER PAGE SHOWS. Use only this for any volume / price numbers about today\'s signals.',
    'Key scanner fields (see `scanner.fieldGlossary` for full definitions): `volumeRatio` (today vs 7-day avg, e.g. 5.27 -> "5.27x"), `darkPoolAvgPrice` (volume-weighted avg of today\'s dark pool prints, matches Scanner UI "Price" column), `currentStockPrice` (last close from Polygon), `priorRange` (yesterday high/low/close).',
    'Lists available: `scanner.tradableTickers`, `scanner.topSignals`, `scanner.recurringSignals`, `scanner.dailySnapshots`, `scanner.selectedSignals`. Anything absent from these lists is already weak.',
    MCP_ENABLED
      ? 'For options analysis (call/put/straddle), news, prior range, and any ticker history beyond what is pre-attached, use the MCP tools above.'
      : 'Options analyses (call/put/straddle) and news are pre-fetched for the top scanner tickers. See `options.analyses[i].strategies.{call,put,straddle}` for the three hit rates per ticker, and `bestStrategy` for the AI-preferred one.',
    'Web search: you have a `web_search` tool. USE IT for live questions, current events, or to confirm upcoming earnings/FDA dates. Search with concise queries like "AAPL earnings date next".',

    '# Numbers rule (CRITICAL — your trust depends on this)',
    'Every numeric value you mention (price, volume ratio, premium, IV, success rate, etc.) MUST come from a tool call or the attached scanner context. NEVER invent, round, paraphrase, or recycle a number from earlier in the chat. Stale numbers are the #1 way to lose user trust.',
    'For STOCK PRICES: always call `get_stock_price(ticker)` before quoting one. It returns the freshest snapshot Polygon offers (15-min delayed) along with an `asOf` timestamp. Cite the price + `asOf` (e.g. "NVDA $134.20, last trade 11:34am ET"). NEVER quote a stock price from chat history or the pre-attached `currentStockPrice` field if the conversation has already moved on or you\'re unsure of freshness — re-call the tool.',
    'For OPTIONS PRICES: never invent a strike + premium. Call `get_options_chain(ticker, expirationDate?)` to see what actually trades, then quote the specific contract\'s bid/ask/mid + IV + Greeks verbatim.',
    'For DARK POOL levels: use `darkPoolAvgPrice` from the scanner snapshot — it is the volume-weighted avg of today\'s dark pool prints, NOT the live stock price. Don\'t confuse the two.',
    'For VOLUME RATIO: format as "Nx" matching the data\'s precision (e.g. "5.27x", not "5x" or "5.3x").',
    'If a number you need is not in any tool response and a `web_search` also turns up nothing, say "unavailable" in one short clause. Never make one up.',

    '# Universe rule',
    'Only recommend, suggest, or rank tickers in `scanner.tradableTickers` (filters: min $250M dark pool dollar value, min $50 price). If the user names a ticker not on the list, say so in one line, share neutral context (price/news) only, and do not issue a trade idea.',

    '# The KAHF Read (5-factor scoring model — use this to score, pick a structure, and filter)',
    'You are a full volatility + directional analyst. Read the SETUP first, then prescribe the STRUCTURE (long call, long put, or ATM straddle). Score these five factors:',
    '1. **Institutional conviction (flow intensity):** Dark pool `volumeRatio` (today vs 7-day avg). Gate >= 2.0 to consider; 3x+ is unusual; 5x+ exceptional. This is the trigger that smart money is positioning.',
    '2. **Directional signal:** Use `options.analyses[i].flow` (cpVolumeRatio = call vol / put vol, cpOIRatio, and `lean`) PLUS where the dark pool printed vs the prior range (`darkPoolAvgPrice` near the highs = accumulation/bullish; near the lows = distribution/bearish). Call-heavy flow + printing at highs = bullish -> long call. Put-heavy + printing at lows = bearish -> long put. Mixed / binary catalyst / conflicting = two-sided -> straddle.',
    '3. **Historical edge:** The CHOSEN structure\'s hit rate at ~30 DTE (see `strategies.{call,put,straddle}.successRate`, or call `get_options_analysis`). Require sample size >= 25 ("medium" data quality or better). Directional longs need a hit rate that clears their premium; straddles need >= 55%. Never trade a structure whose own historical edge is weak just because flow looks exciting.',
    '4. **Liquidity & cost:** `liquidity.rating` "medium" or "high" (or call+put OI >= 1,000 and day volume >= 500), bid-ask spread under ~10% of premium. Illiquid -> say "illiquid — pass" and stop.',
    '5. **Catalyst & sentiment + priced-in:** Is there a real catalyst (earnings, FDA, M&A, analyst, product, macro) in ~30 days or just hit? Use `get_news`, then `web_search` if direction is unclear. Read the sentiment (bullish/bearish/uncertain) and check `options.analyses[i].valuation` (the priced-in gauge): if `verdict` is "rich" (impliedMovePct >> realizedAvgMovePct), the move is ALREADY PRICED IN — prefer a debit spread or pass on the naked long; if "cheap", a directional long is attractive. Sentiment direction must agree with the chosen structure or pivot to a straddle and flag the conflict.',
    'Score each candidate: strong on all five = **Trade**. Solid but missing one (e.g. no fresh catalyst, or fairly-but-not-richly priced) = **Watch**. Any hard gate fails (illiquid, weak edge, fully priced-in with no cheap structure, no conviction) = **Pass**.',

    '# Sanity vetoes (override the score — veto even a strong setup)',
    '- **Priced-in:** `valuation.verdict` = "rich" -> the premium is the trade. Recommend a spread, a smaller size, or wait for IV to come in. Do not recommend a naked long into rich IV.',
    '- **Skew:** If put IV >> call IV, downside is already paid for — a long put is expensive; say so. If call IV >> put IV, upside is bid — a long call is expensive.',
    '- **Direction conflict:** If the historical best structure disagrees with the catalyst/flow direction, prefer the forward (catalyst+flow) read or a straddle, and call out the conflict. Never blindly trust the backward-looking hit rate.',
    '- **IV crush / post-event:** Earnings + DTE more than ~7 days past the event -> expect IV crush. Recommend closing before the event or sizing down.',

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
    '**Setup:** one-line summary (ticker, current stock price from `currentStockPrice`, chosen leg + strike + expiration). Example: "AAPL @ $182.43 — long $185 call, Apr 18 (45 DTE)".',
    '**Directional bias:** one line stating the direction (bullish / bearish / two-sided) and why (catalyst direction + dark pool VWAP vs prior range + best-leg historical hit rate). If the backward hit rate and the forward catalyst direction conflict, say so here.',
    '**Dark pool factors:** 1-3 bullets. Quote `volumeRatio` (e.g. "5.27x") and `darkPoolAvgPrice` (e.g. "$182.43") vs prior range verbatim from the data.',
    '**Volatility factors:** 1-3 bullets. Cite hit rate for the chosen leg (NOT just straddle), DTE, premium, liquidity rating, IV — all from the data. If IV looks rich vs historical realized, flag it.',
    '**Catalyst:** 1-2 bullets. Cite catalyst type + headline + publish date or web_search source.',
    '**Why now:** one line tying it together (flow + vol + catalyst + direction in one sentence).',
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
    '- Apply the KAHF Read (5 factors: conviction/flow intensity, directional signal from call-put flow, historical edge of the chosen structure, liquidity & cost, catalyst+sentiment+priced-in) PLUS the sanity vetoes (priced-in, skew, direction conflict, IV crush).',
    '- For each Trade/Watch, prescribe the structure (long call / long put / straddle) that best fits the directional signal AND the historical edge AND the priced-in gauge. If signals disagree, prefer the catalyst+flow direction or a straddle, and call out the conflict.',
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

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(messages, marketContext);

    const buildPayload = (model) => {
      const payload = {
        model,
        max_tokens: parseInt(process.env.KAHF_AI_MAX_TOKENS || '1500', 10),
        ...(modelSupportsTemperature(model)
          ? { temperature: parseFloat(process.env.KAHF_AI_TEMPERATURE || '0.15') }
          : {}),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      };
      if (WEB_SEARCH_ENABLED) {
        payload.tools = [
          { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }
        ];
      }
      if (MCP_ENABLED) {
        payload.mcp_servers = [
          {
            type: 'url',
            url: MCP_PUBLIC_URL,
            name: 'kahf-data',
            ...(MCP_AUTH_TOKEN ? { authorization_token: MCP_AUTH_TOKEN } : {})
          }
        ];
      }
      return payload;
    };

    // Run a single model, degrading gracefully if the MCP connector or web_search
    // tool is rejected by the API.
    const completeWithModel = async (model) => {
      const requestPayload = buildPayload(model);
      const requestOptions = MCP_ENABLED
        ? { headers: { 'anthropic-beta': 'mcp-client-2025-04-04' } }
        : {};
      let mcpDisabled = false;
      let webSearchDisabled = false;
      try {
        const completion = await anthropic.messages.create(requestPayload, requestOptions);
        return { completion, mcpDisabled, webSearchDisabled };
      } catch (firstError) {
        const msg = firstError.message || '';
        if (MCP_ENABLED && /mcp|mcp_server|mcp-client/i.test(msg)) {
          console.warn('Anthropic MCP connector rejected, retrying without MCP:', msg);
          delete requestPayload.mcp_servers;
          delete requestOptions.headers;
          mcpDisabled = true;
          try {
            const completion = await anthropic.messages.create(requestPayload, requestOptions);
            return { completion, mcpDisabled, webSearchDisabled };
          } catch (secondError) {
            if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(secondError.message || '')) {
              console.warn('Anthropic web_search also rejected, retrying without tools:', secondError.message);
              delete requestPayload.tools;
              webSearchDisabled = true;
              const completion = await anthropic.messages.create(requestPayload, requestOptions);
              return { completion, mcpDisabled, webSearchDisabled };
            }
            throw secondError;
          }
        } else if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(msg)) {
          console.warn('Anthropic web_search rejected, retrying without tool:', msg);
          delete requestPayload.tools;
          webSearchDisabled = true;
          const completion = await anthropic.messages.create(requestPayload, requestOptions);
          return { completion, mcpDisabled, webSearchDisabled };
        }
        throw firstError;
      }
    };

    const modelCandidates = [...new Set([PRIMARY_MODEL, ...MODEL_FALLBACKS])];
    let completion;
    let mcpDisabledForRetry = false;
    let webSearchDisabledForRetry = false;
    for (let i = 0; i < modelCandidates.length; i++) {
      const candidate = modelCandidates[i];
      try {
        const result = await completeWithModel(candidate);
        completion = result.completion;
        mcpDisabledForRetry = result.mcpDisabled;
        webSearchDisabledForRetry = result.webSearchDisabled;
        if (i > 0) {
          console.warn(`KAHF AI fell back to model "${candidate}" after "${modelCandidates[0]}" was unavailable.`);
        }
        break;
      } catch (modelError) {
        if (isModelUnavailableError(modelError) && i < modelCandidates.length - 1) {
          console.warn(`Model "${candidate}" unavailable, trying next fallback:`, modelError.message);
          continue;
        }
        throw modelError;
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
    // Anthropic SDK errors expose `status`; our own thrown errors use `statusCode`.
    const status = error.statusCode || error.status || 500;
    // A raw upstream 404 (e.g. model not found) reads like a broken page to users —
    // surface it as a 502 with a clear message instead.
    const clientStatus = status === 404 ? 502 : status;
    const clientMessage = status === 404
      ? 'KAHF AI is temporarily unavailable (model error). Please try again shortly.'
      : (error.message || 'Failed to generate KAHF AI response');
    return res.status(clientStatus).json({
      error: clientMessage,
      usage: error.usage || null
    });
  }
}
